import { randomUUID } from 'node:crypto'
import { and, desc, eq, gt, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, guestProfiles, ptcClicks } from '@/lib/db/schema'
import { ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE, ADVERTISER_WALLET_PROMOTION_REFUND_SOURCE } from '@/lib/advertiser-wallet'
import { calculateUnusedPromotionRefundAtomic } from '@/lib/advertiser-promotion'
import { getEligibleReward, VIEW_ADS_REWARD_COOLDOWN_MS } from '@/lib/referral-rewards'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { addPtcCommissionToArcadeReserve, grantArcadeEnergy } from '@/lib/arcade-service'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const clickIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getClickId(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null || !('clickId' in body)) return null
    return typeof body.clickId === 'string' && clickIdPattern.test(body.clickId) ? body.clickId.toLowerCase() : null
  } catch {
    return null
  }
}

async function claimAdvertiserTask(userId: string, clickId: string) {
  return db.transaction(async (transaction) => {
    const [lockedProfile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, userId))
      .for('update')
      .limit(1)
    if (!lockedProfile) return { status: 'not_found' as const }

    const [click] = await transaction
      .select({ clickId: ptcClicks.clickId, taskId: ptcClicks.taskId, status: ptcClicks.status, createdAt: ptcClicks.createdAt })
      .from(ptcClicks)
      .where(and(eq(ptcClicks.clickId, clickId), eq(ptcClicks.userId, userId)))
      .limit(1)
    if (!click) return { status: 'not_found' as const }
    if (click.status === 'rejected') return { status: 'rejected' as const }

    const [existingCredit] = await transaction
      .select({ rewardAtomic: earningEvents.rewardAtomic })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, userId),
        eq(earningEvents.source, 'advertiser_task'),
        eq(earningEvents.sourceKey, click.clickId),
      ))
      .limit(1)
    if (existingCredit) return { status: 'already_credited' as const, rewardAtomic: existingCredit.rewardAtomic }
    if (click.status === 'completed') return { status: 'already_completed' as const }

    const [previousCompletedClick] = await transaction
      .select({ clickId: ptcClicks.clickId })
      .from(ptcClicks)
      .where(and(
        eq(ptcClicks.userId, userId),
        eq(ptcClicks.taskId, click.taskId),
        eq(ptcClicks.status, 'completed'),
        ne(ptcClicks.clickId, click.clickId),
      ))
      .limit(1)
    const [previousCampaignCredit] = await transaction
      .select({ id: earningEvents.id })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, userId),
        eq(earningEvents.source, 'advertiser_task'),
        eq(earningEvents.itemId, click.taskId),
        ne(earningEvents.sourceKey, click.clickId),
      ))
      .limit(1)
    if (previousCompletedClick || previousCampaignCredit) {
      await transaction
        .update(ptcClicks)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(
          eq(ptcClicks.clickId, click.clickId),
          eq(ptcClicks.userId, userId),
          eq(ptcClicks.status, 'pending'),
        ))
      return { status: 'already_completed' as const }
    }

    const [campaign] = await transaction
      .select()
      .from(advertiserCampaigns)
      .where(eq(advertiserCampaigns.id, click.taskId))
      .for('update')
      .limit(1)
    if (!campaign || campaign.status !== 'active' || campaign.remainingTasks < 1) return { status: 'unavailable' as const }

    const cooldownCutoff = new Date(Date.now() - VIEW_ADS_REWARD_COOLDOWN_MS)
    const [recentCampaignCredit] = await transaction
      .select({ createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, userId),
        eq(earningEvents.source, 'advertiser_task'),
        eq(earningEvents.itemId, campaign.id),
        gt(earningEvents.createdAt, cooldownCutoff),
      ))
      .orderBy(desc(earningEvents.createdAt))
      .limit(1)
    if (recentCampaignCredit) {
      const cooldownUntil = recentCampaignCredit.createdAt.getTime() + VIEW_ADS_REWARD_COOLDOWN_MS
      return {
        status: 'cooldown' as const,
        cooldownUntil: new Date(cooldownUntil).toISOString(),
        remainingSeconds: Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000)),
      }
    }

    const elapsedMs = Date.now() - click.createdAt.getTime()
    const requiredMs = campaign.durationSeconds * 1000
    if (elapsedMs < requiredMs) return { status: 'too_early' as const, remainingSeconds: Math.ceil((requiredMs - elapsedMs) / 1000) }

    const now = new Date()
    if (click.status === 'pending') {
      const [completedClick] = await transaction
        .update(ptcClicks)
        .set({ status: 'completed', updatedAt: now })
        .where(and(
          eq(ptcClicks.clickId, click.clickId),
          eq(ptcClicks.userId, userId),
          eq(ptcClicks.status, 'pending'),
        ))
        .returning({ clickId: ptcClicks.clickId })
      if (!completedClick) return { status: 'rejected' as const }
    }

    const remainingTasks = campaign.remainingTasks - 1
    const [updatedCampaign] = await transaction
      .update(advertiserCampaigns)
      .set({ remainingTasks, commissionCollectedAtomic: campaign.commissionCollectedAtomic + campaign.commissionPerTaskAtomic, status: remainingTasks === 0 ? 'completed' : 'active', updatedAt: now })
      .where(and(eq(advertiserCampaigns.id, campaign.id), eq(advertiserCampaigns.status, 'active')))
      .returning({ id: advertiserCampaigns.id })
    if (!updatedCampaign) return { status: 'unavailable' as const }

    const [credit] = await transaction
      .insert(earningEvents)
      .values({
        id: randomUUID(),
        guestId: userId,
        source: 'advertiser_task',
        sourceKey: click.clickId,
        itemId: campaign.id,
        tokenSymbol: 'HOMERO',
        rewardAtomic: campaign.rewardPerTaskAtomic,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
      .returning({ id: earningEvents.id })
    if (!credit) throw new Error('Advertiser task credit already exists.')
    const energy = await grantArcadeEnergy(transaction, userId, now)
    const reserveFunding = await addPtcCommissionToArcadeReserve(transaction, click.clickId, campaign.commissionPerTaskAtomic, now)

    if (remainingTasks === 0 && campaign.promotionFeeAtomic > 0) {
      const [promotionCharge] = await transaction
        .select({ id: earningEvents.id })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, campaign.advertiserId),
          eq(earningEvents.source, ADVERTISER_WALLET_PROMOTION_CHARGE_SOURCE),
          eq(earningEvents.sourceKey, campaign.id),
        ))
        .limit(1)
      if (promotionCharge) {
        const promotionRefundAtomic = calculateUnusedPromotionRefundAtomic(campaign, now)
        if (promotionRefundAtomic > 0) {
          await transaction.insert(earningEvents).values({
            id: randomUUID(),
            guestId: campaign.advertiserId,
            source: ADVERTISER_WALLET_PROMOTION_REFUND_SOURCE,
            sourceKey: campaign.id,
            itemId: campaign.id,
            tokenSymbol: 'PEPE',
            rewardAtomic: promotionRefundAtomic,
            createdAt: now,
          })
        }
      }
    }

    return {
      status: 'credited' as const,
      rewardAtomic: campaign.rewardPerTaskAtomic,
      energy: energy.energy,
      energyGranted: energy.energyGranted,
      dailyEnergyEarned: energy.dailyEnergyEarned,
      dailyEnergyCap: energy.dailyEnergyCap,
      reserveContributionAtomic: reserveFunding?.contributionAtomic ?? 0,
    }
  })
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const clickId = await getClickId(request)
  if (!clickId) return NextResponse.json({ error: 'Invalid click ID.' }, { status: 400, headers: noStoreHeaders })

  try {
    const [candidate] = await db
      .select({ taskId: ptcClicks.taskId })
      .from(ptcClicks)
      .where(and(eq(ptcClicks.clickId, clickId), eq(ptcClicks.userId, account.profile.id)))
      .limit(1)

    if (candidate && clickIdPattern.test(candidate.taskId)) {
      const result = await claimAdvertiserTask(account.profile.id, clickId)
      if (result.status === 'not_found') return NextResponse.json({ error: 'Click not found.' }, { status: 404, headers: noStoreHeaders })
      if (result.status === 'rejected') return NextResponse.json({ error: 'This click was rejected.' }, { status: 409, headers: noStoreHeaders })
      if (result.status === 'unavailable') return NextResponse.json({ error: 'This campaign is no longer available.' }, { status: 409, headers: noStoreHeaders })
      if (result.status === 'already_completed') return NextResponse.json({ error: 'You have already completed this campaign.', code: 'already_completed' }, { status: 409, headers: noStoreHeaders })
      if (result.status === 'cooldown') return NextResponse.json({ error: 'This campaign task will be available again after the 24-hour cooldown.', code: 'cooldown', cooldownUntil: result.cooldownUntil, remainingSeconds: result.remainingSeconds }, { status: 429, headers: noStoreHeaders })
      if (result.status === 'too_early') return NextResponse.json({ error: 'The task timer has not finished.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
      if (result.status === 'already_credited') return NextResponse.json({ credited: true, alreadyCredited: true, rewardAtomic: result.rewardAtomic, tokenSymbol: 'HOMERO' }, { headers: noStoreHeaders })
      return NextResponse.json({ credited: true, rewardAtomic: result.rewardAtomic, tokenSymbol: 'HOMERO', energy: result.energy, energyGranted: result.energyGranted, dailyEnergyEarned: result.dailyEnergyEarned, dailyEnergyCap: result.dailyEnergyCap }, { headers: noStoreHeaders })
    }
  } catch (error) {
    console.error('[view-ads-claim] Could not credit advertiser task:', error)
    return NextResponse.json({ error: 'Could not credit this advertiser task.' }, { status: 500, headers: noStoreHeaders })
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

      const [click] = await transaction
        .select({ clickId: ptcClicks.clickId, taskId: ptcClicks.taskId, status: ptcClicks.status, createdAt: ptcClicks.createdAt })
        .from(ptcClicks)
        .where(and(eq(ptcClicks.clickId, clickId), eq(ptcClicks.userId, account.profile.id)))
        .limit(1)

      if (!click) return { status: 'not_found' as const }
      if (click.status === 'rejected') return { status: 'rejected' as const }

      const reward = getEligibleReward('view_ads', click.taskId)
      if (!reward) return { status: 'unavailable' as const }

      const elapsedMs = Date.now() - click.createdAt.getTime()
      const requiredMs = reward.timerSeconds * 1000
      if (elapsedMs < requiredMs) {
        return { status: 'too_early' as const, remainingSeconds: Math.ceil((requiredMs - elapsedMs) / 1000) }
      }

      const [existingCredit] = await transaction
        .select({ id: earningEvents.id, createdAt: earningEvents.createdAt })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, 'view_ads'),
          eq(earningEvents.sourceKey, click.clickId),
        ))
        .limit(1)

      if (existingCredit) {
        return {
          status: 'already_credited' as const,
          cooldownUntil: new Date(existingCredit.createdAt.getTime() + VIEW_ADS_REWARD_COOLDOWN_MS).toISOString(),
        }
      }

      const cooldownCutoff = new Date(Date.now() - VIEW_ADS_REWARD_COOLDOWN_MS)
      const [recentTaskCredit] = await transaction
        .select({ createdAt: earningEvents.createdAt })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, 'view_ads'),
          eq(earningEvents.itemId, click.taskId),
          gt(earningEvents.createdAt, cooldownCutoff),
          ne(earningEvents.sourceKey, click.clickId),
        ))
        .orderBy(desc(earningEvents.createdAt))
        .limit(1)

      if (recentTaskCredit) {
        const availableAt = recentTaskCredit.createdAt.getTime() + VIEW_ADS_REWARD_COOLDOWN_MS
        return {
          status: 'cooldown' as const,
          remainingSeconds: Math.max(1, Math.ceil((availableAt - Date.now()) / 1000)),
        }
      }

      if (click.status === 'pending') {
        const [completedClick] = await transaction
          .update(ptcClicks)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(
            eq(ptcClicks.clickId, click.clickId),
            eq(ptcClicks.userId, account.profile.id),
            eq(ptcClicks.status, 'pending'),
          ))
          .returning({ clickId: ptcClicks.clickId })

        if (!completedClick) {
          const [latestClick] = await transaction
            .select({ status: ptcClicks.status })
            .from(ptcClicks)
            .where(and(eq(ptcClicks.clickId, click.clickId), eq(ptcClicks.userId, account.profile.id)))
            .limit(1)

          if (!latestClick || latestClick.status !== 'completed') return { status: 'rejected' as const }
        }
      }

      const [credit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: account.profile.id,
          source: 'view_ads',
          sourceKey: click.clickId,
          itemId: click.taskId,
          tokenSymbol: 'HOMERO',
          rewardAtomic: reward.rewardAtomic,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id, createdAt: earningEvents.createdAt })

      if (!credit) {
        return {
          status: 'already_credited' as const,
          cooldownUntil: new Date(Date.now() + VIEW_ADS_REWARD_COOLDOWN_MS).toISOString(),
        }
      }
      const energy = await grantArcadeEnergy(transaction, account.profile.id)
      return {
        status: 'credited' as const,
        rewardAtomic: reward.rewardAtomic,
        cooldownUntil: new Date(credit.createdAt.getTime() + VIEW_ADS_REWARD_COOLDOWN_MS).toISOString(),
        energy: energy.energy,
        energyGranted: energy.energyGranted,
      dailyEnergyEarned: energy.dailyEnergyEarned,
      dailyEnergyCap: energy.dailyEnergyCap,
      }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Click not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'rejected') return NextResponse.json({ error: 'This click was rejected.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'unavailable') return NextResponse.json({ error: 'This task is no longer available.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'too_early') {
      return NextResponse.json({ error: 'The task timer has not finished.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'cooldown') {
      return NextResponse.json({ error: 'This task will be available again in 24 hours.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'already_credited') {
      return NextResponse.json({ credited: true, alreadyCredited: true, cooldownUntil: result.cooldownUntil }, { headers: noStoreHeaders })
    }

    return NextResponse.json({ credited: true, rewardAtomic: result.rewardAtomic, tokenSymbol: 'HOMERO', cooldownUntil: result.cooldownUntil, energy: result.energy, energyGranted: result.energyGranted, dailyEnergyEarned: result.dailyEnergyEarned, dailyEnergyCap: result.dailyEnergyCap, reserveContributionAtomic: 'reserveContributionAtomic' in result ? result.reserveContributionAtomic : 0 }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[view-ads-claim] Could not credit task:', error)
    return NextResponse.json({ error: 'Could not credit this task.' }, { status: 500, headers: noStoreHeaders })
  }
}
