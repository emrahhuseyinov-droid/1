import 'server-only'

import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { getManualFaucetRewardAtomic } from '@/lib/referral-rewards'
import { manualClaimCooldownMs, manualClaimDailyLimit } from '@/lib/manual-claim-status'
import { convertPepeAtomicToHomeroAtomic, getHomeroAmmSnapshot, HomeroAmmUnavailableError, HomeroTreasuryInsufficientError, issueHomeroRewardForPepe } from '@/lib/homero-amm'
import { getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot, lockHomeroTreasuryProfiles } from '@/lib/homero-treasury'

export class ManualFaucetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'cooldown' | 'daily_limit' | 'profile_missing' | 'exchange_unavailable' | 'treasury_insufficient',
    readonly cooldownUntil?: number,
  ) {
    super(message)
  }
}

function getUtcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

async function getManualFaucetRewardQuote() {
  const adminProfile = await getHomeroTreasuryAdminProfile()
  if (!adminProfile) return { rewardAtomic: '0', rewardAvailable: false }

  return db.transaction(async (transaction) => {
    const [pool, treasury] = await Promise.all([
      getHomeroAmmSnapshot(transaction, adminProfile.id),
      getHomeroTreasurySnapshot(transaction, adminProfile.id),
    ])
    if (!pool.seeded) return { rewardAtomic: '0', rewardAvailable: false }

    try {
      const rewardAtomic = convertPepeAtomicToHomeroAtomic(getManualFaucetRewardAtomic(), pool)
      const rewardAvailable = BigInt(treasury.availableAtomic) >= BigInt(rewardAtomic)
        && BigInt(treasury.remainingSupplyAtomic) >= BigInt(rewardAtomic)
      return { rewardAtomic: String(rewardAtomic), rewardAvailable }
    } catch (error) {
      if (error instanceof HomeroAmmUnavailableError) return { rewardAtomic: '0', rewardAvailable: false }
      throw error
    }
  })
}

export async function getManualFaucetState(guestId: string, now = new Date()) {
  const dayStart = getUtcDayStart(now)
  const [latestClaim, todayCount, rewardQuote] = await Promise.all([
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
    getManualFaucetRewardQuote(),
  ])

  const cooldownUntil = latestClaim[0]
    ? latestClaim[0].createdAt.getTime() + manualClaimCooldownMs
    : 0

  return {
    rewardAtomic: rewardQuote.rewardAtomic,
    tokenSymbol: 'HOMERO' as const,
    rewardAvailable: rewardQuote.rewardAvailable,
    dailyLimit: manualClaimDailyLimit,
    claimsLeft: Math.max(0, manualClaimDailyLimit - (todayCount[0]?.count ?? 0)),
    cooldownUntil: cooldownUntil > now.getTime() ? cooldownUntil : 0,
    dailyResetAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export async function claimManualFaucet(guestId: string, captchaSessionId: string, now = new Date()) {
  const adminProfile = await getHomeroTreasuryAdminProfile()
  if (!adminProfile) throw new ManualFaucetError('The HOMERO exchange pool is not available yet.', 503, 'exchange_unavailable')

  const pepeEquivalentAtomic = getManualFaucetRewardAtomic()
  let result: { alreadyClaimed: boolean; rewardAtomic: string; tokenSymbol: 'PEPE' | 'HOMERO' }
  try {
    result = await db.transaction(async (transaction) => {
      await lockHomeroTreasuryProfiles(transaction, [guestId, adminProfile.id])
      const [profile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, guestId))
        .limit(1)
      if (!profile) throw new ManualFaucetError('Account profile not found.', 404, 'profile_missing')

      const [existingClaim] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, guestId),
          eq(earningEvents.source, 'manual_faucet'),
          eq(earningEvents.sourceKey, captchaSessionId),
        ))
        .limit(1)

      if (existingClaim) {
        return { alreadyClaimed: true, rewardAtomic: String(existingClaim.rewardAtomic), tokenSymbol: existingClaim.tokenSymbol }
      }

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

      const credited = await issueHomeroRewardForPepe(transaction, {
        adminProfileId: adminProfile.id,
        recipientProfileId: guestId,
        pepeEquivalentAtomic,
        sourceKey: captchaSessionId,
        recipientSource: 'manual_faucet',
        itemId: 'adslab-monetized-captcha',
        now,
      })

      const [credit] = await transaction
        .select({ id: earningEvents.id })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, guestId),
          eq(earningEvents.source, 'manual_faucet'),
          eq(earningEvents.sourceKey, captchaSessionId),
        ))
        .limit(1)
      if (!credit) throw new Error('The HOMERO faucet credit could not be confirmed.')

      return { alreadyClaimed: false, rewardAtomic: String(credited.rewardAtomic), tokenSymbol: 'HOMERO' }
    })
  } catch (error) {
    if (error instanceof HomeroAmmUnavailableError) {
      throw new ManualFaucetError('The HOMERO exchange pool is not initialized or has insufficient liquidity.', 503, 'exchange_unavailable')
    }
    if (error instanceof HomeroTreasuryInsufficientError) {
      throw new ManualFaucetError('The HOMERO treasury cannot fund this faucet reward right now.', 503, 'treasury_insufficient')
    }
    throw error
  }

  return {
    ...result,
    state: await getManualFaucetState(guestId),
  }
}
