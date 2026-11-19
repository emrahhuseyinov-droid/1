import { NextResponse, type NextRequest } from 'next/server'
import { isRecord, readJsonBody } from '@/lib/arcade-service'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { claimDailyBonus, claimDailyMission } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await authorizeCrush(request, 'daily', 20, true)
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  if (!isRecord(body) || (body.kind !== 'bonus' && body.kind !== 'mission')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: crushHeaders })
  }
  try {
    const result = body.kind === 'bonus' ? await claimDailyBonus(auth.guestId) : await claimDailyMission(auth.guestId, body.code)
    return NextResponse.json(result, { headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'daily')
  }
}
