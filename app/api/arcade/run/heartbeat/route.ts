import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcadeSessions } from '@/lib/db/schema'
import { ARCADE_HEARTBEAT_GRACE_MS } from '@/lib/arcade-gameplay'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, isRecord, isUuid, readJsonBody } from '@/lib/arcade-service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response

  const body = await readJsonBody(request)
  if (!isRecord(body) || !isUuid(body.sessionId) || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Invalid heartbeat.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  const sessionId = body.sessionId

  try {
    const result = await db.transaction(async (transaction) => {
      const [session] = await transaction
        .select()
        .from(arcadeSessions)
        .where(and(eq(arcadeSessions.id, sessionId), eq(arcadeSessions.guestId, access.guestId)))
        .for('update')
        .limit(1)
      if (!session) return { status: 'not_found' as const }
      if (session.status !== 'running') return { status: 'closed' as const }

      const now = new Date()

      if (!body.active) {
        if (!session.pausedAt) {
          await transaction.update(arcadeSessions).set({ pausedAt: now, lastHeartbeatAt: now }).where(eq(arcadeSessions.id, session.id))
        }
        return { status: 'paused' as const }
      }

      if (session.pausedAt) {
        const pauseDuration = Math.max(0, now.getTime() - session.pausedAt.getTime())
        await transaction.update(arcadeSessions).set({
          pausedAt: null,
          pausedDurationMs: session.pausedDurationMs + pauseDuration,
          lastHeartbeatAt: now,
        }).where(eq(arcadeSessions.id, session.id))
        return { status: 'resumed' as const }
      }

      if (now.getTime() - session.lastHeartbeatAt.getTime() > ARCADE_HEARTBEAT_GRACE_MS) {
        await transaction.update(arcadeSessions).set({ status: 'abandoned', finishedAt: now }).where(eq(arcadeSessions.id, session.id))
        return { status: 'stale' as const }
      }
      await transaction.update(arcadeSessions).set({ lastHeartbeatAt: now }).where(eq(arcadeSessions.id, session.id))
      return { status: 'active' as const }
    })

    if (result.status === 'not_found') return NextResponse.json({ error: 'Run not found.' }, { status: 404, headers: arcadeNoStoreHeaders })
    if (result.status === 'closed') return NextResponse.json({ error: 'This run is already closed.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'stale') return NextResponse.json({ error: 'The run ended after its heartbeat expired.' }, { status: 409, headers: arcadeNoStoreHeaders })
    return NextResponse.json({ active: result.status !== 'paused', paused: result.status === 'paused' }, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-run-heartbeat] Could not record heartbeat:', error)
    return NextResponse.json({ error: 'Could not update the active run.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
