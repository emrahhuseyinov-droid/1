import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, referralCommissions } from '@/lib/db/schema'
import { getDashboardBalancesAtomic } from '@/lib/dashboard'
import { calculatePepeSwapFeeAtomic, parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import {
  createHomeroSwapQuote,
  getHomeroRateNumerator,
  getHomeroSpotRate,
  getHomeroTreasuryAdminProfile,
  getHomeroTreasurySnapshot,
  HOMERO_RATE_SCALE,
  HOMERO_TREASURY_EVENT_SOURCES,
  verifyHomeroSwapQuote,
} from '@/lib/homero-treasury'
import {
  getPepeReserveSnapshot,
  isPepeReserveAdmin,
  PEPE_RESERVE_EVENT_SOURCES,
  PEPE_RESERVE_SWAP_SOURCE,
  PEPE_SWAP_COMMISSION_SOURCE,
} from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const amountText = request.nextUrl.searchParams.get('amount')
  const amountAtomic = amountText === null ? null : parsePepeAmountToAtomic(amountText)
  if (amountText !== null && amountAtomic === null) {
    return NextResponse.json({ error: 'Enter a valid positive HOMERO amount.' }, { status: 400, headers: noStoreHeaders })
  }
  if (amountText !== null) {
    const limited = await enforceApiRateLimit('homero-swap-quote', account.session.user.id, { windowSeconds: 60, max: 60 })
    if (limited) return limited
  }

  try {
    const reserveAdmin = await getHomeroTreasuryAdminProfile()
    if (!reserveAdmin) {
      return NextResponse.json({ error: 'The configured exchange administrator account is not available.' }, { status: 503, headers: noStoreHeaders })
    }

    const [balancesAtomic, pepeReserve, treasury] = await Promise.all([
      getDashboardBalancesAtomic(account.profile.id),
      getPepeReserveSnapshot(reserveAdmin.id),
      db.transaction((transaction) => getHomeroTreasurySnapshot(transaction, reserveAdmin.id)),
    ])
    const distributedAtomic = BigInt(treasury.distributedAtomic)
    const homeroRatePepePerToken = getHomeroSpotRate(distributedAtomic)
    const swapQuote = amountAtomic !== null && treasury.initialReserveSeeded
      ? createHomeroSwapQuote(amountAtomic, distributedAtomic, account.session.user.id)
      : null

    return NextResponse.json({
      balancesAtomic,
      reserveAvailableAtomic: pepeReserve.availableAtomic,
      initialReserveSeeded: pepeReserve.initialReserveSeeded,
      homeroTreasuryAvailableAtomic: treasury.availableAtomic,
      homeroDistributedAtomic: treasury.distributedAtomic,
      homeroRemainingSupplyAtomic: treasury.remainingSupplyAtomic,
      homeroTreasurySeeded: treasury.initialReserveSeeded,
      homeroRatePepePerToken,
      isReserveAdmin: isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified),
      swapQuote,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[pepe-swap] Could not load swap balances:', error)
    return NextResponse.json({ error: 'Could not load internal swap balances.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('pepe-swap', account.session.user.id, { windowSeconds: 60, max: 10 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid swap details.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  if ((input.from !== undefined && input.from !== 'HOMERO') || (input.to !== undefined && input.to !== 'PEPE')) {
    return NextResponse.json({ error: 'Only HOMERO to PEPE swaps are supported.' }, { status: 400, headers: noStoreHeaders })
  }

  const amountAtomic = parsePepeAmountToAtomic(input.amount)
  const idempotencyKey = typeof input.idempotencyKey === 'string' && uuidPattern.test(input.idempotencyKey)
    ? input.idempotencyKey.toLowerCase()
    : null
  const signedQuote = verifyHomeroSwapQuote(input.quoteToken, account.session.user.id)
  if (
    amountAtomic === null ||
    !idempotencyKey ||
    !signedQuote ||
    signedQuote.amountAtomic !== String(amountAtomic)
  ) {
    return NextResponse.json({ error: 'The exchange quote is invalid. Request a fresh quote and try again.' }, { status: 400, headers: noStoreHeaders })
  }

  const quoteAmountAtomic = BigInt(signedQuote.amountAtomic)
  const grossPepeAtomic = BigInt(signedQuote.grossPepeAtomic)
  const feeAtomic = BigInt(signedQuote.feePepeAtomic)
  const pepeCreditAtomic = BigInt(signedQuote.netPepeAtomic)
  if ([grossPepeAtomic, feeAtomic, pepeCreditAtomic].some((value) => value > BigInt(Number.MAX_SAFE_INTEGER))) {
    return NextResponse.json({ error: 'The exchange quote is too large.' }, { status: 400, headers: noStoreHeaders })
  }

  const feeAmountAtomic = Number(feeAtomic)
  const pepeCreditAmountAtomic = Number(pepeCreditAtomic)

  try {
    const reserveAdmin = await getHomeroTreasuryAdminProfile()
    if (!reserveAdmin) {
      return NextResponse.json({ error: 'The exchange administrator account is not configured.' }, { status: 503, headers: noStoreHeaders })
    }

    const result = await db.transaction(async (transaction) => {
      const profileIds = [...new Set([account.profile.id, reserveAdmin.id])].sort()
      const lockedProfiles = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(inArray(guestProfiles.id, profileIds))
        .orderBy(asc(guestProfiles.id))
        .for('update')
      if (lockedProfiles.length !== profileIds.length) return { status: 'profile_missing' as const }

      const requestKey = `${account.session.user.id}:${idempotencyKey}`
      const homeroDebitKey = `${requestKey}:homero`
      const pepeCreditKey = `${requestKey}:pepe`
      const commissionKey = `${requestKey}:commission`
      const [existingDebit] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, 'swap'),
          eq(earningEvents.sourceKey, homeroDebitKey),
        ))
        .limit(1)

      if (existingDebit) {
        const [[existingCredit], [existingReserveDebit], [existingCommission]] = await Promise.all([
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic })
            .from(earningEvents)
            .where(and(
              eq(earningEvents.guestId, account.profile.id),
              eq(earningEvents.source, 'swap'),
              eq(earningEvents.sourceKey, pepeCreditKey),
            ))
            .limit(1),
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic })
            .from(earningEvents)
            .where(and(
              eq(earningEvents.guestId, reserveAdmin.id),
              eq(earningEvents.source, PEPE_RESERVE_SWAP_SOURCE),
              eq(earningEvents.sourceKey, requestKey),
            ))
            .limit(1),
          transaction.select({ rewardAtomic: earningEvents.rewardAtomic })
            .from(earningEvents)
            .where(and(
              eq(earningEvents.guestId, reserveAdmin.id),
              eq(earningEvents.source, PEPE_SWAP_COMMISSION_SOURCE),
              eq(earningEvents.sourceKey, commissionKey),
            ))
            .limit(1),
        ])

        if (!existingCredit || !existingReserveDebit) return { status: 'ledger_inconsistent' as const }
        const oldGross = -BigInt(existingReserveDebit.rewardAtomic)
        const oldFee = BigInt(existingCommission?.rewardAtomic ?? 0)
        if (
          existingDebit.rewardAtomic !== -amountAtomic ||
          existingCredit.rewardAtomic <= 0 ||
          oldGross <= 0n ||
          BigInt(existingCredit.rewardAtomic) + oldFee !== oldGross
        ) {
          return { status: 'idempotency_conflict' as const }
        }

        return {
          status: 'completed' as const,
          homeroDebitedAtomic: amountAtomic,
          pepeGrossAtomic: Number(oldGross),
          pepeCreditedAtomic: existingCredit.rewardAtomic,
          feeAtomic: Number(oldFee),
          homeroRatePepePerToken: getHomeroSpotRate(BigInt(signedQuote.distributedAtomic)),
          alreadyProcessed: true,
        }
      }

      if (Date.now() >= signedQuote.expiresAt) return { status: 'quote_expired' as const }

      const treasury = await getHomeroTreasurySnapshot(transaction, reserveAdmin.id)
      if (!treasury.initialReserveSeeded) return { status: 'treasury_not_seeded' as const }
      const distributedAtomic = BigInt(treasury.distributedAtomic)
      if (signedQuote.distributedAtomic !== distributedAtomic.toString()) return { status: 'quote_stale' as const }
      const expectedRateNumerator = getHomeroRateNumerator(distributedAtomic)
      const expectedGross = (quoteAmountAtomic * expectedRateNumerator) / HOMERO_RATE_SCALE
      const expectedFee = calculatePepeSwapFeeAtomic(expectedGross)
      if (
        signedQuote.rateNumerator !== expectedRateNumerator.toString() ||
        grossPepeAtomic !== expectedGross ||
        feeAtomic !== expectedFee ||
        pepeCreditAtomic !== expectedGross - expectedFee
      ) return { status: 'quote_invalid' as const }

      const [homeroBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'HOMERO'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...HOMERO_TREASURY_EVENT_SOURCES]),
        ))
      const [commissionBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
        .from(referralCommissions)
        .where(and(eq(referralCommissions.referrerId, account.profile.id), eq(referralCommissions.tokenSymbol, 'HOMERO')))

      const spendableHomeroAtomic = BigInt(homeroBalance?.amount ?? '0') + BigInt(commissionBalance?.amount ?? '0')
      if (spendableHomeroAtomic < quoteAmountAtomic) return { status: 'insufficient_homero' as const }

      const [reserveBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, reserveAdmin.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          inArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES]),
        ))
      if (BigInt(reserveBalance?.amount ?? '0') < grossPepeAtomic) return { status: 'insufficient_reserve' as const }

      const now = new Date()
      await transaction.insert(earningEvents).values([
        {
          id: randomUUID(),
          guestId: account.profile.id,
          source: 'swap',
          sourceKey: homeroDebitKey,
          itemId: 'HOMERO→PEPE',
          tokenSymbol: 'HOMERO',
          rewardAtomic: -amountAtomic,
          createdAt: now,
        },
        {
          id: randomUUID(),
          guestId: account.profile.id,
          source: 'swap',
          sourceKey: pepeCreditKey,
          itemId: 'HOMERO→PEPE',
          tokenSymbol: 'PEPE',
          rewardAtomic: pepeCreditAmountAtomic,
          createdAt: now,
        },
        {
          id: randomUUID(),
          guestId: reserveAdmin.id,
          source: PEPE_RESERVE_SWAP_SOURCE,
          sourceKey: requestKey,
          itemId: 'HOMERO→PEPE reserve payout',
          tokenSymbol: 'PEPE',
          rewardAtomic: -Number(grossPepeAtomic),
          createdAt: now,
        },
      ])

      if (feeAtomic > 0n) {
        await transaction.insert(earningEvents).values({
          id: randomUUID(),
          guestId: reserveAdmin.id,
          source: PEPE_SWAP_COMMISSION_SOURCE,
          sourceKey: commissionKey,
          itemId: 'HOMERO→PEPE exchange fee',
          tokenSymbol: 'PEPE',
          rewardAtomic: feeAmountAtomic,
          createdAt: now,
        })
      }

      return {
        status: 'completed' as const,
        homeroDebitedAtomic: amountAtomic,
        pepeGrossAtomic: Number(grossPepeAtomic),
        pepeCreditedAtomic: pepeCreditAmountAtomic,
        feeAtomic: feeAmountAtomic,
        homeroRatePepePerToken: Number(expectedRateNumerator) / Number(HOMERO_RATE_SCALE),
        alreadyProcessed: false,
      }
    })

    if (result.status === 'profile_missing') {
      return NextResponse.json({ error: 'The exchange account profile could not be found.' }, { status: 404, headers: noStoreHeaders })
    }
    if (result.status === 'insufficient_homero') {
      return NextResponse.json({ error: 'Insufficient HOMERO balance.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'insufficient_reserve') {
      return NextResponse.json({ error: 'The PEPE treasury balance does not cover this quote.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'quote_expired' || result.status === 'quote_stale') {
      return NextResponse.json({ error: 'The quote expired or the curve changed. Request a fresh quote and try again.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'treasury_not_seeded') {
      return NextResponse.json({ error: 'The HOMERO treasury has not been initialized yet.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'quote_invalid') {
      return NextResponse.json({ error: 'The exchange quote could not be verified. Request a fresh quote.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'idempotency_conflict') {
      return NextResponse.json({ error: 'This request key was already used for a different swap.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'ledger_inconsistent') {
      return NextResponse.json({ error: 'The swap record could not be confirmed. Contact support before retrying.' }, { status: 500, headers: noStoreHeaders })
    }

    return NextResponse.json({
      homeroDebitedAtomic: result.homeroDebitedAtomic,
      pepeGrossAtomic: result.pepeGrossAtomic,
      pepeCreditedAtomic: result.pepeCreditedAtomic,
      feeAtomic: result.feeAtomic,
      homeroRatePepePerToken: result.homeroRatePepePerToken,
      alreadyProcessed: result.alreadyProcessed,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[pepe-swap] Could not complete HOMERO to PEPE swap:', error)
    return NextResponse.json({ error: 'Could not complete the swap. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
