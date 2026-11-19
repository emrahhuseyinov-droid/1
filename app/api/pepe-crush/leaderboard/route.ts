import { NextResponse, type NextRequest } from 'next/server'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { getPepeCrushLeaderboard, type LeaderboardMetric, type LeaderboardScope } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

const SCOPES: LeaderboardScope[] = ['all', 'weekly']
const METRICS: LeaderboardMetric[] = ['levels', 'score', 'stars']

export async function GET(request: NextRequest) {
  const auth = await authorizeCrush(request, 'leaderboard', 40, false)
  if ('response' in auth) return auth.response
  const scope = request.nextUrl.searchParams.get('scope') as LeaderboardScope
  const metric = request.nextUrl.searchParams.get('metric') as LeaderboardMetric
  if (!SCOPES.includes(scope) || !METRICS.includes(metric)) {
    return NextResponse.json({ error: 'Invalid leaderboard.' }, { status: 400, headers: crushHeaders })
  }
  try {
    return NextResponse.json(await getPepeCrushLeaderboard(auth.guestId, scope, metric), { headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'leaderboard')
  }
}
