import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, guestProfiles, wheelCaptchaSessions, youtubeAdViews } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const platformCommissionAtomic = 2_500_000_000

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('youtube-ad-claim', account.session.user.id, { windowSeconds: 60, max: 6 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  const viewId = typeof input.viewId === 'string' && uuidPattern.test(input.viewId) ? input.viewId.toLowerCase() : null
  const captchaSessionId = typeof input.captchaSessionId === 'string' && uuidPattern.test(input.captchaSessionId) ? input.captchaSessionId.toLowerCase() : null
  if (!viewId || !captchaSessionId) return NextResponse.json({ error: 'A valid view and CAPTCHA session are required.' }, { status: 400, headers: noStoreHeaders })

  try {
    const result = await db.transaction(async (transaction) => {
      const [profile] = await transaction.select({ id: guestProfiles.id }).from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id)).for('update').limit(1)
      if (!profile) return { status: 'not_found' as const }

      const [view] = await transaction.select().from(youtubeAdViews).where(and(
        eq(youtubeAdViews.id, viewId),
        eq(youtubeAdViews.guestId, account.profile.id),
      )).for('update').limit(1)
      if (!view) return { status: 'not_found' as const }
      if (view.status === 'completed') return { status: 'already_completed' as const }

      const now = new Date()
      if (view.expiresAt <= now) return { status: 'expired' as const }

      const [campaign] = await transaction.select().from(advertiserCampaigns).where(and(
        eq(advertiserCampaigns.id, view.campaignId),
        eq(advertiserCampaigns.campaignType, 'youtube'),
        eq(advertiserCampaigns.status, 'active'),
        gt(advertiserCampaigns.remainingTasks, 0),
      )).for('update').limit(1)
      if (!campaign || campaign.advertiserId === account.profile.id) return { status: 'unavailable' as const }

      const [completedFromAdvertiser] = await transaction.select({ id: youtubeAdViews.id }).from(youtubeAdViews)
        .innerJoin(advertiserCampaigns, eq(youtubeAdViews.campaignId, advertiserCampaigns.id))
        .where(and(
          eq(youtubeAdViews.guestId, account.profile.id),
          eq(youtubeAdViews.status, 'completed'),
          eq(advertiserCampaigns.advertiserId, campaign.advertiserId),
        )).limit(1)
      if (completedFromAdvertiser) return { status: 'already_completed' as const }

      const requiredMs = campaign.durationSeconds * 1000
      const elapsedMs = now.getTime() - view.startedAt.getTime()
      if (elapsedMs < requiredMs) return { status: 'too_early' as const, remainingSeconds: Math.max(1, Math.ceil((requiredMs - elapsedMs) / 1000)) }

      const [captcha] = await transaction.update(wheelCaptchaSessions).set({ status: 'consumed', consumedAt: now }).where(and(
        eq(wheelCaptchaSessions.id, captchaSessionId),
        eq(wheelCaptchaSessions.guestId, account.profile.id),
        eq(wheelCaptchaSessions.status, 'verified'),
        gt(wheelCaptchaSessions.expiresAt, now),
      )).returning({ id: wheelCaptchaSessions.id })
      if (!captcha) return { status: 'captcha_required' as const }

      const [completedView] = await transaction.update(youtubeAdViews).set({ status: 'completed', completedAt: now }).where(and(
        eq(youtubeAdViews.id, view.id),
        eq(youtubeAdViews.guestId, account.profile.id),
        eq(youtubeAdViews.status, 'pending'),
      )).returning({ id: youtubeAdViews.id })
      if (!completedView) return { status: 'already_completed' as const }

      const remainingTasks = campaign.remainingTasks - 1
      const [updatedCampaign] = await transaction.update(advertiserCampaigns).set({
        remainingTasks,
        commissionCollectedAtomic: campaign.commissionCollectedAtomic + campaign.commissionPerTaskAtomic,
        status: remainingTasks === 0 ? 'completed' : 'active',
        updatedAt: now,
      }).where(and(eq(advertiserCampaigns.id, campaign.id), eq(advertiserCampaigns.status, 'active'))).returning({ id: advertiserCampaigns.id })
      if (!updatedCampaign) throw new Error('YouTube campaign inventory changed during claim.')

      const [credit] = await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId: account.profile.id,
        source: 'youtube_advertiser_task',
        sourceKey: view.id,
        itemId: campaign.id,
        tokenSymbol: 'PEPE',
        rewardAtomic: campaign.rewardPerTaskAtomic,
        createdAt: now,
      }).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] }).returning({ id: earningEvents.id })
      if (!credit) throw new Error('YouTube task credit already exists.')

      return { status: 'credited' as const, rewardAtomic: campaign.rewardPerTaskAtomic, remainingTasks }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Video view was not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'already_completed') return NextResponse.json({ error: 'This YouTube ad has already been completed.' , code: 'already_completed' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'expired') return NextResponse.json({ error: 'The video session expired. Start this ad again.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'unavailable') return NextResponse.json({ error: 'This video campaign is no longer available.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'too_early') return NextResponse.json({ error: 'The video timer has not finished.', code: 'too_early', remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'captcha_required') return NextResponse.json({ error: 'Complete the AdsLab CAPTCHA before claiming this reward.', code: 'captcha_required' }, { status: 409, headers: noStoreHeaders })

    return NextResponse.json({ credited: true, rewardAtomic: String(result.rewardAtomic), tokenSymbol: 'PEPE', remainingTasks: result.remainingTasks }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[youtube-ads] Could not credit video task:', error)
    return NextResponse.json({ error: 'Could not credit this YouTube task.' }, { status: 500, headers: noStoreHeaders })
  }
}
