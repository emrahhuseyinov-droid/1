import 'server-only'
import { randomUUID } from 'node:crypto'
import { getArcadeDayKey, getArcadeDayWindow, getArcadeWeekWindow } from '@/lib/arcade-time'
import { and, asc, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { ADVERTISER_WALLET_EVENT_SOURCES } from '@/lib/advertiser-wallet'
import { db } from '@/lib/db'
import {
  arcadeEntitlements,
  arcadeInventory,
  arcadeProfiles,
  arcadeRewardClaims,
  arcadeReserve,
  arcadeReserveEntries,
  arcadeSessions,
  earningEvents,
  guestProfiles,
  user,
} from '@/lib/db/schema'
import { getPepeReserveAdminProfile, PEPE_RESERVE_ARCADE_WEEKLY_SOURCE, PEPE_RESERVE_EVENT_SOURCES } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { ARCADE_ATOMIC_PER_PEPE, ARCADE_DAILY_ENERGY_EARNED_CAP, ARCADE_DAILY_RUN_LIMIT, ARCADE_ENERGY_CAP, ARCADE_MILESTONES, ARCADE_PTC_ENERGY_REWARD, ARCADE_SHOP, ARCADE_VIEW_AD_ENERGY_REWARD, getArcadeWeeklyPrizeAtomic } from '@/lib/arcade-gameplay'

export const arcadeNoStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
export type ArcadeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function authorizeArcadeRequest(request: NextRequest, requireTrustedOrigin = false) {
  if (requireTrustedOrigin && !isTrustedRequestOrigin(request)) {
    return { response: NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: arcadeNoStoreHeaders }) }
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) {
    return { response: NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: arcadeNoStoreHeaders }) }
  }

  return { guestId: account.profile.id }
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function lockArcadeProfile(transaction: ArcadeTransaction, guestId: string) {
  await transaction.insert(arcadeProfiles).values({ guestId, energy: 0 }).onConflictDoNothing({ target: arcadeProfiles.guestId })
  const [profile] = await transaction
    .select()
    .from(arcadeProfiles)
    .where(eq(arcadeProfiles.guestId, guestId))
    .for('update')
    .limit(1)
  if (!profile) throw new Error('Could not lock arcade profile.')
  return profile
}

export async function getPublisherPepeBalance(transaction: ArcadeTransaction, guestId: string) {
  const [balance] = await transaction
    .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, guestId),
      eq(earningEvents.tokenSymbol, 'PEPE'),
      notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
    ))
  return Number(balance?.amount ?? '0')
}

export async function grantArcadeEnergy(transaction: ArcadeTransaction, guestId: string, now = new Date(), energyReward = ARCADE_VIEW_AD_ENERGY_REWARD) {
  const profile = await lockArcadeProfile(transaction, guestId)
  const today = getArcadeDayKey(now)
  const dailyEnergyEarned = profile.dailyEnergyDay === today ? profile.dailyEnergyEarned : 0
  const energyToGrant = Math.max(0, Math.round(Math.min(
    energyReward,
    ARCADE_ENERGY_CAP - profile.energy,
    ARCADE_DAILY_ENERGY_EARNED_CAP - dailyEnergyEarned,
  ) * 100) / 100)

  if (energyToGrant <= 0) {
    return { energy: profile.energy, energyGranted: false, dailyEnergyEarned, dailyEnergyCap: ARCADE_DAILY_ENERGY_EARNED_CAP }
  }

  const nextDailyEnergyEarned = dailyEnergyEarned + energyToGrant
  const [updated] = await transaction
    .update(arcadeProfiles)
    .set({
      energy: profile.energy + energyToGrant,
      dailyEnergyEarned: nextDailyEnergyEarned,
      dailyEnergyDay: today,
      updatedAt: now,
    })
    .where(eq(arcadeProfiles.guestId, guestId))
    .returning({ energy: arcadeProfiles.energy })
  if (!updated) throw new Error('Could not update arcade energy.')

  return {
    energy: updated.energy,
    energyGranted: true,
    dailyEnergyEarned: nextDailyEnergyEarned,
    dailyEnergyCap: ARCADE_DAILY_ENERGY_EARNED_CAP,
  }
}

