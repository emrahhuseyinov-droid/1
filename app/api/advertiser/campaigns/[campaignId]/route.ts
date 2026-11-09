import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { ADVERTISER_WALLET_CAMPAIGN_CHARGE_SOURCE, ADVERTISER_WALLET_CAMPAIGN_REFUND_SOURCE, ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE, ADVERTISER_WALLET_PROMOTION_REFUND_SOURCE } from '@/lib/advertiser-wallet'
import { calculateUnusedPromotionRefundAtomic } from '@/lib/advertiser-promotion'
import { advertiserCampaigns, earningEvents, guestProfiles } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const { campaignId: rawCampaignId } = await context.params
  if (!uuidPattern.test(rawCampaignId)) return NextResponse.json({ error: 'Invalid campaign ID.' }, { status: 400, headers: noStoreHeaders })
  const campaignId = rawCampaignId.toLowerCase()
  const body: unknown = await request.json().catch(() => null)
  const nextStatus = typeof body === 'object' && body !== null && 'status' in body ? body.status : null
  if (nextStatus !== 'active' && nextStatus !== 'paused' && nextStatus !== 'cancelled') {
    return NextResponse.json({ error: 'Invalid campaign status.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'not_found' as const }

      const [campaign] = await transaction
        .select()
        .from(advertiserCampaigns)
        .where(and(eq(advertiserCampaigns.id, campaignId), eq(advertiserCampaigns.advertiserId, account.profile.id)))
        .for('update')
        .limit(1)
      if (!campaign) return { status: 'not_found' as const }
      if (campaign.status === nextStatus) return { status: 'updated' as const, campaign, refundAtomic: 0, promotionRefundAtomic: 0 }

      if (nextStatus === 'cancelled') {
        if (campaign.status !== 'active' && campaign.status !== 'paused') return { status: 'invalid_transition' as const }
        const refundAtomic = (campaign.rewardPerTaskAtomic + campaign.commissionPerTaskAtomic) * campaign.remainingTasks
        const now = new Date()
        const [advertiserWalletCharge] = await transaction
          .select({ id: earningEvents.id })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, account.profile.id),
            eq(earningEvents.source, ADVERTISER_WALLET_CAMPAIGN_CHARGE_SOURCE),
            eq(earningEvents.sourceKey, campaign.id),
          ))
          .limit(1)
        const refundSource = advertiserWalletCharge ? ADVERTISER_WALLET_CAMPAIGN_REFUND_SOURCE : 'advertiser_campaign_refund'
        if (refundAtomic > 0) {
          await transaction.insert(earningEvents).values({
            id: crypto.randomUUID(),
            guestId: account.profile.id,
            source: refundSource,
            sourceKey: campaign.id,
            itemId: campaign.id,
            tokenSymbol: 'PEPE',
            rewardAtomic: refundAtomic,
            createdAt: now,
          })
        }

        let promotionRefundAtomic = 0
        if (campaign.promotionFeeAtomic > 0) {
          const [promotionCharge] = await transaction
            .select({ id: earningEvents.id })
            .from(earningEvents)
            .where(and(
              eq(earningEvents.guestId, account.profile.id),
              eq(earningEvents.source, ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE),
              eq(earningEvents.sourceKey, campaign.id),
            ))
            .limit(1)
          if (promotionCharge) promotionRefundAtomic = calculateUnusedPromotionRefundAtomic(campaign, now)
          if (promotionRefundAtomic > 0) {
            await transaction.insert(earningEvents).values({
              id: crypto.randomUUID(),
              guestId: account.profile.id,
              source: ADVERTISER_WALLET_PROMOTION_REFUND_SOURCE,
              sourceKey: campaign.id,
              itemId: campaign.id,
              tokenSymbol: 'PEPE',
              rewardAtomic: promotionRefundAtomic,
              createdAt: now,
            })
          }
        }
        const [updatedCampaign] = await transaction
          .update(advertiserCampaigns)
          .set({ status: 'cancelled', updatedAt: now })
          .where(eq(advertiserCampaigns.id, campaign.id))
          .returning()
        return { status: 'updated' as const, campaign: updatedCampaign, refundAtomic, promotionRefundAtomic }
      }

      const canResume = nextStatus === 'active' && campaign.status === 'paused'
      const canPause = nextStatus === 'paused' && campaign.status === 'active'
      if (!canResume && !canPause) return { status: 'invalid_transition' as const }

      const [updatedCampaign] = await transaction
        .update(advertiserCampaigns)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(advertiserCampaigns.id, campaign.id))
        .returning()
      return { status: 'updated' as const, campaign: updatedCampaign, refundAtomic: 0, promotionRefundAtomic: 0 }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Campaign not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'invalid_transition') return NextResponse.json({ error: 'This campaign can no longer be changed.' }, { status: 409, headers: noStoreHeaders })
    return NextResponse.json({ campaign: { ...result.campaign, createdAt: result.campaign.createdAt.toISOString(), updatedAt: result.campaign.updatedAt.toISOString() }, refundAtomic: result.refundAtomic, promotionRefundAtomic: result.promotionRefundAtomic }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-campaigns] Could not update campaign:', error)
    return NextResponse.json({ error: 'Could not update advertiser campaign.' }, { status: 500, headers: noStoreHeaders })
  }
}
