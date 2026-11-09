import { NextRequest, NextResponse } from 'next/server'
import { authorizeArcadeRequest, arcadeNoStoreHeaders, getArcadeState } from '@/lib/arcade-service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeArcadeRequest(request)
    if ('response' in access) return access.response
    const state = await getArcadeState(access.guestId)
    return NextResponse.json(state, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-state] Could not load arcade state:', error)
    return NextResponse.json({ error: 'Could not load arcade data.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