export async function grantPtcArcadeEnergy(transaction: ArcadeTransaction, guestId: string, now = new Date()) {
  return grantArcadeEnergy(transaction, guestId, now, ARCADE_PTC_ENERGY_REWARD)
}

async function lockArcadeReserve(transaction: ArcadeTransaction) {
  await transaction.insert(arcadeReserve).values({ id: 1 }).onConflictDoNothing({ target: arcadeReserve.id })
  const [reserve] = await transaction
    .select()
    .from(arcadeReserve)
    .where(eq(arcadeReserve.id, 1))
    .for('update')
    .limit(1)
  if (!reserve) throw new Error('Could not lock arcade reserve.')
  return reserve
}

export async function settlePendingArcadeRewards(transaction: ArcadeTransaction, now = new Date()) {
  const reserve = await lockArcadeReserve(transaction)
  let balanceAtomic = reserve.balanceAtomic
  let paidCount = 0
  const pendingClaims = await transaction
    .select()
    .from(arcadeRewardClaims)
    .where(and(eq(arcadeRewardClaims.status, 'pending'), eq(arcadeRewardClaims.rewardType, 'milestone')))
    .orderBy(asc(arcadeRewardClaims.createdAt), asc(arcadeRewardClaims.id))
    .for('update')
    .limit(100)

  for (const claim of pendingClaims) {
    if (claim.amountAtomic > balanceAtomic) break
    const sourceType = claim.rewardType === 'weekly' ? 'weekly_payout' : 'milestone_payout'
    await transaction.insert(arcadeReserveEntries).values({
      sourceType,
      sourceKey: claim.id,
      amountAtomic: -claim.amountAtomic,
      createdAt: now,
    })
    await transaction.insert(earningEvents).values({
      id: randomUUID(),
      guestId: claim.guestId,
      source: 'arcade_reward',
      sourceKey: claim.id,
      itemId: claim.rewardKey,
      tokenSymbol: 'PEPE',
      rewardAtomic: claim.amountAtomic,
      createdAt: now,
    })
    const [paidClaim] = await transaction
      .update(arcadeRewardClaims)
      .set({ status: 'paid', paidAt: now })
      .where(and(eq(arcadeRewardClaims.id, claim.id), eq(arcadeRewardClaims.status, 'pending')))
      .returning({ id: arcadeRewardClaims.id })
    if (!paidClaim) throw new Error('Arcade reward claim changed while locked.')
    balanceAtomic -= claim.amountAtomic
    paidCount += 1
  }

  if (balanceAtomic !== reserve.balanceAtomic) {
    await transaction
      .update(arcadeReserve)
      .set({ balanceAtomic, updatedAt: now })
      .where(eq(arcadeReserve.id, 1))
  }

  return { balanceAtomic, paidCount }
}

export async function addPtcCommissionToArcadeReserve(
  transaction: ArcadeTransaction,
  sourceKey: string,
  commissionAtomic: number,
  now = new Date(),
) {
  const contributionAtomic = Math.floor(commissionAtomic / 10)
  if (!Number.isSafeInteger(contributionAtomic) || contributionAtomic <= 0) return null

  const reserve = await lockArcadeReserve(transaction)
  const [entry] = await transaction
    .insert(arcadeReserveEntries)
    .values({ sourceType: 'ptc_fee', sourceKey, amountAtomic: contributionAtomic, createdAt: now })
    .onConflictDoNothing({ target: [arcadeReserveEntries.sourceType, arcadeReserveEntries.sourceKey] })
    .returning({ id: arcadeReserveEntries.id })
  if (!entry) return { contributionAtomic: 0, reserveBalanceAtomic: reserve.balanceAtomic, paidPendingCount: 0 }

  const newBalance = reserve.balanceAtomic + contributionAtomic
  if (!Number.isSafeInteger(newBalance)) throw new Error('Arcade reserve balance exceeds safe integer range.')
  await transaction
    .update(arcadeReserve)
    .set({ balanceAtomic: newBalance, updatedAt: now })
    .where(eq(arcadeReserve.id, 1))
  const settled = await settlePendingArcadeRewards(transaction, now)
  return {
    contributionAtomic,
    reserveBalanceAtomic: settled.balanceAtomic,
    paidPendingCount: settled.paidCount,
  }
}

