import 'server-only'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { guestProfiles, ptcClicks, referralLoginDays, user } from '@/lib/db/schema'
import { getProfileAvatar } from '@/lib/profile-avatars'
import type { ReferralLeaderboardEntry } from '@/lib/referral-types'

const referrerProfile = alias(guestProfiles, 'referrer_profile')
const referredProfile = alias(guestProfiles, 'referred_profile')
const referrerUser = alias(user, 'referrer_user')
const referredUser = alias(user, 'referred_user')

function getDisplayName(name: string, profileId: string) {
  const normalizedName = name.replace(/\s+/g, ' ').trim().slice(0, 28)
  if (!normalizedName || normalizedName.includes('@')) {
    return `Member ${profileId.slice(0, 6).toUpperCase()}`
  }
  return normalizedName
}

export async function getMonthlyReferralLeaderboard(): Promise<ReferralLeaderboardEntry[]> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const monthStartDay = monthStart.toISOString().slice(0, 10)
  const nextMonthStartDay = nextMonthStart.toISOString().slice(0, 10)
  const completedPtcTaskCount = sql<number>`(
    select count(*)::int
    from ${ptcClicks}
    where ${ptcClicks.userId} = ${referredProfile.id}::text
      and ${ptcClicks.status} = 'completed'
      and ${ptcClicks.updatedAt} >= ${monthStart}
      and ${ptcClicks.updatedAt} < ${nextMonthStart}
  )`
  const loginDayCount = sql<number>`(
    select count(*)::int
    from ${referralLoginDays}
    where ${referralLoginDays.userId} = ${referredUser.id}
      and ${referralLoginDays.loginDay} >= ${monthStartDay}::date
      and ${referralLoginDays.loginDay} < ${nextMonthStartDay}::date
  )`
  const activeReferralCount = sql<number>`count(distinct ${referredProfile.id})`.mapWith(Number)
  const rows = await db
    .select({
      profileId: referrerProfile.id,
      displayName: referrerUser.name,
      avatar: referrerUser.image,
      activeReferrals: activeReferralCount,
    })
    .from(referrerProfile)
    .innerJoin(referrerUser, eq(referrerProfile.userId, referrerUser.id))
    .innerJoin(referredProfile, eq(referredProfile.referrerId, referrerProfile.id))
    .innerJoin(referredUser, eq(referredProfile.userId, referredUser.id))
    .where(and(
      eq(referrerUser.emailVerified, true),
      eq(referredUser.emailVerified, true),
      ne(referrerProfile.id, referredProfile.id),
      sql`${completedPtcTaskCount} >= 15`,
      sql`${loginDayCount} >= 3`,
    ))
    .groupBy(referrerProfile.id, referrerUser.name, referrerUser.image)
    .orderBy(desc(activeReferralCount), asc(referrerProfile.id))
    .limit(10)

  return rows.map((row, index) => ({
    rank: index + 1,
    displayName: getDisplayName(row.displayName, row.profileId),
    avatarSrc: getProfileAvatar(row.avatar),
    activeReferrals: row.activeReferrals,
  }))
}
