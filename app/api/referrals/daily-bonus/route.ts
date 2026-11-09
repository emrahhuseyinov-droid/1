import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { arcadeProfiles, earningEvents, guestProfiles } from '@/lib/db/schema'
import { dailyBonusRewardsAtomic, getDailyBonusRewardAtomic, getStreakFromDate, getUtcDateKey } from '@/lib/daily-bonus'
import { ARCADE_ENERGY_CAP } from '@/lib/arcade-gameplay'
import { lockArcadeProfile } from '@/lib/arcade-service'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)

      if (!lockedProfile) return { status: 'not_found' as const }

      const now = new Date()
      const today = getUtcDateKey(0, now)
      const yesterday = getUtcDateKey(-1, now)
      const recentBonuses = await transaction
        .select({ sourceKey: earningEvents.sourceKey, rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.source, 'daily_bonus')))
        .orderBy(desc(earningEvents.createdAt))
        .limit(dailyBonusRewardsAtomic.length)

      const dateKeys = new Set(recentBonuses.map((bonus) => bonus.sourceKey))
      const existingToday = recentBonuses.find((bonus) => bonus.sourceKey === today)
      if (existingToday) {
        return {
          status: 'already_claimed' as const,
          rewardAtomic: existingToday.rewardAtomic,
          streak: getStreakFromDate(dateKeys, today),
          energyGranted: false,
          energyAdded: 0,
          energy: null,
        }
      }

      const streakBeforeToday = getStreakFromDate(dateKeys, yesterday)
      const rewardAtomic = getDailyBonusRewardAtomic(streakBeforeToday)
      const streak = Math.min(streakBeforeToday + 1, dailyBonusRewardsAtomic.length)
      const [credit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: account.profile.id,
          source: 'daily_bonus',
          sourceKey: today,
          itemId: `day-${streak}`,
          tokenSymbol: 'HOMERO',
          rewardAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })

      if (!credit) {
        return {
          status: 'already_claimed' as const,
          rewardAtomic,
          streak,
          energyGranted: false,
          energyAdded: 0,
          energy: null,
        }
      }

      const arcadeProfile = await lockArcadeProfile(transaction, account.profile.id)
      const energyAdded = Math.round(Math.min(1, Math.max(0, ARCADE_ENERGY_CAP - arcadeProfile.energy)) * 100) / 100
      let energy = arcadeProfile.energy
      if (energyAdded > 0) {
        const [updatedArcadeProfile] = await transaction
          .update(arcadeProfiles)
          .set({ energy: arcadeProfile.energy + energyAdded, updatedAt: now })
          .where(eq(arcadeProfiles.guestId, account.profile.id))
          .returning({ energy: arcadeProfiles.energy })
        if (!updatedArcadeProfile) throw new Error('Could not update Arcade energy for the daily bonus.')
        energy = updatedArcadeProfile.energy
      }

      return { status: 'claimed' as const, rewardAtomic, streak, energyGranted: energyAdded > 0, energyAdded, energy }
    })

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    }

    return NextResponse.json({
      claimed: result.status === 'claimed',
      alreadyClaimed: result.status === 'already_claimed',
      rewardAtomic: result.rewardAtomic,
      streak: result.streak,
      energyGranted: result.energyGranted,
      energyAdded: result.energyAdded,
      energy: result.energy,
      energyCap: ARCADE_ENERGY_CAP,
      tokenSymbol: 'HOMERO',
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[daily-bonus] Could not credit Daily Bonus:', error)
    return NextResponse.json({ error: 'Could not collect your Daily Bonus. Please try again.' }, { status: 500, headers: noStoreHeaders })
  }
}
