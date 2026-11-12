import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { advertiserCampaigns, guestProfiles, youtubeAdViews } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const viewLeaseMs = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('youtube-ad-start', account.session.user.id, { windowSeconds: 60, max: 20 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  const campaignId = typeof body === 'object' && body !== null && 'campaignId' in body && typeof body.campaignId === 'string' && uuidPattern.test(body.campaignId)
    ? body.campaignId.toLowerCase()
    : null
  if (!campaignId) return NextResponse.json({ error: 'Invalid video campaign.' }, { status: 400, headers: noStoreHeaders })

  try {
    const result = await db.transaction(async (transaction) => {
      const [profile] = await transaction.select({ id: guestProfiles.id }).from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id)).for('update').limit(1)
      if (!profile) return { status: 'not_found' as const }

      const [campaign] = await transaction.select({ id: advertiserCampaigns.id, advertiserId: advertiserCampaigns.advertiserId, durationSeconds: advertiserCampaigns.durationSeconds })
        .from(advertiserCampaigns).where(and(
          eq(advertiserCampaigns.id, campaignId),
          eq(advertiserCampaigns.campaignType, 'youtube'),
          eq(advertiserCampaigns.status, 'active'),
          gt(advertiserCampaigns.remainingTasks, 0),
        )).for('update').limit(1)
      if (!campaign || campaign.advertiserId === account.profile.id) return { status: 'unavailable' as const }

      const [existing] = await transaction.select().from(youtubeAdViews).where(and(
        eq(youtubeAdViews.guestId, account.profile.id),
        eq(youtubeAdViews.campaignId, campaign.id),
      )).for('update').limit(1)
      const now = new Date()
      if (existing?.status === 'completed') return { status: 'already_completed' as const }
      if (existing && existing.expiresAt > now) {
        const elapsed = Math.max(0, Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000))
        return {
          status: 'started' as const,
          viewId: existing.id,
          timerRemainingSeconds: Math.max(0, campaign.durationSeconds - elapsed),
          videoId: null,
        }
      }

      const expiresAt = new Date(now.getTime() + viewLeaseMs)
      if (existing) {
        await transaction.update(youtubeAdViews).set({ status: 'pending', startedAt: now, expiresAt, completedAt: null }).where(eq(youtubeAdViews.id, existing.id))
        return { status: 'started' as const, viewId: existing.id, timerRemainingSeconds: campaign.durationSeconds, videoId: null }
      }

      const [view] = await transaction.insert(youtubeAdViews).values({
        guestId: account.profile.id,
        campaignId: campaign.id,
        status: 'pending',
        startedAt: now,
        expiresAt,
      }).returning({ id: youtubeAdViews.id })
      return { status: 'started' as const, viewId: view.id, timerRemainingSeconds: campaign.durationSeconds, videoId: null }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'unavailable') return NextResponse.json({ error: 'This video campaign is no longer available.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'already_completed') return NextResponse.json({ error: 'You have already completed this YouTube ad.', code: 'already_completed' }, { status: 409, headers: noStoreHeaders })
    return NextResponse.json({ viewId: result.viewId, timerRemainingSeconds: result.timerRemainingSeconds }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[youtube-ads] Could not start video task:', error)
    return NextResponse.json({ error: 'Could not start this video task.' }, { status: 500, headers: noStoreHeaders })
  }
}
