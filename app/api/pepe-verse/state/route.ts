import { NextResponse, type NextRequest } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { arcadeNoStoreHeaders, authorizeArcadeRequest } from '@/lib/arcade-service'
import { getPepeVerseState } from '@/lib/pepe-verse/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const access = await authorizeArcadeRequest(request)
  if ('response' in access) return access.response
  const limited = await enforceApiRateLimit('pepe-verse:state', access.guestId, { windowSeconds: 60, max: 60 })
  if (limited) return limited
  try {
    return NextResponse.json(await getPepeVerseState(access.guestId), { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[pepe-verse] state failed', error)
    return NextResponse.json({ error: 'PEPE VERSE is temporarily unavailable.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
