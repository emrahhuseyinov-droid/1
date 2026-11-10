import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { ADVERTISER_WALLET_EVENT_SOURCES } from '@/lib/advertiser-wallet'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, referralCommissions } from '@/lib/db/schema'
import { getDashboardBalancesAtomic } from '@/lib/dashboard'
import {
  calculateHomeroAmmSwap,
  createHomeroAmmQuote,
  getHomeroAmmSnapshot,
  HOMERO_AMM_EVENT_SOURCES,
  verifyHomeroAmmQuote,
  type HomeroAmmDirection,
} from '@/lib/homero-amm'
import { getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot, HOMERO_AMM_POOL_SOURCE, HOMERO_TREASURY_EVENT_SOURCES } from '@/lib/homero-treasury'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import { PEPE_AMM_POOL_SOURCE, PEPE_RESERVE_EVENT_SOURCES, PEPE_SWAP_COMMISSION_SOURCE, getPepeReserveSnapshot, isPepeReserveAdmin } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)

type SwapInputToken = 'PEPE' | 'HOMERO'
type SwapResult =
  | {
      status: 'completed'
      direction: HomeroAmmDirection
      inputToken: SwapInputToken
      outputToken: SwapInputToken
      inputAtomic: number
      outputAtomic: number
      grossOutputAtomic: number
      feePepeAtomic: number
      homeroToPepeRate: number
      alreadyProcessed: boolean
    }
  | { status: 'profile_missing' }
  | { status: 'idempotency_conflict' }
  | { status: 'ledger_inconsistent' }
  | { status: 'quote_expired' }
  | { status: 'quote_stale' }
  | { status: 'quote_invalid' }
  | { status: 'insufficient_balance' }
  | { status: 'pool_not_seeded' }

function parseDirection(from: unknown, to: unknown): HomeroAmmDirection | null {
  if (from === 'HOMERO' && to === 'PEPE') return 'HOMERO_TO_PEPE'
  if (from === 'PEPE' && to === 'HOMERO') return 'PEPE_TO_HOMERO'
  return null
}

