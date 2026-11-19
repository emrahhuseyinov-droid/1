import { NextResponse, type NextRequest } from 'next/server'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { getPepeCrushState } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeCrush(request, 'state', 60, false)
  if ('response' in auth) return auth.response
  try {
    return NextResponse.json(await getPepeCrushState(auth.guestId), { headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'state')
  }
}