export async function createMilestoneClaims(
  transaction: ArcadeTransaction,
  guestId: string,
  distanceM: number,
  sessionId: string,
  now = new Date(),
) {
  let createdCount = 0
  for (const milestone of ARCADE_MILESTONES) {
    if (distanceM < milestone.distanceM) continue
    const [claim] = await transaction
      .insert(arcadeRewardClaims)
      .values({
        guestId,
        rewardKey: milestone.key,
        rewardType: 'milestone',
        amountAtomic: milestone.amountAtomic,
        sourceKey: sessionId,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [arcadeRewardClaims.guestId, arcadeRewardClaims.rewardKey] })
      .returning({ id: arcadeRewardClaims.id })
    if (claim) createdCount += 1
  }
  return createdCount
}


async function getLeaderboardRows(transaction: ArcadeTransaction, start: Date, end: Date) {
  const rankedRuns = transaction
    .select({
      guestId: arcadeSessions.guestId,
      distanceM: arcadeSessions.distanceM,
      finishedAt: arcadeSessions.finishedAt,
      rowNumber: sql<number>`row_number() over (partition by ${arcadeSessions.guestId} order by ${arcadeSessions.distanceM} desc, ${arcadeSessions.finishedAt} asc)`.as('row_number'),
    })
    .from(arcadeSessions)
    .where(and(
      eq(arcadeSessions.mode, 'ranked'),
      eq(arcadeSessions.status, 'completed'),
      gte(arcadeSessions.finishedAt, start),
      lt(arcadeSessions.finishedAt, end),
    ))
    .as('arcade_ranked_runs')

  return transaction
    .select({ guestId: rankedRuns.guestId, distanceM: rankedRuns.distanceM, finishedAt: rankedRuns.finishedAt })
    .from(rankedRuns)
    .where(eq(rankedRuns.rowNumber, 1))
    .orderBy(desc(rankedRuns.distanceM), asc(rankedRuns.finishedAt), asc(rankedRuns.guestId))
    .limit(100)
}

export async function getArcadeLeaderboard(start: Date, end: Date, currentGuestId?: string) {
  const rows = await db.transaction((transaction) => getLeaderboardRows(transaction, start, end))
  if (rows.length === 0) return []
  const guestIds = rows.map((row) => row.guestId)
  const profiles = await db
    .select({
      guestId: guestProfiles.id,
      referralCode: guestProfiles.referralCode,
      nickname: user.name,
    })
    .from(guestProfiles)
    .leftJoin(user, eq(guestProfiles.userId, user.id))
    .where(inArray(guestProfiles.id, guestIds))
  const profileById = new Map(profiles.map((profile) => [profile.guestId, profile]))

  return rows.map((row, index) => {
    const profile = profileById.get(row.guestId)
    const displayName = profile?.nickname?.trim() || (profile?.referralCode ? `Player ${profile.referralCode.slice(0, 4).toUpperCase()}` : 'Arcade player')
    const rank = index + 1
    return {
      rank,
      displayName,
      bestDistanceM: row.distanceM,
      prizePepe: getArcadeWeeklyPrizeAtomic(rank) / ARCADE_ATOMIC_PER_PEPE,
      isCurrentUser: row.guestId === currentGuestId,
    }
  })
}

async function lockPepeReserveProfiles(transaction: ArcadeTransaction, profileIds: string[]) {
  const uniqueProfileIds = [...new Set(profileIds)].sort()
  const profiles = await transaction
    .select({ id: guestProfiles.id })
    .from(guestProfiles)
    .where(inArray(guestProfiles.id, uniqueProfileIds))
    .orderBy(asc(guestProfiles.id))
    .for('update')

  if (profiles.length !== uniqueProfileIds.length) {
    throw new Error('Could not lock all PEPE reserve profiles for weekly rewards.')
  }
}

async function getPepeReserveBalanceAtomic(transaction: ArcadeTransaction, reserveGuestId: string) {
  const [balance] = await transaction
    .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, reserveGuestId),
      eq(earningEvents.tokenSymbol, 'PEPE'),
      inArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES]),
    ))

  return BigInt(balance?.amount ?? '0')
}

