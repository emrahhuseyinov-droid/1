import { randomUUID } from 'node:crypto'
import { and, desc, eq, like, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import {
  ADSLAB_SHORTLINK_TASK_PREFIX,
  AdsLabPtcError,
  formatPepePayoutAtomic,
  getAdsLabShortlinkTasks,
} from '@/lib/adslab-ptc'
import { db } from '@/lib/db'
import { guestProfiles, ptcClicks } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const taskKeyPattern = /^adslab-shortlinks:[0-9a-f]{64}$/i
const PENDING_GRACE_MS = 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readTaskKey(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (!isRecord(body) || typeof body.taskKey !== 'string' || !taskKeyPattern.test(body.taskKey)) return null
    return body.taskKey.toLowerCase()
  } catch {
    return null
  }
}

function providerErrorResponse(error: unknown) {
  if (error instanceof AdsLabPtcError) {
    return NextResponse.json({ error: 'Shortlink tasks are temporarily unavailable.' }, { status: error.statusCode, headers: noStoreHeaders })
  }
  console.error('[adslab-shortlinks] Could not start shortlink task.')
  return NextResponse.json({ error: 'Could not start this shortlink.' }, { status: 500, headers: noStoreHeaders })
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const taskKey = await readTaskKey(request)
  if (!taskKey) return NextResponse.json({ error: 'This shortlink is not available.' }, { status: 400, headers: noStoreHeaders })

  try {
    const providerFeed = await getAdsLabShortlinkTasks(request.headers, account.profile.id)
    const task = providerFeed.tasks.find((candidate) => candidate.key === taskKey)
    if (!task) return NextResponse.json({ error: 'This shortlink is no longer available.' }, { status: 409, headers: noStoreHeaders })

    const clickId = randomUUID()
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
        .select({ clickId: ptcClicks.clickId, createdAt: ptcClicks.createdAt })
        .from(ptcClicks)
        .where(and(
          eq(ptcClicks.userId, account.profile.id),
          eq(ptcClicks.status, 'pending'),
          like(ptcClicks.taskId, `${ADSLAB_SHORTLINK_TASK_PREFIX}%`),
        ))
        .orderBy(desc(ptcClicks.createdAt))
        .for('update')

      for (const pending of pendingClicks) {
        if (now.getTime() - pending.createdAt.getTime() > PENDING_GRACE_MS) {
          await transaction
            .update(ptcClicks)
            .set({ status: 'rejected', updatedAt: now })
            .where(and(
              eq(ptcClicks.clickId, pending.clickId),
              eq(ptcClicks.userId, account.profile.id),
              eq(ptcClicks.status, 'pending'),
            ))
        }
      }

      if (pendingClicks.some((pending) => now.getTime() - pending.createdAt.getTime() <= PENDING_GRACE_MS)) {
        return { status: 'awaiting_confirmation' as const }
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
        durationSeconds: 0,
        visitsPerUser: task.visitsPerUser,
        cooldownMinutes: task.cooldownMinutes,
        createdAt: now,
        updatedAt: now,
      })

      return { status: 'started' as const }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'already_completed') return NextResponse.json({ error: 'You have completed all visits for this shortlink.', code: result.status }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'cooldown') return NextResponse.json({ error: 'This shortlink is cooling down.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 429, headers: noStoreHeaders })
    if (result.status === 'awaiting_confirmation') {
      return NextResponse.json({ error: 'AdsLab is still confirming a shortlink. Please wait before starting another.', code: result.status }, { status: 409, headers: noStoreHeaders })
    }

    return NextResponse.json({ clickId, directLink: task.url }, { headers: noStoreHeaders })
  } catch (error) {
    return providerErrorResponse(error)
  }
}
