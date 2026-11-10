import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { ADSLAB_SHORTLINK_TASK_PREFIX, AdsLabPtcError, getAdsLabShortlinkTasks } from '@/lib/adslab-ptc'
import { db } from '@/lib/db'
import { ptcClicks } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const PENDING_GRACE_MS = 24 * 60 * 60 * 1000

function timestampToMs(value: unknown): number | null {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'string'
      ? Date.parse(value)
      : Number.NaN

  return Number.isFinite(timestamp) ? timestamp : null
}

async function loadShortlinkTaskHistory(userId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []

  return db
    .select({
      taskId: ptcClicks.taskId,
      completedCount: sql<number>`count(*) filter (where ${ptcClicks.status} = 'completed')::int`,
      latestCompletedAt: sql<Date | null>`max(${ptcClicks.updatedAt}) filter (where ${ptcClicks.status} = 'completed')`,
      pendingStartedAt: sql<Date | null>`max(${ptcClicks.createdAt}) filter (where ${ptcClicks.status} = 'pending')`,
    })
    .from(ptcClicks)
    .where(and(eq(ptcClicks.userId, userId), inArray(ptcClicks.taskId, taskIds)))
    .groupBy(ptcClicks.taskId)
}

async function loadLatestPendingShortlinkStart(userId: string) {
  const [pending] = await db
    .select({ startedAt: ptcClicks.createdAt })
    .from(ptcClicks)
    .where(and(
      eq(ptcClicks.userId, userId),
      eq(ptcClicks.status, 'pending'),
      like(ptcClicks.taskId, `${ADSLAB_SHORTLINK_TASK_PREFIX}%`),
    ))
    .orderBy(desc(ptcClicks.createdAt))
    .limit(1)

  return timestampToMs(pending?.startedAt)
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  let failureStage = 'provider_feed'
  try {
    const providerFeed = await getAdsLabShortlinkTasks(request.headers, account.profile.id)
    failureStage = 'pending_shortlink_query'
    const latestPendingShortlinkStart = await loadLatestPendingShortlinkStart(account.profile.id)
    const taskIds = providerFeed.tasks.map((task) => task.key)
    let histories: Awaited<ReturnType<typeof loadShortlinkTaskHistory>> = []
    try {
      failureStage = 'task_history_query'
      histories = await loadShortlinkTaskHistory(account.profile.id, taskIds)
    } catch (dbErr) {
      const rawErrorCode = dbErr && typeof dbErr === 'object' && 'code' in dbErr ? dbErr.code : undefined
      const errorCode = typeof rawErrorCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawErrorCode) ? rawErrorCode : undefined
      console.error('[AdsLab Shortlinks] Task History DB Error:', {
        errorName: dbErr instanceof Error ? dbErr.name.slice(0, 64) : typeof dbErr,
        ...(errorCode ? { errorCode } : {}),
        ...(dbErr instanceof Error ? { message: dbErr.message.slice(0, 200) } : {}),
      })
      histories = []
    }
    failureStage = 'task_history_mapping'
    const safeHistories = Array.isArray(histories) ? histories : []
    const historyByTask = new Map(safeHistories.map((history) => [history.taskId, history]))
    const now = Date.now()
    const awaitingConfirmation = latestPendingShortlinkStart !== null
      && now - latestPendingShortlinkStart <= PENDING_GRACE_MS

    const tasks = providerFeed.tasks.flatMap((task) => {
      const history = historyByTask.get(task.key)
      const visitsCompleted = Math.max(0, Number(history?.completedCount ?? 0))
      const visitsRemaining = Math.max(0, task.visitsPerUser - visitsCompleted)
      if (visitsRemaining === 0) return []

      const pendingStartedAt = timestampToMs(history?.pendingStartedAt)
      const taskAwaitingConfirmation = awaitingConfirmation
        || (pendingStartedAt !== null && now - pendingStartedAt <= PENDING_GRACE_MS)
      const latestCompletedAt = timestampToMs(history?.latestCompletedAt)
      const cooldownUntil = latestCompletedAt === null
        ? 0
        : latestCompletedAt + task.cooldownMinutes * 60_000

      return [{
        key: task.key,
        title: task.title,
        description: task.description,
        url: task.url,
        iconUrl: task.iconUrl,
        rewardAtomic: String(task.rewardAtomic),
        tokenSymbol: task.tokenSymbol,
        cooldownMinutes: task.cooldownMinutes,
        visitsRemaining,
        cooldownRemainingSeconds: Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
        awaitingConfirmation: taskAwaitingConfirmation,
      }]
    })

    return NextResponse.json({ tasks, pepeUsdPrice: providerFeed.pepeUsdPrice, awaitingConfirmation }, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof AdsLabPtcError) {
      console.error('[adslab-shortlinks] task feed failed', {
        stage: error.diagnostic.stage,
        ...(error.diagnostic.providerStatus === undefined ? {} : { providerStatus: error.diagnostic.providerStatus }),
        ...(error.diagnostic.failureType === undefined ? {} : { failureType: error.diagnostic.failureType }),
      })
      return NextResponse.json({
        error: 'Shortlink tasks are temporarily unavailable.',
        code: error.diagnostic.stage,
        providerStatus: error.diagnostic.providerStatus,
      }, { status: error.statusCode, headers: noStoreHeaders })
    }
    const errorName = error instanceof Error ? error.name.slice(0, 64) : typeof error
    const rawErrorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const errorCode = typeof rawErrorCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawErrorCode) ? rawErrorCode : undefined
    console.error('[adslab-shortlinks] Could not load shortlink tasks.', {
      stage: failureStage,
      errorName,
      ...(errorCode ? { errorCode } : {}),
    })
    return NextResponse.json({ error: 'Could not load shortlink tasks.' }, { status: 500, headers: noStoreHeaders })
  }
}
