import { and, eq, gt, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { advertiserCampaigns, youtubeAdViews } from '@/lib/db/schema'
import { getYouTubeVideoId } from '@/lib/youtube-ads'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const [campaigns, views] = await Promise.all([
      db.select({
        id: advertiserCampaigns.id,
        advertiserId: advertiserCampaigns.advertiserId,
        title: advertiserCampaigns.title,
        description: advertiserCampaigns.description,
        targetUrl: advertiserCampaigns.targetUrl,
        rewardPerTaskAtomic: advertiserCampaigns.rewardPerTaskAtomic,
        durationSeconds: advertiserCampaigns.durationSeconds,
        remainingTasks: advertiserCampaigns.remainingTasks,
      }).from(advertiserCampaigns).where(and(
        eq(advertiserCampaigns.campaignType, 'youtube'),
        eq(advertiserCampaigns.status, 'active'),
        ne(advertiserCampaigns.advertiserId, account.profile.id),
        gt(advertiserCampaigns.remainingTasks, 0),
      )).orderBy(advertiserCampaigns.createdAt).limit(100),
      db.select({
        campaignId: youtubeAdViews.campaignId,
        id: youtubeAdViews.id,
        status: youtubeAdViews.status,
        startedAt: youtubeAdViews.startedAt,
        expiresAt: youtubeAdViews.expiresAt,
      }).from(youtubeAdViews)
        .where(eq(youtubeAdViews.guestId, account.profile.id)),
    ])

    const viewsByCampaign = new Map(views.map((view) => [view.campaignId, view]))
    const tasks = campaigns.flatMap((campaign) => {
      const videoId = getYouTubeVideoId(campaign.targetUrl)
      if (!videoId) return []
      const view = viewsByCampaign.get(campaign.id)
      if (view?.status === 'completed') return []
      const elapsed = view ? Math.max(0, Math.floor((Date.now() - view.startedAt.getTime()) / 1000)) : 0

      return [{
        campaignId: campaign.id,
        title: campaign.title,
        description: campaign.description,
        videoId,
        rewardAtomic: String(campaign.rewardPerTaskAtomic),
        durationSeconds: campaign.durationSeconds,
        remainingTasks: campaign.remainingTasks,
        viewId: view?.status === 'pending' && view.expiresAt > new Date() ? view.id : null,
        timerRemainingSeconds: view?.status === 'pending' && view.expiresAt > new Date()
          ? Math.max(0, campaign.durationSeconds - elapsed)
          : 0,
      }]
    })

    return NextResponse.json({ tasks }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[youtube-ads] Could not load video tasks:', error)
    return NextResponse.json({ error: 'Could not load YouTube ad tasks.' }, { status: 500, headers: noStoreHeaders })
  }
}
