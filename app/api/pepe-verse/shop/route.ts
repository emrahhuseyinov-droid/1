import { NextResponse, type NextRequest } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, isRecord, readJsonBody } from '@/lib/arcade-service'
import { PepeVerseError, purchasePepeVerseSkin } from '@/lib/pepe-verse/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response
  const limited = await enforceApiRateLimit('pepe-verse:shop', access.guestId, { windowSeconds: 60, max: 10 })
  if (limited) return limited
  const body = await readJsonBody(request)
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: arcadeNoStoreHeaders })
  try {
    return NextResponse.json(await purchasePepeVerseSkin(access.guestId, body.skinId), { headers: arcadeNoStoreHeaders })
  } catch (error) {
    if (error instanceof PepeVerseError) return NextResponse.json({ error: error.message }, { status: error.status, headers: arcadeNoStoreHeaders })
    console.error('[pepe-verse] shop failed', error)
    return NextResponse.json({ error: 'Could not update your character.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
