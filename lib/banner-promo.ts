import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bannerPromoEvents, earningEvents, guestProfiles } from '@/lib/db/schema'
import { grantArcadeEnergy } from '@/lib/arcade-service'

export const BANNER_PROMO_REWARD_ATOMIC = 1_500_000_000
const MAX_DAILY_IMPRESSIONS = 5
const PROMO_INTERVAL_MS = 2 * 60 * 60 * 1000

export type BannerPromoState =
  | { phase: 'waiting'; nextAt: string }
  | { phase: 'active'; promoId: string }
  | { phase: 'exhausted'; resetAt: string }

export type BannerPromoActionResult = BannerPromoState & { rewardGranted: boolean }

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function nextScheduleTime(now: Date) {
  return new Date(now.getTime() + PROMO_INTERVAL_MS)
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
    const events = await transaction
      .select({
        id: bannerPromoEvents.id,
        sequenceNumber: bannerPromoEvents.sequenceNumber,
        status: bannerPromoEvents.status,
        scheduledAt: bannerPromoEvents.scheduledAt,
        shownAt: bannerPromoEvents.shownAt,
        clickedAt: bannerPromoEvents.clickedAt,
        dismissedAt: bannerPromoEvents.dismissedAt,
      })
      .from(bannerPromoEvents)
      .where(and(eq(bannerPromoEvents.guestId, guestId), eq(bannerPromoEvents.day, day)))
      .orderBy(asc(bannerPromoEvents.sequenceNumber))
      .for('update')

    const active = events.find((event) => event.status === 'shown')
    if (active) return { phase: 'active', promoId: active.id }

    const scheduled = events.find((event) => event.status === 'scheduled')
    if (scheduled) {
      const previous = events
        .filter((event) => event.sequenceNumber < scheduled.sequenceNumber)
        .at(-1)
      const previousActionAt = previous?.clickedAt ?? previous?.dismissedAt ?? previous?.shownAt
      let scheduledAt = scheduled.scheduledAt

      if (previousActionAt) {
        const earliestNextAt = new Date(previousActionAt.getTime() + PROMO_INTERVAL_MS)
        if (scheduledAt.getTime() < earliestNextAt.getTime()) {
          const [rescheduled] = await transaction
            .update(bannerPromoEvents)
            .set({ scheduledAt: earliestNextAt })
            .where(and(eq(bannerPromoEvents.id, scheduled.id), eq(bannerPromoEvents.status, 'scheduled')))
            .returning({ scheduledAt: bannerPromoEvents.scheduledAt })
          scheduledAt = rescheduled?.scheduledAt ?? earliestNextAt
        }
      }

      if (scheduledAt.getTime() > now.getTime()) {
        return { phase: 'waiting', nextAt: scheduledAt.toISOString() }
      }

      const [shown] = await transaction
        .update(bannerPromoEvents)
        .set({ status: 'shown', shownAt: now })
        .where(and(eq(bannerPromoEvents.id, scheduled.id), eq(bannerPromoEvents.status, 'scheduled')))
        .returning({ id: bannerPromoEvents.id })

      return shown ? { phase: 'active', promoId: shown.id } : { phase: 'waiting', nextAt: now.toISOString() }
    }

    const shownCount = events.filter((event) => event.status !== 'scheduled').length
    if (shownCount >= MAX_DAILY_IMPRESSIONS) {
      const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      return { phase: 'exhausted', resetAt: resetAt.toISOString() }
    }

    const scheduledAt = nextScheduleTime(now)
    const [created] = await transaction
      .insert(bannerPromoEvents)
      .values({
        guestId,
        day,
        sequenceNumber: shownCount + 1,
        status: 'scheduled',
        scheduledAt,
      })
      .onConflictDoNothing({
        target: [bannerPromoEvents.guestId, bannerPromoEvents.day, bannerPromoEvents.sequenceNumber],
      })
      .returning({ scheduledAt: bannerPromoEvents.scheduledAt })

    if (created) return { phase: 'waiting', nextAt: created.scheduledAt.toISOString() }

    const [existing] = await transaction
      .select({ id: bannerPromoEvents.id, status: bannerPromoEvents.status, scheduledAt: bannerPromoEvents.scheduledAt })
      .from(bannerPromoEvents)
      .where(and(
        eq(bannerPromoEvents.guestId, guestId),
        eq(bannerPromoEvents.day, day),
        eq(bannerPromoEvents.sequenceNumber, shownCount + 1),
      ))
      .limit(1)

    if (existing?.status === 'shown') return { phase: 'active', promoId: existing.id }
    return { phase: 'waiting', nextAt: existing?.scheduledAt.toISOString() ?? scheduledAt.toISOString() }
  })
}

export async function recordBannerPromoAction(
  guestId: string,
  promoId: string,
  action: 'click' | 'dismiss',
): Promise<BannerPromoActionResult> {
  const now = new Date()
  let rewardGranted = false

  await db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
      .limit(1)

    if (!profile) throw new Error('Guest profile not found for banner promotion.')

    const [event] = await transaction
      .select()
      .from(bannerPromoEvents)
      .where(and(
        eq(bannerPromoEvents.id, promoId),
        eq(bannerPromoEvents.guestId, guestId),
        eq(bannerPromoEvents.day, utcDay(now)),
      ))
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

    const [updated] = await transaction
      .update(bannerPromoEvents)
      .set({ status: 'clicked', clickedAt: now, rewardAtomic: BANNER_PROMO_REWARD_ATOMIC })
      .where(and(eq(bannerPromoEvents.id, promoId), eq(bannerPromoEvents.status, 'shown')))
      .returning({ id: bannerPromoEvents.id })

    if (!updated) return

    const [credit] = await transaction
      .insert(earningEvents)
      .values({
        id: randomUUID(),
        guestId,
        source: 'banner_click_promo',
        sourceKey: promoId,
        itemId: 'adslab-offerwall-banner',
        tokenSymbol: 'PEPE',
        rewardAtomic: BANNER_PROMO_REWARD_ATOMIC,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
      .returning({ id: earningEvents.id })

    if (credit) {
      await grantArcadeEnergy(transaction, guestId, now)
      rewardGranted = true
    }
  })

  const state = await getBannerPromoState(guestId)
  return { ...state, rewardGranted }
}
