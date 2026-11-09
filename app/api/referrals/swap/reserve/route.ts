import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import {
  getPepeReserveAdminProfile,
  getPepeReserveSnapshot,
  isPepeReserveAdmin,
  PEPE_RESERVE_FUNDING_SOURCE,
  PEPE_RESERVE_INITIAL_CHUNKS_ATOMIC,
  PEPE_RESERVE_INITIAL_SOURCE_KEYS,
} from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const action = input.action === 'initialize' || input.action === 'fund' ? input.action : null
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
            id: randomUUID(),
            guestId: adminProfile.id,
            source: PEPE_RESERVE_FUNDING_SOURCE,
            sourceKey: PEPE_RESERVE_INITIAL_SOURCE_KEYS[index],
            itemId: 'Initial PEPE reserve (100M)',
            tokenSymbol: 'PEPE' as const,
            rewardAtomic,
            createdAt: now,
          })),
        ).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })

        return { status: 'initialized' as const }
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
        id: randomUUID(),
        guestId: adminProfile.id,
        source: PEPE_RESERVE_FUNDING_SOURCE,
        sourceKey,
        itemId: 'Manual PEPE reserve top-up',
        tokenSymbol: 'PEPE',
        rewardAtomic: amountAtomic as number,
        createdAt: new Date(),
      })

      return { status: 'funded' as const, alreadyProcessed: false }
    })

    if (result.status === 'profile_missing') {
      return NextResponse.json({ error: 'The exchange account profile could not be found.' }, { status: 404, headers: noStoreHeaders })
    }
    if (result.status === 'seed_inconsistent') {
      return NextResponse.json({ error: 'The initial reserve record is incomplete. Contact support before initializing it again.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'idempotency_conflict') {
      return NextResponse.json({ error: 'This funding request key was already used for a different amount.' }, { status: 409, headers: noStoreHeaders })
    }

    const reserve = await getPepeReserveSnapshot(adminProfile.id)
    return NextResponse.json({
      action,
      initialized: result.status === 'initialized' || result.status === 'already_initialized',
      alreadyProcessed: result.status === 'already_initialized' || (result.status === 'funded' && result.alreadyProcessed),
      reserveAvailableAtomic: reserve.availableAtomic,
      initialReserveSeeded: reserve.initialReserveSeeded,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[pepe-swap-reserve] Could not update the reserve:', error)
    return NextResponse.json({ error: 'Could not update exchange funds. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