export async function settlePendingWeeklyAwards(
  transaction: ArcadeTransaction,
  reserveGuestId: string,
  now = new Date(),
) {
  const pendingClaims = await transaction
    .select()
    .from(arcadeRewardClaims)
    .where(and(
      eq(arcadeRewardClaims.status, 'pending'),
      eq(arcadeRewardClaims.rewardType, 'weekly'),
    ))
    .orderBy(asc(arcadeRewardClaims.periodStart), asc(arcadeRewardClaims.placement), asc(arcadeRewardClaims.createdAt), asc(arcadeRewardClaims.id))
    .for('update')
    .limit(100)

  if (pendingClaims.length === 0) {
    return { balanceAtomic: (await getPepeReserveBalanceAtomic(transaction, reserveGuestId)).toString(), paidCount: 0 }
  }

  await lockPepeReserveProfiles(transaction, [reserveGuestId, ...pendingClaims.map((claim) => claim.guestId)])
  let balanceAtomic = await getPepeReserveBalanceAtomic(transaction, reserveGuestId)
  let paidCount = 0

  let claimIndex = 0
  while (claimIndex < pendingClaims.length) {
    const periodStart = pendingClaims[claimIndex].periodStart
    const periodClaims: typeof pendingClaims = []
    while (claimIndex < pendingClaims.length && pendingClaims[claimIndex].periodStart === periodStart) {
      periodClaims.push(pendingClaims[claimIndex])
      claimIndex += 1
    }

    const periodCost = periodClaims.reduce((total, claim) => total + BigInt(claim.amountAtomic), 0n)
    if (periodCost > balanceAtomic) break

    for (const claim of periodClaims) {
      const [debit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: reserveGuestId,
          source: PEPE_RESERVE_ARCADE_WEEKLY_SOURCE,
          sourceKey: claim.id,
          itemId: claim.rewardKey,
          tokenSymbol: 'PEPE',
          rewardAtomic: -claim.amountAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })
      if (!debit) throw new Error('Weekly PEPE reserve debit already exists for a pending award.')

      const [credit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: claim.guestId,
          source: 'arcade_reward',
          sourceKey: claim.id,
          itemId: claim.rewardKey,
          tokenSymbol: 'PEPE',
          rewardAtomic: claim.amountAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })
      if (!credit) throw new Error('Weekly PEPE reward already exists for a pending award.')

      const [paidClaim] = await transaction
        .update(arcadeRewardClaims)
        .set({ status: 'paid', paidAt: now })
        .where(and(eq(arcadeRewardClaims.id, claim.id), eq(arcadeRewardClaims.status, 'pending')))
        .returning({ id: arcadeRewardClaims.id })
      if (!paidClaim) throw new Error('Weekly reward claim changed while locked.')

      balanceAtomic -= BigInt(claim.amountAtomic)
      paidCount += 1
    }
  }

  return { balanceAtomic: balanceAtomic.toString(), paidCount }
}

export async function settlePreviousWeekAwards(now = new Date()) {
  const currentWeek = getArcadeWeekWindow(now)
  const previousWeek = getArcadeWeekWindow(new Date(currentWeek.start.getTime() - 1))
  const { start: previousStart, periodStart: previousPeriodStart } = previousWeek
  const reserveAdmin = await getPepeReserveAdminProfile()

  return db.transaction(async (transaction) => {
    const winners = await getLeaderboardRows(transaction, previousStart, currentWeek.start)
    let createdClaims = 0

    for (let index = 0; index < winners.length; index += 1) {
      const winner = winners[index]
      const placement = index + 1
      const amountAtomic = getArcadeWeeklyPrizeAtomic(placement)
      if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0) continue

      const [claim] = await transaction
        .insert(arcadeRewardClaims)
        .values({
          guestId: winner.guestId,
          rewardKey: `weekly:${previousPeriodStart}:rank:${placement}`,
          rewardType: 'weekly',
          amountAtomic,
          sourceKey: `week:${previousPeriodStart}:rank:${placement}`,
          placement,
          periodStart: previousPeriodStart,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [arcadeRewardClaims.guestId, arcadeRewardClaims.rewardKey] })
        .returning({ id: arcadeRewardClaims.id })
      if (claim) createdClaims += 1
    }

    if (!reserveAdmin) {
      return { periodStart: previousPeriodStart, createdClaims, paidClaims: 0, capitalAvailable: false }
    }

    const settled = await settlePendingWeeklyAwards(transaction, reserveAdmin.id, now)
    return {
      periodStart: previousPeriodStart,
      createdClaims,
      paidClaims: settled.paidCount,
      capitalAvailable: true,
      capitalBalanceAtomic: settled.balanceAtomic,
    }
  })
}

