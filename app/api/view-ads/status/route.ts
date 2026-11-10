import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, ptcClicks } from '@/lib/db/schema'
import { getEligibleReward } from '@/lib/referral-rewards'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const clickIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const rawClickId = request.nextUrl.searchParams.get('clickId')
  if (!rawClickId || !clickIdPattern.test(rawClickId)) {
    return NextResponse.json({ error: 'Invalid click ID.' }, { status: 400, headers: noStoreHeaders })
  }
  const clickId = rawClickId.toLowerCase()

  try {
    const [click] = await db
      .select({ clickId: ptcClicks.clickId, taskId: ptcClicks.taskId, status: ptcClicks.status, createdAt: ptcClicks.createdAt })
      .from(ptcClicks)
      .where(and(eq(ptcClicks.clickId, clickId), eq(ptcClicks.userId, account.profile.id)))
      .limit(1)

    if (!click) return NextResponse.json({ error: 'Click not found.' }, { status: 404, headers: noStoreHeaders })

    const campaignIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isCampaignTask = campaignIdPattern.test(click.taskId)
    const [campaign] = isCampaignTask
      ? await db.select({ durationSeconds: advertiserCampaigns.durationSeconds, status: advertiserCampaigns.status })
          .from(advertiserCampaigns)
          .where(eq(advertiserCampaigns.id, click.taskId))
          .limit(1)
      : []
    const reward = isCampaignTask ? null : getEligibleReward('view_ads', click.taskId)
    if (isCampaignTask && !campaign) return NextResponse.json({ error: 'Task is no longer available.' }, { status: 404, headers: noStoreHeaders })
    if (!isCampaignTask && !reward) return NextResponse.json({ error: 'Task is no longer available.' }, { status: 404, headers: noStoreHeaders })

    const requiredSeconds = campaign?.durationSeconds ?? reward?.timerSeconds ?? 0
    const elapsedSeconds = Math.floor((Date.now() - click.createdAt.getTime()) / 1000)
    const timerRemainingSeconds = Math.max(0, requiredSeconds - elapsedSeconds)
    const [earningEvent] = await db
      .select({ id: earningEvents.id })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, account.profile.id),
        eq(earningEvents.source, isCampaignTask ? 'advertiser_task' : 'view_ads'),
        eq(earningEvents.sourceKey, click.clickId),
      ))
      .limit(1)

    const alreadyCredited = Boolean(earningEvent)
    const campaignAvailable = isCampaignTask ? campaign?.status === 'active' : true
    const canClaim = click.status !== 'rejected' && timerRemainingSeconds === 0 && campaignAvailable

    return NextResponse.json({
      status: click.status,
      timerRemainingSeconds,
      canClaim,
      alreadyCredited,
      campaignAvailable,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[view-ads-status] Could not fetch task status:', error)
    return NextResponse.json({ error: 'Could not fetch task status.' }, { status: 500, headers: noStoreHeaders })
  }
}
