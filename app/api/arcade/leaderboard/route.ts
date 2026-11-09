import { NextRequest, NextResponse } from 'next/server'
import { authorizeArcadeRequest, arcadeNoStoreHeaders, getArcadeLeaderboard, getUtcWeekWindow } from '@/lib/arcade-service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeArcadeRequest(request)
    if ('response' in access) return access.response
    const week = getUtcWeekWindow()
    const leaderboard = await getArcadeLeaderboard(week.start, week.end, access.guestId)
    return NextResponse.json({ periodStart: week.periodStart, periodEnd: week.end.toISOString(), leaderboard }, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-leaderboard] Could not load leaderboard:', error)
    return NextResponse.json({ error: 'Could not load the weekly leaderboard.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
