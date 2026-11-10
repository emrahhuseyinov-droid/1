import 'server-only'

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bannerPromoEvents, earningEvents, guestProfiles } from '@/lib/db/schema'
import { grantArcadeEnergy } from '@/lib/arcade-service'
import { issueHomeroRewardForPepe } from '@/lib/homero-amm'
import { getHomeroTreasuryAdminProfile, lockHomeroTreasuryProfiles } from '@/lib/homero-treasury'

export const BANNER_PROMO_REWARD_ATOMIC = 7_000_000_000
const MAX_DAILY_IMPRESSIONS = 15
const PROMO_INTERVAL_MS = 3 * 60 * 60 * 1000

export type BannerPromoState =
  | { phase: 'waiting'; nextAt: string }
  | { phase: 'active'; promoId: string }
  | { phase: 'exhausted'; resetAt: string }

export type BannerPromoActionResult = BannerPromoState & { rewardGranted: boolean }

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function getBannerPromoState(guestId: string): Promise<BannerPromoState> {
  return db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
      .limit(1)

    if (!profile) throw new Error('Guest profile not found for banner promotion.')

    const now = new Date()
    const day = utcDay(now)
    const [latestEvent] = await transaction
      .select({
        id: bannerPromoEvents.id,
        sequenceNumber: bannerPromoEvents.sequenceNumber,
        status: bannerPromoEvents.status,
        scheduledAt: bannerPromoEvents.scheduledAt,
        shownAt: bannerPromoEvents.shownAt,
        clickedAt: bannerPromoEvents.clickedAt,
        dismissedAt: bannerPromoEvents.dismissedAt,
        createdAt: bannerPromoEvents.createdAt,
      })
      .from(bannerPromoEvents)
      .where(eq(bannerPromoEvents.guestId, guestId))
      .orderBy(desc(bannerPromoEvents.createdAt), desc(bannerPromoEvents.sequenceNumber))
      .for('update')
      .limit(1)

    if (latestEvent?.status === 'shown') return { phase: 'active', promoId: latestEvent.id }

    if (latestEvent?.status === 'scheduled') {
      if (latestEvent.scheduledAt.getTime() > now.getTime()) {
        return { phase: 'waiting', nextAt: latestEvent.scheduledAt.toISOString() }
      }

      const [shown] = await transaction
        .update(bannerPromoEvents)
        .set({ status: 'shown', shownAt: now })
        .where(and(eq(bannerPromoEvents.id, latestEvent.id), eq(bannerPromoEvents.status, 'scheduled')))
        .returning({ id: bannerPromoEvents.id })

      return shown ? { phase: 'active', promoId: shown.id } : { phase: 'waiting', nextAt: now.toISOString() }
    }

    const todayEvents = await transaction
      .select({ sequenceNumber: bannerPromoEvents.sequenceNumber })
      .from(bannerPromoEvents)
      .where(and(eq(bannerPromoEvents.guestId, guestId), eq(bannerPromoEvents.day, day)))
      .orderBy(asc(bannerPromoEvents.sequenceNumber))
      .for('update')

    if (todayEvents.length >= MAX_DAILY_IMPRESSIONS) {
      const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      return { phase: 'exhausted', resetAt: resetAt.toISOString() }
    }

    const intervalAnchor = latestEvent
      ? latestEvent.clickedAt ?? latestEvent.dismissedAt ?? latestEvent.shownAt ?? latestEvent.createdAt
      : now
    const scheduledAt = new Date(intervalAnchor.getTime() + PROMO_INTERVAL_MS)
    const sequenceNumber = todayEvents.length + 1
    const [created] = await transaction
      .insert(bannerPromoEvents)
      .values({
        guestId,
        day,
        sequenceNumber,
        status: 'scheduled',
        scheduledAt,
      })
      .onConflictDoNothing({
        target: [bannerPromoEvents.guestId, bannerPromoEvents.day, bannerPromoEvents.sequenceNumber],
      })
      .returning({ id: bannerPromoEvents.id, scheduledAt: bannerPromoEvents.scheduledAt })

    let nextEvent = created
    if (!nextEvent) {
      const [existing] = await transaction
        .select({ id: bannerPromoEvents.id, status: bannerPromoEvents.status, scheduledAt: bannerPromoEvents.scheduledAt })
        .from(bannerPromoEvents)
        .where(and(
          eq(bannerPromoEvents.guestId, guestId),
          eq(bannerPromoEvents.day, day),
          eq(bannerPromoEvents.sequenceNumber, sequenceNumber),
        ))
        .for('update')
        .limit(1)

      if (existing?.status === 'shown') return { phase: 'active', promoId: existing.id }
      if (!existing) return { phase: 'waiting', nextAt: scheduledAt.toISOString() }
      nextEvent = existing
    }

    if (nextEvent.scheduledAt.getTime() > now.getTime()) {
      return { phase: 'waiting', nextAt: nextEvent.scheduledAt.toISOString() }
    }

    const [shown] = await transaction
      .update(bannerPromoEvents)
      .set({ status: 'shown', shownAt: now })
      .where(and(eq(bannerPromoEvents.id, nextEvent.id), eq(bannerPromoEvents.status, 'scheduled')))
      .returning({ id: bannerPromoEvents.id })

    return shown ? { phase: 'active', promoId: shown.id } : { phase: 'waiting', nextAt: now.toISOString() }
  })
}

