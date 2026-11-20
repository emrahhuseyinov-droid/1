import { NextResponse, type NextRequest } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { authorizeArcadeRequest, arcadeNoStoreHeaders, isRecord, readJsonBody } from '@/lib/arcade-service'
import { claimPepeVerseDaily, claimPepeVerseTask, claimPepeVerseTournament, PepeVerseError } from '@/lib/pepe-verse/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response
  const limited = await enforceApiRateLimit('pepe-verse:claim', access.guestId, { windowSeconds: 60, max: 12 })
  if (limited) return limited
  const body = await readJsonBody(request)
  if (!isRecord(body) || !['daily', 'task', 'tournament'].includes(String(body.kind))) {
    return NextResponse.json({ error: 'Choose a valid reward.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  try {
    const result = body.kind === 'daily'
      ? await claimPepeVerseDaily(access.guestId)
      : body.kind === 'task'
        ? await claimPepeVerseTask(access.guestId, body.code)
        : await claimPepeVerseTournament(access.guestId)
    return NextResponse.json(result, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    if (error instanceof PepeVerseError) return NextResponse.json({ error: error.message }, { status: error.status, headers: arcadeNoStoreHeaders })
    console.error('[pepe-verse] claim failed', error)
    return NextResponse.json({ error: 'Could not claim this reward.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
