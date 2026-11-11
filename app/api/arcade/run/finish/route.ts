import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcadeInventory, arcadeProfiles, arcadeSessions } from '@/lib/db/schema'
import { ARCADE_HEARTBEAT_GRACE_MS, getArcadeMaximumDistanceM, ARCADE_HOMERO_COIN_REWARD_ATOMIC, ARCADE_MAX_JUMPS, getArcadeHomeroCoinsRemaining, simulateArcadeRun } from '@/lib/arcade-gameplay'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, createMilestoneClaims, isRecord, isUuid, lockArcadeProfile, readJsonBody, settlePendingArcadeRewards } from '@/lib/arcade-service'
import { getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot, lockHomeroTreasuryProfiles, recordHomeroTreasuryTransfer, HOMERO_TREASURY_CAP_ATOMIC } from '@/lib/homero-treasury'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response

  const body = await readJsonBody(request)
  if (!isRecord(body) || !isUuid(body.sessionId) || !Array.isArray(body.jumpTimes) || body.jumpTimes.length > ARCADE_MAX_JUMPS || body.jumpTimes.some((time) => typeof time !== 'number' || !Number.isSafeInteger(time))) {
    return NextResponse.json({ error: 'Invalid run results.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  const sessionId = body.sessionId
  const jumpTimes = body.jumpTimes as number[]

  try {
    const homeroTreasuryAdmin = await getHomeroTreasuryAdminProfile()
    const result = await db.transaction(async (transaction) => {
      const profile = await lockArcadeProfile(transaction, access.guestId)
      const [session] = await transaction
        .select()
        .from(arcadeSessions)
        .where(and(eq(arcadeSessions.id, sessionId), eq(arcadeSessions.guestId, access.guestId)))
        .for('update')
        .limit(1)
      if (!session) return { status: 'not_found' as const }
      if (session.status !== 'running') return { status: 'closed' as const }

      const now = new Date()
      if (session.pausedAt) return { status: 'paused' as const }
      const elapsedMs = now.getTime() - session.startedAt.getTime() - session.pausedDurationMs
      if (now.getTime() - session.lastHeartbeatAt.getTime() > ARCADE_HEARTBEAT_GRACE_MS) {
        await transaction.update(arcadeSessions).set({ status: 'abandoned', finishedAt: now }).where(eq(arcadeSessions.id, session.id))
        return { status: 'stale' as const }
      }
      if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 600 || jumpTimes.some((time) => time < 0 || time > elapsedMs + 250) || jumpTimes.some((time, index) => index > 0 && time <= jumpTimes[index - 1])) {
        await transaction.update(arcadeSessions).set({ status: 'invalid', finishedAt: now }).where(eq(arcadeSessions.id, session.id))
        return { status: 'invalid' as const }
      }

      let treasuryBalanceAtomic = 0n
      let treasuryDistributedAtomic = 0n
      let treasuryReady = false
      if (homeroTreasuryAdmin) {
        await lockHomeroTreasuryProfiles(transaction, [homeroTreasuryAdmin.id, access.guestId])
        const treasury = await getHomeroTreasurySnapshot(transaction, homeroTreasuryAdmin.id)
        treasuryBalanceAtomic = BigInt(treasury.availableAtomic)
        treasuryDistributedAtomic = BigInt(treasury.distributedAtomic)
        treasuryReady = treasury.initialReserveSeeded
      }

      const canEarnHomeroCoins = session.mode === 'ranked' && session.boostCodes.length === 0 && treasuryReady
      const playerCoinLimit = getArcadeHomeroCoinsRemaining(0)
      const treasuryCoinLimit = Number(treasuryBalanceAtomic / BigInt(ARCADE_HOMERO_COIN_REWARD_ATOMIC))
      const supplyCoinLimit = Number((HOMERO_TREASURY_CAP_ATOMIC - treasuryDistributedAtomic) / BigInt(ARCADE_HOMERO_COIN_REWARD_ATOMIC))
      const homeroCoinsRemaining = canEarnHomeroCoins ? Math.min(playerCoinLimit, treasuryCoinLimit, supplyCoinLimit) : 0
      const score = simulateArcadeRun(session.runSeed, jumpTimes, session.boostCodes, elapsedMs, session.extraLives, homeroCoinsRemaining > 0, homeroCoinsRemaining)
      const maximumDistanceM = getArcadeMaximumDistanceM(elapsedMs, session.boostCodes)
      if (!score.valid || score.distanceM < 0 || score.distanceM > maximumDistanceM) {
        await transaction.update(arcadeSessions).set({ status: 'invalid', finishedAt: now }).where(eq(arcadeSessions.id, session.id))
        return { status: 'invalid' as const }
      }
      if (!score.finished) return { status: 'incomplete' as const }

      const [completed] = await transaction
        .update(arcadeSessions)
        .set({ status: 'completed', distanceM: score.distanceM, actionLog: jumpTimes, finishedAt: now, lastHeartbeatAt: now, pausedAt: null })
        .where(and(eq(arcadeSessions.id, session.id), eq(arcadeSessions.status, 'running')))
        .returning({ id: arcadeSessions.id })
      if (!completed) return { status: 'closed' as const }

      if (session.extraLives > 0 && score.livesRemaining > 0) {
        await transaction
          .insert(arcadeInventory)
          .values({ guestId: access.guestId, boostCode: 'life', quantity: 1, updatedAt: now })
          .onConflictDoUpdate({
            target: [arcadeInventory.guestId, arcadeInventory.boostCode],
            set: { quantity: 1, updatedAt: now },
          })
      }

      let bestDistanceM = profile.bestDistanceM
      let totalRuns = profile.totalRuns
      if (session.mode === 'ranked') {
        const [updatedProfile] = await transaction
          .update(arcadeProfiles)
          .set({
            bestDistanceM: sql`greatest(${arcadeProfiles.bestDistanceM}, ${score.distanceM})`,
            totalRuns: sql`${arcadeProfiles.totalRuns} + 1`,
            updatedAt: now,
          })
          .where(eq(arcadeProfiles.guestId, access.guestId))
          .returning({ bestDistanceM: arcadeProfiles.bestDistanceM, totalRuns: arcadeProfiles.totalRuns })
        if (!updatedProfile) throw new Error('Could not update arcade profile.')
        bestDistanceM = updatedProfile.bestDistanceM
        totalRuns = updatedProfile.totalRuns
      }

      const eligibleCoinMilestones = canEarnHomeroCoins
        ? score.collectedHomeroCoinMilestones.slice(0, homeroCoinsRemaining)
        : []
      let creditedCoinCount = 0
      if (homeroTreasuryAdmin && treasuryReady) {
        for (const milestoneM of eligibleCoinMilestones) {
          const rewardAtomic = ARCADE_HOMERO_COIN_REWARD_ATOMIC
          const rewardBigInt = BigInt(rewardAtomic)
          if (rewardBigInt > treasuryBalanceAtomic || treasuryDistributedAtomic + rewardBigInt > HOMERO_TREASURY_CAP_ATOMIC) break
          await recordHomeroTreasuryTransfer(
            transaction,
            homeroTreasuryAdmin.id,
            access.guestId,
            rewardAtomic,
            `${session.id}:${milestoneM}`,
            'arcade_homero_coin',
            `${milestoneM}m`,
            now,
          )
          treasuryBalanceAtomic -= rewardBigInt
          treasuryDistributedAtomic += rewardBigInt
          creditedCoinCount += 1
        }
      }
      const newClaims = await createMilestoneClaims(transaction, access.guestId, score.distanceM, session.id, now)
      const settled = await settlePendingArcadeRewards(transaction, now, homeroTreasuryAdmin?.id)
      return {
        status: 'completed' as const,
        distanceM: score.distanceM,
        hits: score.hits,
        bestDistanceM,
        totalRuns,
        ranked: session.mode === 'ranked' && session.boostCodes.length === 0,
        homeroCoinsCollected: creditedCoinCount,
        homeroRewardAtomic: String(creditedCoinCount * ARCADE_HOMERO_COIN_REWARD_ATOMIC),
        queuedMilestones: newClaims,
        paidRewards: settled.paidCount,
        reserveBalanceAtomic: String(settled.balanceAtomic),
        homeroTreasuryBalanceAtomic: settled.homeroTreasuryBalanceAtomic,
      }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Run not found.' }, { status: 404, headers: arcadeNoStoreHeaders })
    if (result.status === 'closed') return NextResponse.json({ error: 'This run has already ended.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'stale') return NextResponse.json({ error: 'The run ended because its heartbeat expired.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'paused') return NextResponse.json({ error: 'Resume the run before saving it.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'incomplete') return NextResponse.json({ error: 'The server replay has not reached a collision yet.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'invalid') return NextResponse.json({ error: 'Run input or score validation failed.' }, { status: 422, headers: arcadeNoStoreHeaders })
    return NextResponse.json(result, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-run-finish] Could not finish run:', error)
    return NextResponse.json({ error: 'Could not save the arcade result.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
