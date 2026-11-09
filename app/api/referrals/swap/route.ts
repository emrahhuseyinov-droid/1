import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, referralCommissions } from '@/lib/db/schema'
import { ADVERTISER_WALLET_EVENT_SOURCES } from '@/lib/advertiser-wallet'
import { getDashboardOverview } from '@/lib/dashboard'
import { calculatePepeSwapFeeAtomic, parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import {
  getPepeReserveAdminProfile,
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

  try {
    const reserveAdmin = await getPepeReserveAdminProfile()
    if (!reserveAdmin) {
      return NextResponse.json({ error: 'The configured exchange administrator account is not available.' }, { status: 503, headers: noStoreHeaders })
    }

    const [overview, reserve] = await Promise.all([
      getDashboardOverview(account.profile.id),
      getPepeReserveSnapshot(reserveAdmin.id),
    ])

    return NextResponse.json({
      balancesAtomic: overview.balancesAtomic,
      reserveAvailableAtomic: reserve.availableAtomic,
      initialReserveSeeded: reserve.initialReserveSeeded,
      isReserveAdmin: isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified),
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
  if (amountAtomic === null || !idempotencyKey) {
    return NextResponse.json({ error: 'Enter a valid positive amount and retry the exchange.' }, { status: 400, headers: noStoreHeaders })
  }

  const feeAtomic = calculatePepeSwapFeeAtomic(amountAtomic)
  const feeAmountAtomic = Number(feeAtomic)
  const pepeCreditAtomic = BigInt(amountAtomic) - feeAtomic
  const pepeCreditAmountAtomic = Number(pepeCreditAtomic)

  try {
    const reserveAdmin = await getPepeReserveAdminProfile()
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
        if (
          existingDebit.rewardAtomic !== -amountAtomic ||
          existingReserveDebit.rewardAtomic !== -amountAtomic
        ) {
          return { status: 'idempotency_conflict' as const }
        }

        if (existingCommission) {
          if (
            existingCommission.rewardAtomic !== feeAmountAtomic ||
            existingCredit.rewardAtomic !== pepeCreditAmountAtomic
          ) {
            return { status: 'idempotency_conflict' as const }
          }

          return {
            status: 'completed' as const,
            homeroDebitedAtomic: amountAtomic,
            pepeCreditedAtomic: pepeCreditAmountAtomic,
            feeAtomic: feeAmountAtomic,
            alreadyProcessed: true,
          }
        }

        if (existingCredit.rewardAtomic !== amountAtomic) {
          return { status: 'idempotency_conflict' as const }
        }

        return {
          status: 'completed' as const,
          homeroDebitedAtomic: amountAtomic,
          pepeCreditedAtomic: amountAtomic,
          feeAtomic: 0,
          alreadyProcessed: true,
        }
      }

      const [homeroBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'HOMERO'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES]),
        ))
      const [commissionBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
        .from(referralCommissions)
        .where(eq(referralCommissions.referrerId, account.profile.id))

      const spendableHomeroAtomic = BigInt(homeroBalance?.amount ?? '0') + BigInt(commissionBalance?.amount ?? '0')
      if (spendableHomeroAtomic < BigInt(amountAtomic)) return { status: 'insufficient_homero' as const }

      const [reserveBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, reserveAdmin.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          inArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES]),
        ))
      const availableReserveAtomic = BigInt(reserveBalance?.amount ?? '0')
      if (availableReserveAtomic < BigInt(amountAtomic)) return { status: 'insufficient_reserve' as const }

      const [pepeBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
        ))
      const currentPepeAtomic = BigInt(pepeBalance?.amount ?? '0')
      if (currentPepeAtomic + BigInt(amountAtomic) > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { status: 'balance_limit' as const }
      }

      const [adminPepeBalance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, reserveAdmin.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
        ))
      const currentAdminPepeAtomic = BigInt(adminPepeBalance?.amount ?? '0')
      if (currentAdminPepeAtomic + feeAtomic > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { status: 'admin_balance_limit' as const }
      }

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
          rewardAtomic: -amountAtomic,
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
        pepeCreditedAtomic: pepeCreditAmountAtomic,
        feeAtomic: feeAmountAtomic,
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
      return NextResponse.json({ error: 'The exchange balance does not cover this amount.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'balance_limit') {
      return NextResponse.json({ error: 'The resulting PEPE balance would exceed the precise internal ledger limit.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'admin_balance_limit') {
      return NextResponse.json({ error: 'The admin PEPE balance would exceed the precise internal ledger limit.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'idempotency_conflict') {
      return NextResponse.json({ error: 'This request key was already used for a different swap amount.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'ledger_inconsistent') {
      return NextResponse.json({ error: 'The swap record could not be confirmed. Contact support before retrying.' }, { status: 500, headers: noStoreHeaders })
    }

    return NextResponse.json({
      homeroDebitedAtomic: result.homeroDebitedAtomic,
      pepeCreditedAtomic: result.pepeCreditedAtomic,
      feeAtomic: result.feeAtomic,
      alreadyProcessed: result.alreadyProcessed,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[pepe-swap] Could not complete HOMERO to PEPE swap:', error)
    return NextResponse.json({ error: 'Could not complete the swap. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
