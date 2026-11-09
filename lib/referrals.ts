import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, referralCommissions } from '@/lib/db/schema'
import type { ReferralOverview } from '@/lib/referral-types'

export const guestCookieName = 'earnpepe_guest'
export const referralCommissionPercent = 10

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z0-9]{8}$/.test(normalized) ? normalized : null
}

export function hashGuestToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateReferralCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function attributeGuestByCode(profileId: string, referralCode: string) {
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ id: guestProfiles.id, referrerId: guestProfiles.referrerId })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, profileId))
      .for('update')
      .limit(1)

    if (!profile || profile.referrerId) return

    const [inviter] = await tx
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.referralCode, referralCode))
      .limit(1)

    if (!inviter || inviter.id === profile.id) return

    const [existingEarning] = await tx
      .select({ id: earningEvents.id })
      .from(earningEvents)
      .where(eq(earningEvents.guestId, profile.id))
      .limit(1)

    if (existingEarning) return

    await tx
      .update(guestProfiles)
      .set({ referrerId: inviter.id })
      .where(and(eq(guestProfiles.id, profile.id), isNull(guestProfiles.referrerId)))
  })
}

export async function getReferralOverview(profileId: string): Promise<ReferralOverview> {
  const [profile] = await db
    .select({ referralCode: guestProfiles.referralCode })
    .from(guestProfiles)
    .where(eq(guestProfiles.id, profileId))
    .limit(1)

  if (!profile) throw new Error('Guest profile not found.')

  const [referrals] = await db
    .select({ referralCount: count() })
    .from(guestProfiles)
    .where(eq(guestProfiles.referrerId, profileId))

  const [commissions] = await db
    .select({
      commissionAtomic: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text`,
      commissionCount: sql<number>`count(*)`.mapWith(Number),
      activeReferralCount: sql<number>`count(distinct ${referralCommissions.referredId})`.mapWith(Number),
    })
    .from(referralCommissions)
    .where(eq(referralCommissions.referrerId, profileId))

  return {
    referralCode: profile.referralCode,
    referralCount: referrals?.referralCount ?? 0,
    activeReferralCount: commissions?.activeReferralCount ?? 0,
    commissionCount: commissions?.commissionCount ?? 0,
    commissionAtomic: commissions?.commissionAtomic ?? '0',
  }
}
