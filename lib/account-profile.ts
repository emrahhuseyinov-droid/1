import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { guestProfiles } from '@/lib/db/schema'
import { attributeGuestByCode, generateReferralCode, guestCookieName, hashGuestToken, normalizeReferralCode } from '@/lib/referrals'

const profileFields = {
  id: guestProfiles.id,
  referralCode: guestProfiles.referralCode,
  referrerId: guestProfiles.referrerId,
}

export type AccountProfile = Pick<typeof guestProfiles.$inferSelect, 'id' | 'referralCode' | 'referrerId'>

export async function ensureAccountProfile(userId: string, guestToken?: string | null, referralInput?: unknown): Promise<AccountProfile> {
  const referralCode = normalizeReferralCode(referralInput)
  const [existingProfile] = await db
    .select(profileFields)
    .from(guestProfiles)
    .where(eq(guestProfiles.userId, userId))
    .limit(1)

  if (existingProfile) {
    if (referralCode && !existingProfile.referrerId) {
      await attributeGuestByCode(existingProfile.id, referralCode)
      const [updatedProfile] = await db
        .select(profileFields)
        .from(guestProfiles)
        .where(eq(guestProfiles.id, existingProfile.id))
        .limit(1)
      return updatedProfile ?? existingProfile
    }
    return existingProfile
  }

  if (guestToken) {
    const [claimedProfile] = await db
      .update(guestProfiles)
      .set({ userId })
      .where(and(eq(guestProfiles.tokenHash, hashGuestToken(guestToken)), isNull(guestProfiles.userId)))
      .returning(profileFields)

    if (claimedProfile) {
      if (referralCode) await attributeGuestByCode(claimedProfile.id, referralCode)
      return claimedProfile
    }
  }

  const [inviter] = referralCode
    ? await db
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.referralCode, referralCode))
        .limit(1)
    : []

  const newProfileId = randomUUID()
  const privateToken = randomBytes(32).toString('hex')
  const [createdProfile] = await db
    .insert(guestProfiles)
    .values({
      id: newProfileId,
      referralCode: generateReferralCode(),
      tokenHash: hashGuestToken(privateToken),
      userId,
      referrerId: inviter?.id === newProfileId ? null : inviter?.id ?? null,
    })
    .onConflictDoNothing({ target: guestProfiles.userId })
    .returning(profileFields)

  if (createdProfile) return createdProfile

  const [racedProfile] = await db
    .select(profileFields)
    .from(guestProfiles)
    .where(eq(guestProfiles.userId, userId))
    .limit(1)

  if (!racedProfile) throw new Error('Could not provision the signed-in profile.')
  return racedProfile
}

export async function getAccountForRequest(headers: Headers, guestToken?: string | null, referralInput?: unknown) {
  const session = await auth.api.getSession({ headers })
  if (!session?.user) return null

  const profile = await ensureAccountProfile(session.user.id, guestToken, referralInput)
  return { session, profile }
}

export { guestCookieName }
