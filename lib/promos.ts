import 'server-only'
import { and, desc, eq, gt, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents } from '@/lib/db/schema'
import type { PromoActivityEligibility, PromoClaim } from '@/lib/promo-types'

export async function getPromoClaims(guestId: string): Promise<PromoClaim[]> {
  const claims = await db
    .select({
      code: earningEvents.itemId,
      rewardAtomic: earningEvents.rewardAtomic,
      createdAt: earningEvents.createdAt,
    })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, guestId),
      eq(earningEvents.source, 'promo_code'),
    ))
    .orderBy(desc(earningEvents.createdAt))
    .limit(25)

  return claims
    .filter((claim): claim is typeof claim & { code: string } => Boolean(claim.code))
    .map((claim) => ({
      code: claim.code,
      rewardAtomic: claim.rewardAtomic,
      createdAt: claim.createdAt.toISOString(),
    }))
}

export async function getPromoActivityEligibility(guestId: string): Promise<PromoActivityEligibility> {
  const windowDays = 7
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const [activity] = await db
    .select({ createdAt: earningEvents.createdAt })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, guestId),
      inArray(earningEvents.source, ['view_ads', 'advertiser_task']),
      eq(earningEvents.tokenSymbol, 'HOMERO'),
      gt(earningEvents.rewardAtomic, 0),
      gte(earningEvents.createdAt, cutoff),
    ))
    .orderBy(desc(earningEvents.createdAt))
    .limit(1)

  return {
    eligible: Boolean(activity),
    lastActivityAt: activity?.createdAt.toISOString() ?? null,
    windowDays,
  }
}
