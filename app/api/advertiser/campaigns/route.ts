import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, guestProfiles } from '@/lib/db/schema'
import { ADVERTISER_WALLET_CAMPAIGN_CHARGE_SOURCE, ADVERTISER_WALLET_EVENT_SOURCES, ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE } from '@/lib/advertiser-wallet'
import { CAMPAIGN_COMMISSION_ATOMIC, CAMPAIGN_DURATION_SECONDS, CAMPAIGN_PROMOTION_DURATION_HOURS, CAMPAIGN_PROMOTION_FEE_ATOMIC, CAMPAIGN_REWARD_HOMERO_ATOMIC, getYouTubeCampaignPricing, YOUTUBE_CAMPAIGN_MAX_TASKS } from '@/lib/pepe-amount'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { getYouTubeVideoId, getYouTubeWatchUrl } from '@/lib/youtube-ads'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const maxCampaignTasks = 100_000

function serializeCampaign(campaign: typeof advertiserCampaigns.$inferSelect) {
  return { ...campaign, createdAt: campaign.createdAt.toISOString(), updatedAt: campaign.updatedAt.toISOString() }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const [balanceRows, campaigns] = await Promise.all([
      db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.tokenSymbol, 'PEPE'), inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]))),
      db.select().from(advertiserCampaigns)
        .where(eq(advertiserCampaigns.advertiserId, account.profile.id))
        .orderBy(desc(advertiserCampaigns.createdAt))
        .limit(50),
    ])

    return NextResponse.json({
      balanceAtomic: balanceRows[0]?.amount ?? '0',
      campaigns: campaigns.map(serializeCampaign),
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-campaigns] Could not load campaigns:', error)
    return NextResponse.json({ error: 'Could not load advertiser campaigns.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('advertiser-campaign-create', account.session.user.id, { windowSeconds: 60 * 60, max: 5 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Invalid campaign details.' }, { status: 400, headers: noStoreHeaders })

  const input = body as Record<string, unknown>
  const campaignId = typeof input.campaignId === 'string' && uuidPattern.test(input.campaignId) ? input.campaignId.toLowerCase() : null
  const campaignType = input.campaignType === 'ptc' || input.campaignType === 'youtube' ? input.campaignType : null
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  const requestedDuration = input.durationSeconds
  const durationSeconds = campaignType === 'youtube'
    ? requestedDuration === 60 ? 60 : requestedDuration === 30 ? 30 : 0
    : CAMPAIGN_DURATION_SECONDS
  const youtubePricing = durationSeconds === 30 || durationSeconds === 60 ? getYouTubeCampaignPricing(durationSeconds) : null
  const rewardPerTaskAtomic = campaignType === 'youtube'
    ? youtubePricing?.rewardAtomic ?? 0
    : CAMPAIGN_REWARD_HOMERO_ATOMIC
  const commissionPerTaskAtomic = campaignType === 'youtube'
    ? youtubePricing?.commissionAtomic ?? 0
    : CAMPAIGN_COMMISSION_ATOMIC
  const totalTasks = typeof input.totalTasks === 'number' && Number.isSafeInteger(input.totalTasks) ? input.totalTasks : 0
  const maxTasks = campaignType === 'youtube' ? YOUTUBE_CAMPAIGN_MAX_TASKS : maxCampaignTasks
  const promote = campaignType === 'ptc' && input.promote === true
  const promotionFeeAtomic = promote ? CAMPAIGN_PROMOTION_FEE_ATOMIC : 0
  const rawUrl = typeof input.targetUrl === 'string' ? input.targetUrl.trim() : ''

  let targetUrl: string | null = null
  if (campaignType === 'youtube') {
    const videoId = getYouTubeVideoId(rawUrl)
    if (videoId) targetUrl = getYouTubeWatchUrl(videoId)
  } else {
    try {
      const url = new URL(rawUrl)
      if (url.protocol === 'https:' && !url.username && !url.password) targetUrl = url.toString()
    } catch {
      targetUrl = null
    }
  }

  if (!campaignId || !campaignType || title.length < 3 || title.length > 80 || description.length > 500 || !targetUrl || durationSeconds === 0 || totalTasks < 1 || totalTasks > maxTasks) {
    return NextResponse.json({ error: 'Check the format, URL, title, and task count.' }, { status: 400, headers: noStoreHeaders })
  }

  const totalBudgetBigInt = (BigInt(rewardPerTaskAtomic) + BigInt(commissionPerTaskAtomic)) * BigInt(totalTasks)
  const totalChargeBigInt = totalBudgetBigInt + BigInt(promotionFeeAtomic)
  const maxSafeAtomic = BigInt(Number.MAX_SAFE_INTEGER)
  if (totalBudgetBigInt > maxSafeAtomic || totalChargeBigInt > maxSafeAtomic) return NextResponse.json({ error: 'The total campaign budget exceeds the allowed limit.' }, { status: 400, headers: noStoreHeaders })
  const totalBudgetAtomic = Number(totalBudgetBigInt)
  const totalChargeAtomic = Number(totalChargeBigInt)

  try {
    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'profile_missing' as const }

      const [existingCampaign] = await transaction
        .select()
        .from(advertiserCampaigns)
        .where(and(eq(advertiserCampaigns.id, campaignId), eq(advertiserCampaigns.advertiserId, account.profile.id)))
        .limit(1)
      if (existingCampaign) {
        const [balance] = await transaction
          .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
          .from(earningEvents)
          .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.tokenSymbol, 'PEPE'), inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES])))
        return { status: 'existing' as const, campaign: existingCampaign, balanceAtomic: balance?.amount ?? '0' }
      }

      const [idCollision] = await transaction
        .select({ id: advertiserCampaigns.id })
        .from(advertiserCampaigns)
        .where(eq(advertiserCampaigns.id, campaignId))
        .limit(1)
      if (idCollision) return { status: 'conflict' as const }

      const [balance] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(eq(earningEvents.guestId, account.profile.id), eq(earningEvents.tokenSymbol, 'PEPE'), inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES])))
      const balanceAtomic = BigInt(balance?.amount ?? '0')
      if (balanceAtomic < BigInt(totalChargeAtomic)) return { status: 'insufficient' as const, balanceAtomic: balanceAtomic.toString() }

      const now = new Date()
      const promotionStartedAt = promote ? now : null
      const promotionExpiresAt = promote ? new Date(now.getTime() + CAMPAIGN_PROMOTION_DURATION_HOURS * 60 * 60 * 1000) : null
      const [campaign] = await transaction.insert(advertiserCampaigns).values({
        id: campaignId,
        advertiserId: account.profile.id,
        campaignType,
        title,
        description,
        targetUrl,
        rewardPerTaskAtomic,
        commissionPerTaskAtomic,
        promotionFeeAtomic,
        promotionStartedAt,
        promotionExpiresAt,
        totalBudgetAtomic,
        totalTasks,
        remainingTasks: totalTasks,
        durationSeconds,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }).returning()

      await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId: account.profile.id,
        source: ADVERTISER_WALLET_CAMPAIGN_CHARGE_SOURCE,
        sourceKey: campaignId,
        itemId: campaignId,
        tokenSymbol: 'PEPE',
        rewardAtomic: -totalBudgetAtomic,
        createdAt: now,
      })
      if (promotionFeeAtomic > 0) {
        await transaction.insert(earningEvents).values({
          id: randomUUID(),
          guestId: account.profile.id,
          source: ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE,
          sourceKey: campaignId,
          itemId: campaignId,
          tokenSymbol: 'PEPE',
          rewardAtomic: -promotionFeeAtomic,
          createdAt: now,
        })
      }

      return { status: 'created' as const, campaign, balanceAtomic: (balanceAtomic - BigInt(totalChargeAtomic)).toString() }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'conflict') return NextResponse.json({ error: 'Campaign request could not be confirmed. Please retry.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'insufficient') return NextResponse.json({ error: 'Insufficient PEPE to launch the campaign and selected promotion.', code: 'insufficient_pepe', balanceAtomic: result.balanceAtomic }, { status: 409, headers: noStoreHeaders })

    return NextResponse.json({ campaign: serializeCampaign(result.campaign), balanceAtomic: result.balanceAtomic }, { status: result.status === 'created' ? 201 : 200, headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-campaigns] Could not create campaign:', error)
    return NextResponse.json({ error: 'Could not create advertiser campaign.' }, { status: 500, headers: noStoreHeaders })
  }
}