export async function getArcadeState(guestId: string) {
  const now = new Date()
  const today = getArcadeDayKey(now)
  const { start: dayStart, end: nextDayStart } = getArcadeDayWindow(now)
  const [profile, inventory, claims, balance, reserve, dailyRuns, entitlements] = await Promise.all([
    db.select().from(arcadeProfiles).where(eq(arcadeProfiles.guestId, guestId)).limit(1),
    db.select().from(arcadeInventory).where(eq(arcadeInventory.guestId, guestId)),
    db.select().from(arcadeRewardClaims).where(eq(arcadeRewardClaims.guestId, guestId)).orderBy(asc(arcadeRewardClaims.createdAt)),
    db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
      )),
    db.select({ balanceAtomic: arcadeReserve.balanceAtomic }).from(arcadeReserve).where(eq(arcadeReserve.id, 1)).limit(1),
    db.select({ count: sql<number>`count(*)::int` })
      .from(arcadeSessions)
      .where(and(
        eq(arcadeSessions.guestId, guestId),
        eq(arcadeSessions.mode, 'ranked'),
        gte(arcadeSessions.startedAt, dayStart),
        lt(arcadeSessions.startedAt, nextDayStart),
      )),
    db.select({ unlimitedRanked: arcadeEntitlements.unlimitedRanked, unlimitedEnergy: arcadeEntitlements.unlimitedEnergy })
      .from(arcadeEntitlements)
      .where(eq(arcadeEntitlements.guestId, guestId))
      .limit(1),
  ])
  const unlimitedRanked = entitlements[0]?.unlimitedRanked ?? false
  const unlimitedEnergy = entitlements[0]?.unlimitedEnergy ?? false

  return {
    energy: profile[0]?.energy ?? 0,
    energyCap: ARCADE_ENERGY_CAP,
    unlimitedEnergy,
    unlimitedRanked,
    dailyEnergyEarned: profile[0]?.dailyEnergyDay === today ? profile[0].dailyEnergyEarned : 0,
    dailyEnergyCap: ARCADE_DAILY_ENERGY_EARNED_CAP,
    dailyRunsToday: dailyRuns[0]?.count ?? 0,
    dailyRunLimit: ARCADE_DAILY_RUN_LIMIT,
    dailyRunsAvailable: unlimitedRanked || (dailyRuns[0]?.count ?? 0) < ARCADE_DAILY_RUN_LIMIT,
    bestDistanceM: profile[0]?.bestDistanceM ?? 0,
    totalRuns: profile[0]?.totalRuns ?? 0,
    pepeBalanceAtomic: balance[0]?.amount ?? '0',
    reserveBalanceAtomic: String(reserve[0]?.balanceAtomic ?? 0),
    inventory: {
      jetpack: inventory.find((item) => item.boostCode === 'jetpack')?.quantity ?? 0,
      shield: inventory.find((item) => item.boostCode === 'shield')?.quantity ?? 0,
      life: inventory.find((item) => item.boostCode === 'life')?.quantity ?? 0,
    },
    milestones: ARCADE_MILESTONES.map((milestone) => {
      const claim = claims.find((entry) => entry.rewardKey === milestone.key)
      return {
        ...milestone,
        amountAtomic: String(milestone.amountAtomic),
        earned: (profile[0]?.bestDistanceM ?? 0) >= milestone.distanceM,
        status: claim?.status ?? 'locked',
      }
    }),
    shop: Object.values(ARCADE_SHOP).map((item) => ({ ...item, priceAtomic: String(item.priceAtomic) })),
  }
}
