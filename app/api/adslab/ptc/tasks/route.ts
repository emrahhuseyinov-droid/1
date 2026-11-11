import { and, desc, eq, gt, inArray, like, ne, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { ADSLAB_PTC_TASK_PREFIX, AdsLabPtcError, getAdsLabPtcTasks, parseHomeroPayoutAtomic } from '@/lib/adslab-ptc'
import { db } from '@/lib/db'
import { advertiserCampaigns, earningEvents, ptcClicks } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const PENDING_GRACE_MS = 24 * 60 * 60 * 1000

async function loadPtcTaskHistory(userId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []

  return db
    .select({
      taskId: ptcClicks.taskId,
      completedCount: sql<number>`count(*) filter (where ${ptcClicks.status} = 'completed')::int`,
      latestCompletedAt: sql<Date | null>`max(${ptcClicks.updatedAt}) filter (where ${ptcClicks.status} = 'completed')`,
      pendingClickId: sql<string | null>`max(${ptcClicks.clickId}) filter (where ${ptcClicks.status} = 'pending')`,
      pendingStartedAt: sql<Date | null>`max(${ptcClicks.createdAt}) filter (where ${ptcClicks.status} = 'pending')`,
      pendingPayout: sql<string | null>`max(${ptcClicks.payout}) filter (where ${ptcClicks.status} = 'pending')`,
      pendingTokenSymbol: sql<'PEPE' | 'HOMERO' | null>`max(${ptcClicks.payoutTokenSymbol}) filter (where ${ptcClicks.status} = 'pending')`,
    })
    .from(ptcClicks)
    .where(and(eq(ptcClicks.userId, userId), inArray(ptcClicks.taskId, taskIds)))
    .groupBy(ptcClicks.taskId)
}

const emptyPtcTaskStats = {
  todayClicks: 0,
  todayEarnings: { PEPE: '0', HOMERO: '0' },
  totalEarnings: { PEPE: '0', HOMERO: '0' },
}

async function loadPtcTaskStats(userId: string) {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [partnerClickRows, campaignClickRows, earningRows] = await Promise.all([
    db
      .select({ todayClicks: sql<number>`count(*) filter (where ${ptcClicks.updatedAt} >= ${todayStart})::int` })
      .from(ptcClicks)
      .where(and(
        eq(ptcClicks.userId, userId),
        eq(ptcClicks.status, 'completed'),
        like(ptcClicks.taskId, `${ADSLAB_PTC_TASK_PREFIX}%`),
      )),
    db
      .select({ todayClicks: sql<number>`count(*) filter (where ${ptcClicks.updatedAt} >= ${todayStart})::int` })
      .from(ptcClicks)
      .innerJoin(advertiserCampaigns, sql`${ptcClicks.taskId} = ${advertiserCampaigns.id}::text`)
      .where(and(
        eq(ptcClicks.userId, userId),
        eq(ptcClicks.status, 'completed'),
        eq(advertiserCampaigns.campaignType, 'ptc'),
      )),
    db
      .select({
        tokenSymbol: earningEvents.tokenSymbol,
        todayEarningsAtomic: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}) filter (where ${earningEvents.createdAt} >= ${todayStart}), 0)::text`,
        totalEarningsAtomic: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text`,
      })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, userId),
        inArray(earningEvents.source, ['adslab_ptc', 'adslab_ptc_reversal', 'advertiser_task']),
      ))
      .groupBy(earningEvents.tokenSymbol),
  ])

  const stats = {
    todayClicks: 0,
    todayEarnings: { PEPE: '0', HOMERO: '0' },
    totalEarnings: { PEPE: '0', HOMERO: '0' },
  }
  for (const row of earningRows) {
    stats.todayEarnings[row.tokenSymbol] = row.todayEarningsAtomic
    stats.totalEarnings[row.tokenSymbol] = row.totalEarningsAtomic
  }

  return {
    ...stats,
    todayClicks: (partnerClickRows[0]?.todayClicks ?? 0) + (campaignClickRows[0]?.todayClicks ?? 0),
  }
}