export async function recordBannerPromoAction(
  guestId: string,
  promoId: string,
  action: 'click' | 'dismiss',
): Promise<BannerPromoActionResult> {
  const now = new Date()
  let rewardGranted = false
  const adminProfile = action === 'click' ? await getHomeroTreasuryAdminProfile() : null
  if (action === 'click' && !adminProfile) throw new Error('The HOMERO treasury is not available for the banner reward.')

  await db.transaction(async (transaction) => {
    if (adminProfile) await lockHomeroTreasuryProfiles(transaction, [adminProfile.id, guestId])
    else {
      await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, guestId))
        .for('update')
        .limit(1)
    }

    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .limit(1)
    if (!profile) throw new Error('Guest profile not found for banner promotion.')

    const [event] = await transaction
      .select()
      .from(bannerPromoEvents)
      .where(and(eq(bannerPromoEvents.id, promoId), eq(bannerPromoEvents.guestId, guestId)))
      .for('update')
      .limit(1)
    if (!event || event.status !== 'shown') return

    if (action === 'dismiss') {
      await transaction
        .update(bannerPromoEvents)
        .set({ status: 'dismissed', dismissedAt: now })
        .where(and(eq(bannerPromoEvents.id, promoId), eq(bannerPromoEvents.status, 'shown')))
      return
    }

    const [existingCredit] = await transaction
      .select({ rewardAtomic: earningEvents.rewardAtomic })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'banner_click_promo'),
        eq(earningEvents.sourceKey, promoId),
      ))
      .limit(1)

    if (existingCredit) {
      await transaction
        .update(bannerPromoEvents)
        .set({ status: 'clicked', clickedAt: now, rewardAtomic: existingCredit.rewardAtomic })
        .where(and(eq(bannerPromoEvents.id, promoId), eq(bannerPromoEvents.status, 'shown')))
      return
    }

    const credited = await issueHomeroRewardForPepe(transaction, {
      adminProfileId: adminProfile!.id,
      recipientProfileId: guestId,
      pepeEquivalentAtomic: BANNER_PROMO_REWARD_ATOMIC,
      sourceKey: promoId,
      recipientSource: 'banner_click_promo',
      itemId: 'adslab-offerwall-banner',
      now,
    })
    const [updated] = await transaction
      .update(bannerPromoEvents)
      .set({ status: 'clicked', clickedAt: now, rewardAtomic: credited.rewardAtomic })
      .where(and(eq(bannerPromoEvents.id, promoId), eq(bannerPromoEvents.status, 'shown')))
      .returning({ id: bannerPromoEvents.id })
    if (!updated) throw new Error('The banner promo was not updated after its reward was issued.')

    await grantArcadeEnergy(transaction, guestId, now)
    rewardGranted = true
  })

  const state = await getBannerPromoState(guestId)
  return { ...state, rewardGranted }
}
