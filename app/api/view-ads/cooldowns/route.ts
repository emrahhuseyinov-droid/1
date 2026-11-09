import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { earningEvents } from '@/lib/db/schema'
import { VIEW_ADS_REWARD_COOLDOWN_MS, VIEW_ADS_REWARD_ITEM_IDS } from '@/lib/referral-rewards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const cooldownCutoff = new Date(Date.now() - VIEW_ADS_REWARD_COOLDOWN_MS)
    const recentCredits = await db
      .select({ itemId: earningEvents.itemId, createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, account.profile.id),
        eq(earningEvents.source, 'view_ads'),
        inArray(earningEvents.itemId, [...VIEW_ADS_REWARD_ITEM_IDS]),
        gt(earningEvents.createdAt, cooldownCutoff),
      ))
      .orderBy(desc(earningEvents.createdAt))

    const cooldowns: Record<string, string> = {}
    for (const credit of recentCredits) {
      if (!credit.itemId || cooldowns[credit.itemId]) continue
      cooldowns[credit.itemId] = new Date(credit.createdAt.getTime() + VIEW_ADS_REWARD_COOLDOWN_MS).toISOString()
    }

    return NextResponse.json({ cooldowns }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[view-ads-cooldowns] Could not fetch task cooldowns:', error)
    return NextResponse.json({ error: 'Could not fetch task cooldowns.' }, { status: 500, headers: noStoreHeaders })
  }
}
