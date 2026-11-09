import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { getManualFaucetRewardAtomic } from '@/lib/referral-rewards'
import { manualClaimCooldownMs, manualClaimDailyLimit } from '@/lib/manual-claim-status'

export class ManualFaucetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'cooldown' | 'daily_limit' | 'profile_missing',
    readonly cooldownUntil?: number,
  ) {
    super(message)
  }
}

function getUtcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function getManualFaucetState(guestId: string, now = new Date()) {
  const dayStart = getUtcDayStart(now)
  const [latestClaim, todayCount] = await Promise.all([
    db.select({ createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), eq(earningEvents.source, 'manual_faucet')))
      .orderBy(desc(earningEvents.createdAt))
      .limit(1),
    db.select({ count: sql<number>`count(*)::int` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'manual_faucet'),
        gte(earningEvents.createdAt, dayStart),
      )),
  ])

  const cooldownUntil = latestClaim[0]
    ? latestClaim[0].createdAt.getTime() + manualClaimCooldownMs
    : 0

  return {
    rewardAtomic: String(getManualFaucetRewardAtomic()),
    dailyLimit: manualClaimDailyLimit,
    claimsLeft: Math.max(0, manualClaimDailyLimit - (todayCount[0]?.count ?? 0)),
    cooldownUntil: cooldownUntil > now.getTime() ? cooldownUntil : 0,
    dailyResetAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export async function claimManualFaucet(guestId: string, captchaSessionId: string, now = new Date()) {
  const rewardAtomic = getManualFaucetRewardAtomic()
  const result = await db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
      .limit(1)

    if (!profile) throw new ManualFaucetError('Account profile not found.', 404, 'profile_missing')

    const [existingClaim] = await transaction
      .select({ id: earningEvents.id })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'manual_faucet'),
        eq(earningEvents.sourceKey, captchaSessionId),
      ))
      .limit(1)

    if (existingClaim) return { alreadyClaimed: true }

    const [latestClaim] = await transaction
      .select({ createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), eq(earningEvents.source, 'manual_faucet')))
      .orderBy(desc(earningEvents.createdAt))
      .limit(1)

    if (latestClaim) {
      const cooldownUntil = latestClaim.createdAt.getTime() + manualClaimCooldownMs
      if (now.getTime() < cooldownUntil) {
        throw new ManualFaucetError('Your next faucet claim is not ready yet.', 429, 'cooldown', cooldownUntil)
      }
    }

    const [todayCount] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'manual_faucet'),
        gte(earningEvents.createdAt, getUtcDayStart(now)),
      ))

    if ((todayCount?.count ?? 0) >= manualClaimDailyLimit) {
      throw new ManualFaucetError('You have reached today’s faucet claim limit.', 429, 'daily_limit')
    }

    const [credit] = await transaction
      .insert(earningEvents)
      .values({
        id: randomUUID(),
        guestId,
        source: 'manual_faucet',
        sourceKey: captchaSessionId,
        itemId: 'adslab-monetized-captcha',
        tokenSymbol: 'PEPE',
        rewardAtomic,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
      .returning({ id: earningEvents.id })

    return { alreadyClaimed: !credit }
  })

  return {
    ...result,
    rewardAtomic: String(rewardAtomic),
    state: await getManualFaucetState(guestId),
  }
}
