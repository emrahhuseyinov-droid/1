import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, ptcClicks } from '@/lib/db/schema'
import { getEligibleReward } from '@/lib/referral-rewards'
import { convertPepeAtomicToHomeroAtomic, getHomeroAmmSnapshot } from '@/lib/homero-amm'
import { getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot } from '@/lib/homero-treasury'

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
    let rewardAtomic: number | null = reward?.rewardAtomic ?? null
    let tokenSymbol: 'PEPE' | 'HOMERO' = reward?.tokenSymbol ?? 'HOMERO'
    let rewardAvailable = Boolean(reward)

    if (reward?.tokenSymbol === 'PEPE') {
      rewardAtomic = null
      tokenSymbol = 'HOMERO'
      rewardAvailable = false
      const adminProfile = await getHomeroTreasuryAdminProfile()
      if (adminProfile) {
        const { pool, treasury } = await db.transaction(async (transaction) => {
          const [pool, treasury] = await Promise.all([
            getHomeroAmmSnapshot(transaction, adminProfile.id),
            getHomeroTreasurySnapshot(transaction, adminProfile.id),
          ])
          return { pool, treasury }
        })
        if (pool.seeded && treasury.initialReserveSeeded) {
          try {
            const estimate = convertPepeAtomicToHomeroAtomic(reward.rewardAtomic, pool)
            if (BigInt(treasury.availableAtomic) >= BigInt(estimate) && BigInt(treasury.remainingSupplyAtomic) >= BigInt(estimate)) {
              rewardAtomic = estimate
              rewardAvailable = true
            }
          } catch {
            rewardAvailable = false
          }
        }
      }
    }

    const canClaim = click.status !== 'rejected' && timerRemainingSeconds === 0 && campaignAvailable && (isCampaignTask || rewardAvailable)

    return NextResponse.json({
      status: click.status,
      timerRemainingSeconds,
      canClaim,
      alreadyCredited,
      campaignAvailable,
      rewardAtomic,
      tokenSymbol,
      rewardAvailable,
      pepeEquivalentAtomic: reward?.tokenSymbol === 'PEPE' ? reward.rewardAtomic : null,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[view-ads-status] Could not fetch task status:', error)
    return NextResponse.json({ error: 'Could not fetch task status.' }, { status: 500, headers: noStoreHeaders })
  }
}
