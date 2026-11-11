import { randomUUID } from 'node:crypto'
import { and, desc, eq, like, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import {
  ADSLAB_PTC_TASK_PREFIX,
  AdsLabPtcError,
  formatPepePayoutAtomic,
  getAdsLabPtcTasks,
  parseHomeroPayoutAtomic,
} from '@/lib/adslab-ptc'
import { db } from '@/lib/db'
import { guestProfiles, ptcClicks } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const taskKeyPattern = /^adslab:[0-9a-f]{64}$/i
const clickIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PENDING_GRACE_MS = 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readTaskKey(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (!isRecord(body) || typeof body.taskKey !== 'string' || !taskKeyPattern.test(body.taskKey)) return null
    return { taskKey: body.taskKey.toLowerCase() }
  } catch {
    return null
  }
}

async function readClickId(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (!isRecord(body) || typeof body.clickId !== 'string' || !clickIdPattern.test(body.clickId)) return null
    return body.clickId.toLowerCase()
  } catch {
    return null
  }
}

function providerErrorResponse(error: unknown) {
  if (error instanceof AdsLabPtcError) {
    return NextResponse.json({ error: 'Partner tasks are temporarily unavailable.' }, { status: error.statusCode, headers: noStoreHeaders })
  }
  console.error('[adslab-ptc] Could not start partner task.')
  return NextResponse.json({ error: 'Could not start this partner task.' }, { status: 500, headers: noStoreHeaders })
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const taskInput = await readTaskKey(request)
  if (!taskInput) return NextResponse.json({ error: 'This task is not available.' }, { status: 400, headers: noStoreHeaders })

  try {
    const clickId = randomUUID()
    const providerFeed = await getAdsLabPtcTasks(request.headers, account.profile.id)
    const task = providerFeed.tasks.find((candidate) => candidate.key === taskInput.taskKey)
    if (!task) return NextResponse.json({ error: 'This task is no longer available.' }, { status: 409, headers: noStoreHeaders })

    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'profile_missing' as const }

      const now = new Date()
      const pendingClicks = await transaction
        .select({ clickId: ptcClicks.clickId, taskId: ptcClicks.taskId, createdAt: ptcClicks.createdAt, durationSeconds: ptcClicks.durationSeconds, payout: ptcClicks.payout, payoutTokenSymbol: ptcClicks.payoutTokenSymbol, pepeUsdPrice: ptcClicks.pepeUsdPrice })
        .from(ptcClicks)
        .where(and(
          eq(ptcClicks.userId, account.profile.id),
          eq(ptcClicks.status, 'pending'),
          like(ptcClicks.taskId, `${ADSLAB_PTC_TASK_PREFIX}%`),
        ))
        .orderBy(desc(ptcClicks.createdAt))
        .for('update')

      for (const pending of pendingClicks) {
        const pendingDuration = pending.durationSeconds > 0 ? pending.durationSeconds : task.durationSeconds
        const elapsedMs = now.getTime() - pending.createdAt.getTime()
        if (elapsedMs > pendingDuration * 1000 + PENDING_GRACE_MS) {
          await transaction
            .update(ptcClicks)
            .set({ status: 'rejected', updatedAt: now })
            .where(and(eq(ptcClicks.clickId, pending.clickId), eq(ptcClicks.userId, account.profile.id), eq(ptcClicks.status, 'pending')))
          continue
        }

        if (pending.taskId === task.key) {
          if (elapsedMs >= pendingDuration * 1000) return { status: 'awaiting_confirmation' as const }
          const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
          return {
            status: 'started' as const,
            clickId: pending.clickId,
            directLink: task.url,
            timerSeconds: Math.max(0, pendingDuration - elapsedSeconds),
            rewardAtomic: String(parseHomeroPayoutAtomic(pending.payout) ?? task.rewardAtomic),
            tokenSymbol: pending.payoutTokenSymbol,
            pepeUsdPrice: pending.pepeUsdPrice ?? task.pepeUsdPrice,
          }
        }

        if (elapsedMs < pendingDuration * 1000) {
          return {
            status: 'busy' as const,
            remainingSeconds: Math.max(1, Math.ceil((pendingDuration * 1000 - elapsedMs) / 1000)),
          }
        }
      }

      const [history] = await transaction
        .select({
          completedCount: sql<number>`count(*)::int`,
          latestCompletedAt: sql<Date | null>`max(${ptcClicks.updatedAt})`,
        })
        .from(ptcClicks)
        .where(and(
          eq(ptcClicks.userId, account.profile.id),
          eq(ptcClicks.taskId, task.key),
          eq(ptcClicks.status, 'completed'),
        ))

      if (Number(history?.completedCount ?? 0) >= task.visitsPerUser) return { status: 'already_completed' as const }

      if (history?.latestCompletedAt && task.cooldownMinutes > 0) {
        const availableAt = history.latestCompletedAt.getTime() + task.cooldownMinutes * 60_000
        if (availableAt > now.getTime()) {
          return {
            status: 'cooldown' as const,
            remainingSeconds: Math.max(1, Math.ceil((availableAt - now.getTime()) / 1000)),
          }
        }
      }

      await transaction.insert(ptcClicks).values({
        userId: account.profile.id,
        clickId,
        taskId: task.key,
        status: 'pending',
        payout: formatPepePayoutAtomic(task.rewardAtomic),
        payoutTokenSymbol: task.tokenSymbol,
        rewardUsd: task.rewardUsd,
        pepeUsdPrice: task.pepeUsdPrice,
        durationSeconds: task.durationSeconds,
        visitsPerUser: task.visitsPerUser,
        cooldownMinutes: task.cooldownMinutes,
        createdAt: now,
        updatedAt: now,
      })

      return {
        status: 'started' as const,
        clickId,
        directLink: task.url,
        timerSeconds: task.durationSeconds,
        rewardAtomic: String(task.rewardAtomic),
        tokenSymbol: task.tokenSymbol,
        pepeUsdPrice: task.pepeUsdPrice,
      }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'already_completed') return NextResponse.json({ error: 'You have completed all visits for this task.', code: result.status }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'cooldown') return NextResponse.json({ error: 'This task is cooling down.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 429, headers: noStoreHeaders })
    if (result.status === 'busy') return NextResponse.json({ error: 'Finish or resume your current partner task first.', code: 'task_in_progress', remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'awaiting_confirmation') {
      return NextResponse.json({ error: 'This task is still being verified. You can continue with other tasks.', code: result.status }, { status: 409, headers: noStoreHeaders })
    }

    return NextResponse.json({
      clickId: result.clickId,
      directLink: result.directLink,
      timerSeconds: result.timerSeconds,
      rewardAtomic: result.rewardAtomic,
      tokenSymbol: result.tokenSymbol,
      pepeUsdPrice: result.pepeUsdPrice,
    }, { headers: noStoreHeaders })
  } catch (error) {
    return providerErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const clickId = await readClickId(request)
  if (!clickId) return NextResponse.json({ error: 'Invalid click ID.' }, { status: 400, headers: noStoreHeaders })

  try {
    await db
      .update(ptcClicks)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(
        eq(ptcClicks.clickId, clickId),
        eq(ptcClicks.userId, account.profile.id),
        eq(ptcClicks.status, 'pending'),
        like(ptcClicks.taskId, `${ADSLAB_PTC_TASK_PREFIX}%`),
      ))

    return NextResponse.json({ cancelled: true }, { headers: noStoreHeaders })
  } catch {
    console.error('[adslab-ptc] Could not cancel partner task.')
    return NextResponse.json({ error: 'Could not cancel this partner task.' }, { status: 500, headers: noStoreHeaders })
  }
}