function timestampToMs(value: unknown): number | null {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'string'
      ? Date.parse(value)
      : Number.NaN

  return Number.isFinite(timestamp) ? timestamp : null
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  let failureStage = 'provider_feed'
  try {
    const [providerResult, campaignRows] = await Promise.all([
      getAdsLabPtcTasks(request.headers, account.profile.id)
        .then((feed) => ({ feed, error: null as unknown }))
        .catch((error: unknown) => ({ feed: null, error })),
      db.select({
        key: advertiserCampaigns.id,
        advertiserId: advertiserCampaigns.advertiserId,
        title: advertiserCampaigns.title,
        description: advertiserCampaigns.description,
        url: advertiserCampaigns.targetUrl,
        rewardAtomic: advertiserCampaigns.rewardPerTaskAtomic,
        durationSeconds: advertiserCampaigns.durationSeconds,
        remainingTasks: advertiserCampaigns.remainingTasks,
      }).from(advertiserCampaigns).where(and(
        eq(advertiserCampaigns.campaignType, 'ptc'),
        eq(advertiserCampaigns.status, 'active'),
        ne(advertiserCampaigns.advertiserId, account.profile.id),
        gt(advertiserCampaigns.remainingTasks, 0),
      )).orderBy(desc(advertiserCampaigns.createdAt)).limit(100),
    ])
    const providerFeed = providerResult.feed
    if (!providerFeed && campaignRows.length === 0) throw providerResult.error
    if (!providerFeed) console.warn('[adslab-ptc] Partner feed unavailable; serving advertiser tasks only.')

    const providerTasks = providerFeed?.tasks ?? []
    const taskIds = [...providerTasks.map((task) => task.key), ...campaignRows.map((campaign) => campaign.key)]
    let histories: Awaited<ReturnType<typeof loadPtcTaskHistory>> = []
    try {
      failureStage = 'task_history_query'
      histories = await loadPtcTaskHistory(account.profile.id, taskIds)
    } catch (dbErr) {
      const rawErrorCode = dbErr && typeof dbErr === 'object' && 'code' in dbErr ? dbErr.code : undefined
      const errorCode = typeof rawErrorCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawErrorCode) ? rawErrorCode : undefined
      console.error('[AdsLab PTC] Task History DB Error:', {
        errorName: dbErr instanceof Error ? dbErr.name.slice(0, 64) : typeof dbErr,
        ...(errorCode ? { errorCode } : {}),
        ...(dbErr instanceof Error ? { message: dbErr.message.slice(0, 200) } : {}),
      })
      histories = []
    }

    let stats = emptyPtcTaskStats
    try {
      failureStage = 'task_stats_query'
      stats = await loadPtcTaskStats(account.profile.id)
    } catch (dbErr) {
      console.error('[AdsLab PTC] Task Stats DB Error:', {
        errorName: dbErr instanceof Error ? dbErr.name.slice(0, 64) : typeof dbErr,
      })
    }

    failureStage = 'task_history_mapping'
    const safeHistories = Array.isArray(histories) ? histories : []
    const historyByTask = new Map(safeHistories.map((history) => [history.taskId, history]))
    const now = Date.now()

    const partnerTasks = providerTasks.flatMap((task) => {
      const history = historyByTask.get(task.key)
      const visitsCompleted = Math.max(0, Number(history?.completedCount ?? 0))
      const visitsRemaining = Math.max(0, task.visitsPerUser - visitsCompleted)
      if (visitsRemaining === 0) return []

      const pendingStartedAt = timestampToMs(history?.pendingStartedAt)
      const pendingElapsedSeconds = pendingStartedAt === null ? null : Math.floor((now - pendingStartedAt) / 1000)
      const pendingIsActive = pendingElapsedSeconds !== null
        && pendingElapsedSeconds < task.durationSeconds
      const awaitingConfirmation = pendingElapsedSeconds !== null
        && pendingElapsedSeconds >= task.durationSeconds
        && pendingElapsedSeconds <= task.durationSeconds + PENDING_GRACE_MS / 1000
      const latestCompletedAt = timestampToMs(history?.latestCompletedAt)
      const cooldownUntil = latestCompletedAt === null
        ? 0
        : latestCompletedAt + task.cooldownMinutes * 60_000
      const pendingRewardAtomic = parseHomeroPayoutAtomic(history?.pendingPayout ?? null)

      return [{
        key: task.key,
        title: task.title,
        description: task.description,
        url: task.url,
        iconUrl: task.iconUrl,
        rewardAtomic: String(pendingRewardAtomic ?? task.rewardAtomic),
        tokenSymbol: history?.pendingTokenSymbol ?? task.tokenSymbol,
        pepeUsdPrice: task.pepeUsdPrice,
        durationSeconds: task.durationSeconds,
        visitsRemaining,
        cooldownRemainingSeconds: Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
        isInProgress: pendingIsActive,
        awaitingConfirmation,
        pendingClickId: awaitingConfirmation ? history?.pendingClickId ?? null : null,
        activeRemainingSeconds: pendingIsActive
          ? Math.max(0, task.durationSeconds - (pendingElapsedSeconds ?? 0))
          : null,
      }]
    })

    const advertiserTasks = campaignRows.flatMap((campaign) => {
      const history = historyByTask.get(campaign.key)
      if (Number(history?.completedCount ?? 0) > 0) return []

      const pendingStartedAt = timestampToMs(history?.pendingStartedAt)
      const pendingElapsedSeconds = pendingStartedAt === null ? null : Math.floor((now - pendingStartedAt) / 1000)
      const pendingIsActive = pendingElapsedSeconds !== null && pendingElapsedSeconds < campaign.durationSeconds
      const awaitingConfirmation = pendingElapsedSeconds !== null
        && pendingElapsedSeconds >= campaign.durationSeconds
        && pendingElapsedSeconds <= campaign.durationSeconds + PENDING_GRACE_MS / 1000

      return [{
        key: campaign.key,
        title: campaign.title,
        description: campaign.description,
        url: campaign.url,
        iconUrl: null,
        rewardAtomic: String(parseHomeroPayoutAtomic(history?.pendingPayout ?? null) ?? campaign.rewardAtomic),
        tokenSymbol: history?.pendingTokenSymbol ?? 'HOMERO',
        pepeUsdPrice: providerFeed?.pepeUsdPrice ?? '0',
        durationSeconds: campaign.durationSeconds,
        visitsRemaining: 1,
        cooldownRemainingSeconds: 0,
        isInProgress: pendingIsActive,
        awaitingConfirmation,
        pendingClickId: awaitingConfirmation ? history?.pendingClickId ?? null : null,
        activeRemainingSeconds: pendingIsActive
          ? Math.max(0, campaign.durationSeconds - (pendingElapsedSeconds ?? 0))
          : null,
      }]
    })

    return NextResponse.json({ tasks: [...partnerTasks, ...advertiserTasks], pepeUsdPrice: providerFeed?.pepeUsdPrice ?? '0', stats }, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof AdsLabPtcError) {
      console.error('[adslab-ptc] task feed failed', {
        stage: error.diagnostic.stage,
        ...(error.diagnostic.providerStatus === undefined ? {} : { providerStatus: error.diagnostic.providerStatus }),
        ...(error.diagnostic.failureType === undefined ? {} : { failureType: error.diagnostic.failureType }),
      })
      return NextResponse.json({ error: 'Partner tasks are temporarily unavailable.' }, { status: error.statusCode, headers: noStoreHeaders })
    }
    const errorName = error instanceof Error ? error.name.slice(0, 64) : typeof error
    const rawErrorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const errorCode = typeof rawErrorCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawErrorCode) ? rawErrorCode : undefined
    console.error('[adslab-ptc] Could not load partner tasks.', {
      stage: failureStage,
      errorName,
      ...(errorCode ? { errorCode } : {}),
    })
    return NextResponse.json({ error: 'Could not load partner tasks.' }, { status: 500, headers: noStoreHeaders })
  }
}