function getTokensForDirection(direction: HomeroAmmDirection) {
  return direction === 'HOMERO_TO_PEPE'
    ? { inputToken: 'HOMERO' as const, outputToken: 'PEPE' as const }
    : { inputToken: 'PEPE' as const, outputToken: 'HOMERO' as const }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const amountText = request.nextUrl.searchParams.get('amount')
  const amountAtomic = amountText === null ? null : parsePepeAmountToAtomic(amountText)
  const requestedDirection = parseDirection(
    request.nextUrl.searchParams.get('from') ?? 'HOMERO',
    request.nextUrl.searchParams.get('to') ?? 'PEPE',
  )
  if (!requestedDirection) return NextResponse.json({ error: 'Only PEPE/HOMERO pool swaps are supported.' }, { status: 400, headers: noStoreHeaders })
  if (amountText !== null && amountAtomic === null) {
    return NextResponse.json({ error: 'Enter a valid positive token amount.' }, { status: 400, headers: noStoreHeaders })
  }
  if (amountText !== null) {
    const limited = await enforceApiRateLimit('homero-amm-quote', account.session.user.id, { windowSeconds: 60, max: 60 })
    if (limited) return limited
  }

  try {
    const adminProfile = await getHomeroTreasuryAdminProfile()
    if (!adminProfile) {
      return NextResponse.json({ error: 'The configured exchange administrator account is not available.' }, { status: 503, headers: noStoreHeaders })
    }

    const [balancesAtomic, pepeReserve, pool, treasury] = await Promise.all([
      getDashboardBalancesAtomic(account.profile.id),
      getPepeReserveSnapshot(adminProfile.id),
      db.transaction((transaction) => getHomeroAmmSnapshot(transaction, adminProfile.id)),
      db.transaction((transaction) => getHomeroTreasurySnapshot(transaction, adminProfile.id)),
    ])
    const swapQuote = amountAtomic !== null && pool.seeded
      ? createHomeroAmmQuote(requestedDirection, amountAtomic, pool, account.session.user.id)
      : null

    return NextResponse.json({
      balancesAtomic,
      reserveAvailableAtomic: pepeReserve.availableAtomic,
      initialReserveSeeded: pepeReserve.initialReserveSeeded,
      homeroTreasuryAvailableAtomic: treasury.availableAtomic,
      homeroRemainingSupplyAtomic: treasury.remainingSupplyAtomic,
      homeroTreasurySeeded: treasury.initialReserveSeeded,
      homeroAmmSeeded: pool.seeded,
      homeroPoolReserveAtomic: pool.homeroReserveAtomic,
      pepePoolReserveAtomic: pool.pepeReserveAtomic,
      homeroToPepeRate: pool.homeroToPepeRate,
      isReserveAdmin: isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified),
      swapQuote,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[homero-amm] Could not load exchange balances:', error)
    return NextResponse.json({ error: 'Could not load internal exchange balances.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('homero-amm-swap', account.session.user.id, { windowSeconds: 60, max: 10 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid swap details.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const direction = parseDirection(input.from, input.to)
  const amountAtomic = parsePepeAmountToAtomic(input.amount)
  const idempotencyKey = typeof input.idempotencyKey === 'string' && uuidPattern.test(input.idempotencyKey)
    ? input.idempotencyKey.toLowerCase()
    : null
  const signedQuote = verifyHomeroAmmQuote(input.quoteToken, account.session.user.id)
  if (!direction || !idempotencyKey || amountAtomic === null || !signedQuote || signedQuote.direction !== direction || signedQuote.amountAtomic !== String(amountAtomic)) {
    return NextResponse.json({ error: 'The exchange quote is invalid. Request a fresh quote and try again.' }, { status: 400, headers: noStoreHeaders })
  }

  const { inputToken, outputToken } = getTokensForDirection(direction)
  const amount = BigInt(amountAtomic)
  const grossOutput = BigInt(signedQuote.grossOutputAtomic)
  const feePepe = BigInt(signedQuote.feePepeAtomic)
  const netOutput = BigInt(signedQuote.netOutputAtomic)
  if ([grossOutput, feePepe, netOutput].some((value) => value > MAX_SAFE_ATOMIC)) {
    return NextResponse.json({ error: 'The exchange quote is too large.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const adminProfile = await getHomeroTreasuryAdminProfile()
    if (!adminProfile) {
      return NextResponse.json({ error: 'The exchange administrator account is not configured.' }, { status: 503, headers: noStoreHeaders })
    }

    const result = await db.transaction<SwapResult>(async (transaction) => {
      const profileIds = [...new Set([account.profile.id, adminProfile.id])].sort()
      const lockedProfiles = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(inArray(guestProfiles.id, profileIds))
        .orderBy(asc(guestProfiles.id))
        .for('update')
      if (lockedProfiles.length !== profileIds.length) return { status: 'profile_missing' }

      const requestKey = `${account.session.user.id}:${idempotencyKey}:amm`
      const inputKey = `${requestKey}:input`
      const outputKey = `${requestKey}:output`
      const poolInputKey = `${requestKey}:pool-input`
      const poolOutputKey = `${requestKey}:pool-output`
      const commissionKey = `${requestKey}:commission`
      const [existingDebit] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic, itemId: earningEvents.itemId })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.source, 'swap'), eq(earningEvents.sourceKey, inputKey)))
        .limit(1)

      if (existingDebit) {
        const [[existingCredit], [existingPoolInput], [existingPoolOutput], [existingCommission]] = await Promise.all([
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol }).from(earningEvents)
            .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.source, 'swap'), eq(earningEvents.sourceKey, outputKey))).limit(1),
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol }).from(earningEvents)
            .where(and(eq(earningEvents.guestId, adminProfile.id), eq(earningEvents.source, HOMERO_AMM_POOL_SOURCE), eq(earningEvents.sourceKey, poolInputKey))).limit(1),
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol }).from(earningEvents)
            .where(and(eq(earningEvents.guestId, adminProfile.id), eq(earningEvents.source, HOMERO_AMM_POOL_SOURCE), eq(earningEvents.sourceKey, poolOutputKey))).limit(1),
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic }).from(earningEvents)
            .where(and(eq(earningEvents.guestId, adminProfile.id), eq(earningEvents.source, PEPE_SWAP_COMMISSION_SOURCE), eq(earningEvents.sourceKey, commissionKey))).limit(1),
        ])
        const expectedPoolInput = direction === 'PEPE_TO_HOMERO' ? amount - feePepe : amount
        const expectedCommission = feePepe
        if (!existingCredit || !existingPoolInput || !existingPoolOutput) return { status: 'ledger_inconsistent' }
        if (
          existingDebit.rewardAtomic !== -amountAtomic || existingDebit.itemId !== direction ||
          existingCredit.tokenSymbol !== outputToken || existingCredit.rewardAtomic !== Number(netOutput) ||
          existingPoolInput.tokenSymbol !== inputToken || BigInt(existingPoolInput.rewardAtomic) !== expectedPoolInput ||
          existingPoolOutput.tokenSymbol !== outputToken || BigInt(existingPoolOutput.rewardAtomic) !== -grossOutput ||
          (expectedCommission > 0n && BigInt(existingCommission?.rewardAtomic ?? 0) !== expectedCommission)
        ) return { status: 'idempotency_conflict' }

        return {
          status: 'completed', direction, inputToken, outputToken,
          inputAtomic: amountAtomic,
          outputAtomic: Number(netOutput),
          grossOutputAtomic: Number(grossOutput),
          feePepeAtomic: Number(feePepe),
          homeroToPepeRate: Number(BigInt(signedQuote.pepeReserveAtomic)) / Number(BigInt(signedQuote.homeroReserveAtomic)),
          alreadyProcessed: true,
        }
      }

      if (Date.now() >= signedQuote.expiresAt) return { status: 'quote_expired' }

      const pool = await getHomeroAmmSnapshot(transaction, adminProfile.id)
      if (!pool.seeded) return { status: 'pool_not_seeded' }
      if (pool.homeroReserveAtomic !== signedQuote.homeroReserveAtomic || pool.pepeReserveAtomic !== signedQuote.pepeReserveAtomic) {
        return { status: 'quote_stale' }
      }
      const recomputed = calculateHomeroAmmSwap(direction, amountAtomic, BigInt(pool.homeroReserveAtomic), BigInt(pool.pepeReserveAtomic))
      if (!recomputed || recomputed.grossOutputAtomic !== grossOutput || recomputed.feePepeAtomic !== feePepe || recomputed.netOutputAtomic !== netOutput) {
        return { status: 'quote_invalid' }
      }

      const excludedSources = [
        ...PEPE_RESERVE_EVENT_SOURCES,
        ...ADVERTISER_WALLET_EVENT_SOURCES,
        ...HOMERO_TREASURY_EVENT_SOURCES,
        ...HOMERO_AMM_EVENT_SOURCES,
      ]
      const [balanceRow] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, inputToken),
          notInArray(earningEvents.source, excludedSources),
        ))
      let spendableAtomic = BigInt(balanceRow?.amount ?? '0')
      if (inputToken === 'HOMERO') {
        const [commissionRow] = await transaction
          .select({ amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
          .from(referralCommissions)
          .where(eq(referralCommissions.referrerId, account.profile.id))
        spendableAtomic += BigInt(commissionRow?.amount ?? '0')
      }
      if (spendableAtomic < amount) return { status: 'insufficient_balance' }

      const poolInputAtomic = direction === 'PEPE_TO_HOMERO' ? amount - feePepe : amount
      const poolInputNumber = Number(poolInputAtomic)
      const poolOutputNumber = Number(grossOutput)
      const outputNumber = Number(netOutput)
      const feeNumber = Number(feePepe)
      if ([poolInputNumber, poolOutputNumber, outputNumber, feeNumber].some((value) => !Number.isSafeInteger(value))) {
        return { status: 'quote_invalid' }
      }

      const now = new Date()
      const events = [
        {
          id: randomUUID(), guestId: account.profile.id, source: 'swap', sourceKey: inputKey,
          itemId: direction, tokenSymbol: inputToken, rewardAtomic: -amountAtomic, createdAt: now,
        },
        {
          id: randomUUID(), guestId: account.profile.id, source: 'swap', sourceKey: outputKey,
          itemId: direction, tokenSymbol: outputToken, rewardAtomic: outputNumber, createdAt: now,
        },
        {
          id: randomUUID(), guestId: adminProfile.id, source: HOMERO_AMM_POOL_SOURCE, sourceKey: poolInputKey,
          itemId: `${direction} pool input`, tokenSymbol: inputToken, rewardAtomic: poolInputNumber, createdAt: now,
        },
        {
          id: randomUUID(), guestId: adminProfile.id, source: HOMERO_AMM_POOL_SOURCE, sourceKey: poolOutputKey,
          itemId: `${direction} pool output`, tokenSymbol: outputToken, rewardAtomic: -poolOutputNumber, createdAt: now,
        },
      ]
      await transaction.insert(earningEvents).values(events)
      if (feeNumber > 0) {
        await transaction.insert(earningEvents).values({
          id: randomUUID(), guestId: adminProfile.id, source: PEPE_SWAP_COMMISSION_SOURCE,
          sourceKey: commissionKey, itemId: `${direction} AMM fee`, tokenSymbol: 'PEPE',
          rewardAtomic: feeNumber, createdAt: now,
        })
      }

      const [confirmedDebit] = await transaction
        .select({ id: earningEvents.id })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.source, 'swap'), eq(earningEvents.sourceKey, inputKey)))
        .limit(1)
      if (!confirmedDebit) return { status: 'ledger_inconsistent' }

      return {
        status: 'completed', direction, inputToken, outputToken,
        inputAtomic: amountAtomic,
        outputAtomic: outputNumber,
        grossOutputAtomic: poolOutputNumber,
        feePepeAtomic: feeNumber,
        homeroToPepeRate: pool.homeroToPepeRate,
        alreadyProcessed: false,
      }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'The exchange account profile could not be found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'insufficient_balance') return NextResponse.json({ error: 'Insufficient balance for this swap.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'pool_not_seeded') return NextResponse.json({ error: 'The HOMERO exchange pool has not been initialized yet.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'quote_expired' || result.status === 'quote_stale') return NextResponse.json({ error: 'The quote expired or pool reserves changed. Request a fresh quote.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'quote_invalid') return NextResponse.json({ error: 'The exchange quote could not be verified. Request a fresh quote.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'idempotency_conflict') return NextResponse.json({ error: 'This request key was already used for a different swap.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'ledger_inconsistent') return NextResponse.json({ error: 'The swap record could not be confirmed. Contact support before retrying.' }, { status: 500, headers: noStoreHeaders })

    return NextResponse.json({
      direction: result.direction,
      inputToken: result.inputToken,
      outputToken: result.outputToken,
      inputAtomic: result.inputAtomic,
      grossOutputAtomic: result.grossOutputAtomic,
      outputAtomic: result.outputAtomic,
      feePepeAtomic: result.feePepeAtomic,
      homeroToPepeRate: result.homeroToPepeRate,
      alreadyProcessed: result.alreadyProcessed,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[homero-amm] Could not complete pool swap:', error)
    return NextResponse.json({ error: 'Could not complete the swap. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
