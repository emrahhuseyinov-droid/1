import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { ADSLAB_PTC_TASK_PREFIX, parseHomeroPayoutAtomic } from '@/lib/adslab-ptc'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, ptcClicks } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const clickIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const clickId = await readClickId(request)
  if (!clickId) return NextResponse.json({ error: 'Invalid click ID.' }, { status: 400, headers: noStoreHeaders })

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
        .select({
          clickId: ptcClicks.clickId,
          taskId: ptcClicks.taskId,
          status: ptcClicks.status,
          createdAt: ptcClicks.createdAt,
          durationSeconds: ptcClicks.durationSeconds,
          payout: ptcClicks.payout,
          payoutTokenSymbol: ptcClicks.payoutTokenSymbol,
        })
        .from(ptcClicks)
        .where(and(eq(ptcClicks.clickId, clickId), eq(ptcClicks.userId, account.profile.id)))
        .limit(1)
      if (!click || !click.taskId.startsWith(ADSLAB_PTC_TASK_PREFIX)) return { status: 'not_found' as const }
      if (click.status === 'rejected') return { status: 'rejected' as const }

      const [existingCredit] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, 'adslab_ptc'),
          eq(earningEvents.sourceKey, click.clickId),
        ))
        .limit(1)
      if (existingCredit) return { status: 'already_credited' as const, rewardAtomic: existingCredit.rewardAtomic, tokenSymbol: existingCredit.tokenSymbol }

      const rewardAtomic = parseHomeroPayoutAtomic(click.payout)
      if (rewardAtomic === null) return { status: 'invalid_payout' as const }

      const now = new Date()
      const elapsedMs = now.getTime() - click.createdAt.getTime()
      const requiredMs = Math.max(0, click.durationSeconds) * 1000
      if (elapsedMs < requiredMs) {
        return { status: 'too_early' as const, remainingSeconds: Math.max(1, Math.ceil((requiredMs - elapsedMs) / 1000)) }
      }

      return { status: 'awaiting_postback' as const, tokenSymbol: click.payoutTokenSymbol }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Partner task was not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'rejected') return NextResponse.json({ error: 'This task session was cancelled.', code: result.status }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'invalid_payout') return NextResponse.json({ error: 'This task reward could not be verified.' }, { status: 500, headers: noStoreHeaders })
    if (result.status === 'too_early') {
      return NextResponse.json({ error: 'The task timer has not finished.', code: result.status, remainingSeconds: result.remainingSeconds }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'already_credited') {
      return NextResponse.json({ credited: true, alreadyCredited: true, rewardAtomic: String(result.rewardAtomic), tokenSymbol: result.tokenSymbol }, { headers: noStoreHeaders })
    }
    if (result.status === 'awaiting_postback') {
      return NextResponse.json({ credited: false, awaitingPostback: true }, { status: 202, headers: noStoreHeaders })
    }

    return NextResponse.json({ error: 'Could not credit this partner task.' }, { status: 500, headers: noStoreHeaders })
  } catch {
    console.error('[adslab-ptc] Could not credit partner task.')
    return NextResponse.json({ error: 'Could not credit this partner task.' }, { status: 500, headers: noStoreHeaders })
  }
}
