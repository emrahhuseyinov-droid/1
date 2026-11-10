import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import {
  getHomeroAmmSnapshot,
  HOMERO_AMM_HOMERO_SEED_CHUNK_ATOMIC,
  HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS,
  HOMERO_AMM_HOMERO_SEED_ATOMIC,
  HOMERO_AMM_PEPE_SEED_CHUNKS_ATOMIC,
  HOMERO_AMM_PEPE_SEED_SOURCE_KEYS,
  HOMERO_AMM_PEPE_SEED_ATOMIC,
} from '@/lib/homero-amm'
import {
  HOMERO_AMM_POOL_SOURCE,
  HOMERO_TREASURY_CAP_ATOMIC,
  HOMERO_TREASURY_OUTGOING_SOURCE,
  HOMERO_TREASURY_SEED_CHUNK_ATOMIC,
  HOMERO_TREASURY_SEED_SOURCE,
  HOMERO_TREASURY_SEED_SOURCE_KEYS,
  getHomeroTreasurySnapshot,
} from '@/lib/homero-treasury'
import {
  getPepeReserveAdminProfile,
  getPepeReserveSnapshot,
  isPepeReserveAdmin,
  PEPE_AMM_POOL_SOURCE,
  PEPE_RESERVE_BASE_EVENT_SOURCES,
  PEPE_RESERVE_FUNDING_SOURCE,
  PEPE_RESERVE_INITIAL_CHUNKS_ATOMIC,
  PEPE_RESERVE_INITIAL_SOURCE_KEYS,
  PEPE_RESERVE_SWAP_SOURCE,
} from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOMERO_AMM_PEPE_RESERVE_DEBIT_KEYS = HOMERO_AMM_PEPE_SEED_SOURCE_KEYS.map((_, index) => `initial-homero-amm-pepe-reserve-out-${String(index + 1).padStart(3, '0')}`)
const HOMERO_AMM_TREASURY_DEBIT_KEYS = HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS.map((_, index) => `initial-homero-amm-treasury-out-${String(index + 1).padStart(3, '0')}`)

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  if (!isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified)) {
    return NextResponse.json({ error: 'Only the configured exchange administrator can update exchange funds.' }, { status: 403, headers: noStoreHeaders })
  }
  const limited = await enforceApiRateLimit('reserve-admin-update', account.session.user.id, { windowSeconds: 60 * 60, max: 5 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid reserve details.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const action = ['initialize', 'initialize_homero', 'initialize_amm', 'fund'].includes(String(input.action))
    ? input.action as 'initialize' | 'initialize_homero' | 'initialize_amm' | 'fund'
    : null
  if (!action) return NextResponse.json({ error: 'Unsupported reserve action.' }, { status: 400, headers: noStoreHeaders })

  const amountAtomic = action === 'fund' ? parsePepeAmountToAtomic(input.amount) : null
  const idempotencyKey = action === 'fund' && typeof input.idempotencyKey === 'string' && uuidPattern.test(input.idempotencyKey)
    ? input.idempotencyKey.toLowerCase()
    : null
  if (action === 'fund' && (amountAtomic === null || !idempotencyKey)) {
    return NextResponse.json({ error: 'Enter a valid positive PEPE amount and retry.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const adminProfile = await getPepeReserveAdminProfile()
    if (!adminProfile || adminProfile.id !== account.profile.id) {
      return NextResponse.json({ error: 'The configured exchange administrator account is not available.' }, { status: 403, headers: noStoreHeaders })
    }

    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, adminProfile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'profile_missing' as const }

      if (action === 'initialize') {
        const existingSeeds = await transaction
          .select({ sourceKey: earningEvents.sourceKey })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, adminProfile.id),
            eq(earningEvents.source, PEPE_RESERVE_FUNDING_SOURCE),
            inArray(earningEvents.sourceKey, [...PEPE_RESERVE_INITIAL_SOURCE_KEYS]),
          ))

        if (existingSeeds.length === PEPE_RESERVE_INITIAL_SOURCE_KEYS.length) return { status: 'already_initialized' as const }
        if (existingSeeds.length > 0) return { status: 'seed_inconsistent' as const }

        const now = new Date()
        await transaction.insert(earningEvents).values(
          PEPE_RESERVE_INITIAL_CHUNKS_ATOMIC.map((rewardAtomic, index) => ({
            id: randomUUID(), guestId: adminProfile.id, source: PEPE_RESERVE_FUNDING_SOURCE,
            sourceKey: PEPE_RESERVE_INITIAL_SOURCE_KEYS[index], itemId: 'Initial PEPE reserve (100M)',
            tokenSymbol: 'PEPE' as const, rewardAtomic, createdAt: now,
          })),
        ).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })

        return { status: 'initialized' as const }
      }

      if (action === 'initialize_homero') {
        const existingSeeds = await transaction
          .select({ sourceKey: earningEvents.sourceKey, rewardAtomic: earningEvents.rewardAtomic })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, adminProfile.id),
            eq(earningEvents.tokenSymbol, 'HOMERO'),
            eq(earningEvents.source, HOMERO_TREASURY_SEED_SOURCE),
            inArray(earningEvents.sourceKey, HOMERO_TREASURY_SEED_SOURCE_KEYS),
          ))

        if (existingSeeds.length === HOMERO_TREASURY_SEED_SOURCE_KEYS.length) {
          const seededAtomic = existingSeeds.reduce((total, event) => total + BigInt(event.rewardAtomic), 0n)
          return seededAtomic === HOMERO_TREASURY_CAP_ATOMIC
            ? { status: 'homero_already_initialized' as const }
            : { status: 'homero_seed_inconsistent' as const }
        }
        if (existingSeeds.length > 0) return { status: 'homero_seed_inconsistent' as const }

        const now = new Date()
        await transaction.insert(earningEvents).values(HOMERO_TREASURY_SEED_SOURCE_KEYS.map((sourceKey) => ({
          id: randomUUID(), guestId: adminProfile.id, source: HOMERO_TREASURY_SEED_SOURCE,
          sourceKey, itemId: 'Initial HOMERO treasury supply', tokenSymbol: 'HOMERO' as const,
          rewardAtomic: HOMERO_TREASURY_SEED_CHUNK_ATOMIC, createdAt: now,
        }))).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })

        return { status: 'homero_initialized' as const }
      }

      if (action === 'initialize_amm') {
        const existingPoolSeeds = await transaction
          .select({ sourceKey: earningEvents.sourceKey, rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, adminProfile.id),
            inArray(earningEvents.source, [HOMERO_AMM_POOL_SOURCE, PEPE_AMM_POOL_SOURCE]),
            inArray(earningEvents.sourceKey, [...HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS, ...HOMERO_AMM_PEPE_SEED_SOURCE_KEYS]),
          ))
        const pool = await getHomeroAmmSnapshot(transaction, adminProfile.id)
        if (pool.seeded) return { status: 'amm_already_initialized' as const }
        if (existingPoolSeeds.length > 0) return { status: 'amm_seed_inconsistent' as const }

        const pepeSeedRows = await transaction
          .select({ sourceKey: earningEvents.sourceKey })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, adminProfile.id),
            eq(earningEvents.source, PEPE_RESERVE_FUNDING_SOURCE),
            inArray(earningEvents.sourceKey, [...PEPE_RESERVE_INITIAL_SOURCE_KEYS]),
          ))
        const [pepeReserveRows] = await transaction
          .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, adminProfile.id),
            eq(earningEvents.tokenSymbol, 'PEPE'),
            inArray(earningEvents.source, [...PEPE_RESERVE_BASE_EVENT_SOURCES]),
          ))
        const treasury = await getHomeroTreasurySnapshot(transaction, adminProfile.id)
        if (pepeSeedRows.length !== PEPE_RESERVE_INITIAL_SOURCE_KEYS.length || !treasury.initialReserveSeeded) {
          return { status: 'dependencies_unseeded' as const }
        }
        if (BigInt(pepeReserveRows?.amount ?? '0') < HOMERO_AMM_PEPE_SEED_ATOMIC) return { status: 'pepe_reserve_insufficient' as const }
        if (
          !treasury.initialReserveSeeded ||
          BigInt(treasury.availableAtomic) < HOMERO_AMM_HOMERO_SEED_ATOMIC ||
          BigInt(treasury.remainingSupplyAtomic) < HOMERO_AMM_HOMERO_SEED_ATOMIC
        ) return { status: 'homero_treasury_insufficient' as const }

        const now = new Date()
        const seedEvents = [
          ...HOMERO_AMM_PEPE_SEED_CHUNKS_ATOMIC.flatMap((amount, index) => [
            {
              id: randomUUID(), guestId: adminProfile.id, source: PEPE_RESERVE_SWAP_SOURCE,
              sourceKey: HOMERO_AMM_PEPE_RESERVE_DEBIT_KEYS[index], itemId: 'Initial PEPE AMM liquidity',
              tokenSymbol: 'PEPE' as const, rewardAtomic: -amount, createdAt: now,
            },
            {
              id: randomUUID(), guestId: adminProfile.id, source: PEPE_AMM_POOL_SOURCE,
              sourceKey: HOMERO_AMM_PEPE_SEED_SOURCE_KEYS[index], itemId: 'Initial PEPE AMM liquidity',
              tokenSymbol: 'PEPE' as const, rewardAtomic: amount, createdAt: now,
            },
          ]),
          ...HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS.flatMap((sourceKey, index) => [
            {
              id: randomUUID(), guestId: adminProfile.id, source: HOMERO_TREASURY_OUTGOING_SOURCE,
              sourceKey: HOMERO_AMM_TREASURY_DEBIT_KEYS[index], itemId: 'Initial HOMERO AMM liquidity',
              tokenSymbol: 'HOMERO' as const, rewardAtomic: -HOMERO_AMM_HOMERO_SEED_CHUNK_ATOMIC, createdAt: now,
            },
            {
              id: randomUUID(), guestId: adminProfile.id, source: HOMERO_AMM_POOL_SOURCE,
              sourceKey, itemId: 'Initial HOMERO AMM liquidity',
              tokenSymbol: 'HOMERO' as const, rewardAtomic: HOMERO_AMM_HOMERO_SEED_CHUNK_ATOMIC, createdAt: now,
            },
          ]),
        ]
        await transaction.insert(earningEvents).values(seedEvents)
        return { status: 'amm_initialized' as const }
      }

      const sourceKey = `manual-${idempotencyKey}`
      const [existingFunding] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, adminProfile.id),
          eq(earningEvents.source, PEPE_RESERVE_FUNDING_SOURCE),
          eq(earningEvents.sourceKey, sourceKey),
        ))
        .limit(1)

      if (existingFunding) {
        return existingFunding.rewardAtomic === amountAtomic
          ? { status: 'funded' as const, alreadyProcessed: true }
          : { status: 'idempotency_conflict' as const }
      }

      await transaction.insert(earningEvents).values({
        id: randomUUID(), guestId: adminProfile.id, source: PEPE_RESERVE_FUNDING_SOURCE,
        sourceKey, itemId: 'Manual PEPE reserve top-up', tokenSymbol: 'PEPE',
        rewardAtomic: amountAtomic as number, createdAt: new Date(),
      })

      return { status: 'funded' as const, alreadyProcessed: false }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'The exchange account profile could not be found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'seed_inconsistent') return NextResponse.json({ error: 'The initial PEPE reserve record is incomplete. Contact support before initializing it again.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'homero_seed_inconsistent') return NextResponse.json({ error: 'The HOMERO treasury seed is incomplete or inconsistent. Contact support before initializing it again.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'amm_seed_inconsistent') return NextResponse.json({ error: 'The AMM seed is incomplete or inconsistent. Contact support before initializing it again.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'dependencies_unseeded') return NextResponse.json({ error: 'Initialize both the PEPE reserve and HOMERO treasury before seeding the pool.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'pepe_reserve_insufficient') return NextResponse.json({ error: 'The PEPE reserve does not have enough funds for the proposed 100M PEPE seed.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'homero_treasury_insufficient') return NextResponse.json({ error: 'The HOMERO treasury does not have enough funds for the proposed 500M HOMERO seed.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'idempotency_conflict') return NextResponse.json({ error: 'This funding request key was already used for a different amount.' }, { status: 409, headers: noStoreHeaders })

    const [reserve, treasury, pool] = await Promise.all([
      getPepeReserveSnapshot(adminProfile.id),
      db.transaction((transaction) => getHomeroTreasurySnapshot(transaction, adminProfile.id)),
      db.transaction((transaction) => getHomeroAmmSnapshot(transaction, adminProfile.id)),
    ])
    const homeroInitialized = result.status === 'homero_initialized' || result.status === 'homero_already_initialized'
    const ammInitialized = result.status === 'amm_initialized' || result.status === 'amm_already_initialized'
    return NextResponse.json({
      action,
      initialized: result.status === 'initialized' || result.status === 'already_initialized' || homeroInitialized || ammInitialized,
      alreadyProcessed: result.status === 'already_initialized' || result.status === 'homero_already_initialized' || result.status === 'amm_already_initialized' || (result.status === 'funded' && result.alreadyProcessed),
      reserveAvailableAtomic: reserve.availableAtomic,
      initialReserveSeeded: reserve.initialReserveSeeded,
      homeroTreasuryAvailableAtomic: treasury.availableAtomic,
      homeroRemainingSupplyAtomic: treasury.remainingSupplyAtomic,
      homeroTreasurySeeded: treasury.initialReserveSeeded,
      homeroAmmSeeded: pool.seeded,
      homeroPoolReserveAtomic: pool.homeroReserveAtomic,
      pepePoolReserveAtomic: pool.pepeReserveAtomic,
      homeroToPepeRate: pool.homeroToPepeRate,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[pepe-swap-reserve] Could not update exchange funds:', error)
    return NextResponse.json({ error: 'Could not update exchange funds. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
