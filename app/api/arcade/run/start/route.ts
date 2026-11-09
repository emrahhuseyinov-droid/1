import { randomInt, randomUUID } from 'node:crypto'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcadeInventory, arcadeProfiles, arcadeSessions, earningEvents } from '@/lib/db/schema'
import { ARCADE_DAILY_RUN_LIMIT, ARCADE_HEARTBEAT_GRACE_MS, ARCADE_HOMERO_COIN_MAX_REWARD_ATOMIC, getArcadeHomeroCoinsRemaining, type ArcadeBoostCode } from '@/lib/arcade-gameplay'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, isRecord, lockArcadeProfile, readJsonBody } from '@/lib/arcade-service'

export const runtime = 'nodejs'
const boostCodes = new Set<ArcadeBoostCode>(['jetpack', 'shield'])

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response

  const body = await readJsonBody(request)
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid run request.' }, { status: 400, headers: arcadeNoStoreHeaders })

  const mode = body.mode === 'casual' ? 'casual' : body.mode === 'ranked' || body.mode === undefined ? 'ranked' : null
  const requestedBoosts = body.boostCodes === undefined ? [] : body.boostCodes
  if (!mode || !Array.isArray(requestedBoosts) || requestedBoosts.length > 2 || requestedBoosts.some((code) => typeof code !== 'string' || !boostCodes.has(code as ArcadeBoostCode))) {
    return NextResponse.json({ error: 'Choose a valid run mode and boost set.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  const selectedBoosts = [...new Set(requestedBoosts as ArcadeBoostCode[])]
  if (mode === 'ranked' && selectedBoosts.length > 0) {
    return NextResponse.json({ error: 'Boosts are available in casual runs only.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const profile = await lockArcadeProfile(transaction, access.guestId)
      const [coinEarnings] = await transaction
        .select({ rewardAtomic: sql<number>`least(coalesce(sum(${earningEvents.rewardAtomic}), 0), ${ARCADE_HOMERO_COIN_MAX_REWARD_ATOMIC})::double precision` })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, access.guestId), eq(earningEvents.source, 'arcade_homero_coin')))
      const homeroCoinsRemaining = getArcadeHomeroCoinsRemaining(coinEarnings?.rewardAtomic ?? 0)
      const now = new Date()
      const [runningSession] = await transaction
        .select({ id: arcadeSessions.id, lastHeartbeatAt: arcadeSessions.lastHeartbeatAt, pausedAt: arcadeSessions.pausedAt })
        .from(arcadeSessions)
        .where(and(eq(arcadeSessions.guestId, access.guestId), eq(arcadeSessions.status, 'running')))
        .for('update')
        .limit(1)
      if (runningSession) {
        if (!runningSession.pausedAt && now.getTime() - runningSession.lastHeartbeatAt.getTime() <= ARCADE_HEARTBEAT_GRACE_MS) {
          return { status: 'already_running' as const }
        }
        await transaction
          .update(arcadeSessions)
          .set({ status: 'abandoned', finishedAt: now })
          .where(eq(arcadeSessions.id, runningSession.id))
      }

      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const [dailyRuns] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(arcadeSessions)
        .where(and(
          eq(arcadeSessions.guestId, access.guestId),
          gte(arcadeSessions.startedAt, dayStart),
          lt(arcadeSessions.startedAt, nextDayStart),
        ))
      if ((dailyRuns?.count ?? 0) >= ARCADE_DAILY_RUN_LIMIT) return { status: 'daily_limit' as const }
      if (mode === 'ranked' && profile.energy < 1) return { status: 'no_energy' as const, energy: profile.energy }

      for (const boostCode of selectedBoosts) {
        const [inventoryItem] = await transaction
          .select({ quantity: arcadeInventory.quantity })
          .from(arcadeInventory)
          .where(and(eq(arcadeInventory.guestId, access.guestId), eq(arcadeInventory.boostCode, boostCode)))
          .for('update')
          .limit(1)
        if (!inventoryItem || inventoryItem.quantity < 1) return { status: 'missing_boost' as const, boostCode }
        await transaction
          .update(arcadeInventory)
          .set({ quantity: inventoryItem.quantity - 1, updatedAt: now })
          .where(and(eq(arcadeInventory.guestId, access.guestId), eq(arcadeInventory.boostCode, boostCode)))
      }

      let extraLives = 0
      if (mode === 'ranked') {
        const [lifeItem] = await transaction
          .select({ quantity: arcadeInventory.quantity })
          .from(arcadeInventory)
          .where(and(eq(arcadeInventory.guestId, access.guestId), eq(arcadeInventory.boostCode, 'life')))
          .for('update')
          .limit(1)
        if (lifeItem && lifeItem.quantity > 0) {
          await transaction
            .update(arcadeInventory)
            .set({ quantity: lifeItem.quantity - 1, updatedAt: now })
            .where(and(eq(arcadeInventory.guestId, access.guestId), eq(arcadeInventory.boostCode, 'life')))
          extraLives = 1
        }
      }

      let remainingEnergy = profile.energy
      if (mode === 'ranked') {
        const [updatedProfile] = await transaction
          .update(arcadeProfiles)
          .set({ energy: profile.energy - 1, updatedAt: now })
          .where(eq(arcadeProfiles.guestId, access.guestId))
          .returning({ energy: arcadeProfiles.energy })
        if (!updatedProfile) throw new Error('Could not spend arcade energy.')
        remainingEnergy = updatedProfile.energy
      }

      const sessionId = randomUUID()
      const runSeed = randomInt(0, 2_147_483_647)
      await transaction.insert(arcadeSessions).values({
        id: sessionId,
        guestId: access.guestId,
        mode,
        status: 'running',
        runSeed,
        boostCodes: selectedBoosts,
        extraLives,
        actionLog: [],
        distanceM: 0,
        startedAt: now,
        lastHeartbeatAt: now,
        createdAt: now,
      })

      return {
        status: 'started' as const,
        sessionId,
        runSeed,
        mode,
        boostCodes: selectedBoosts,
        extraLives,
        homeroCoinsRemaining,
        homeroCoinsEnabled: mode === 'ranked' && selectedBoosts.length === 0 && homeroCoinsRemaining > 0,
        startedAt: now.toISOString(),
        energy: remainingEnergy,
      }
    })

    if (result.status === 'already_running') return NextResponse.json({ error: 'Finish or close your active run first.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'daily_limit') return NextResponse.json({ error: 'You have reached the daily limit of 7 arcade runs.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'no_energy') return NextResponse.json({ error: 'You need 1 energy to start a run.', energy: result.energy }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'missing_boost') return NextResponse.json({ error: `You do not have a ${result.boostCode} boost.` }, { status: 409, headers: arcadeNoStoreHeaders })

    return NextResponse.json(result, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-run-start] Could not start run:', error)
    return NextResponse.json({ error: 'Could not start the arcade run.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
