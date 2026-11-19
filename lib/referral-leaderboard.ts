import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { guestProfiles, referralCommissions, user } from '@/lib/db/schema'
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

export async function getReferralLeaderboard(): Promise<ReferralLeaderboardEntry[]> {
  const verifiedReferralCount = sql<number>`count(distinct ${referredProfile.id})`.mapWith(Number)
  const rows = await db
    .select({
      profileId: referrerProfile.id,
      displayName: referrerUser.name,
      avatar: referrerUser.image,
      successfulReferrals: verifiedReferralCount,
    })
    .from(referralCommissions)
    .innerJoin(referrerProfile, eq(referralCommissions.referrerId, referrerProfile.id))
    .innerJoin(referrerUser, eq(referrerProfile.userId, referrerUser.id))
    .innerJoin(referredProfile, eq(referralCommissions.referredId, referredProfile.id))
    .innerJoin(referredUser, eq(referredProfile.userId, referredUser.id))
    .where(and(eq(referrerUser.emailVerified, true), eq(referredUser.emailVerified, true)))
    .groupBy(referrerProfile.id, referrerUser.name, referrerUser.image)
    .orderBy(desc(verifiedReferralCount), asc(referrerProfile.id))
    .limit(10)

  return rows.map((row, index) => ({
    rank: index + 1,
    displayName: getDisplayName(row.displayName, row.profileId),
    avatarSrc: getProfileAvatar(row.avatar),
    successfulReferrals: row.successfulReferrals,
  }))
}
