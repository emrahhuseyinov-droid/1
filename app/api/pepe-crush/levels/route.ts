import { NextResponse, type NextRequest } from 'next/server'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { getLevelResultsRange } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeCrush(request, 'levels', 90, false)
  if ('response' in auth) return auth.response
  const from = Number(request.nextUrl.searchParams.get('from') ?? '1')
  const count = Number(request.nextUrl.searchParams.get('count') ?? '30')
  if (!Number.isFinite(from) || !Number.isFinite(count)) {
    return NextResponse.json({ error: 'Invalid range.' }, { status: 400, headers: crushHeaders })
  }
  try {
    return NextResponse.json({ results: await getLevelResultsRange(auth.guestId, from, count) }, { headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'levels')
  }
}
