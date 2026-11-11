import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents } from '@/lib/db/schema'

export type ManualClaimStatus = {
  cooldownUntil: number
  remainingSeconds: number
  claimsLeft: number
}

export const manualClaimCooldownMs = 7_000
export const manualClaimDailyLimit = 1000

export async function getManualClaimStatus(guestId: string): Promise<ManualClaimStatus> {
  const now = new Date()
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [latestClaim, todayCount] = await Promise.all([
    db.select({ createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), eq(earningEvents.source, 'manual_claim')))
      .orderBy(desc(earningEvents.createdAt))
      .limit(1),
    db.select({ count: sql<number>`count(*)::int` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'manual_claim'),
        gte(earningEvents.createdAt, utcDayStart),
      )),
  ])

  const nextClaimAt = latestClaim[0]
    ? latestClaim[0].createdAt.getTime() + manualClaimCooldownMs
    : 0
  const cooldownUntil = nextClaimAt > now.getTime() ? nextClaimAt : 0
  const claimsLeft = Math.max(0, manualClaimDailyLimit - (todayCount[0]?.count ?? 0))

  return {
    cooldownUntil,
    remainingSeconds: Math.max(0, Math.ceil((cooldownUntil - now.getTime()) / 1000)),
    claimsLeft,
  }
}
