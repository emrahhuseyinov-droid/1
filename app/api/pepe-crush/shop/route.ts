import { NextResponse, type NextRequest } from 'next/server'
import { isRecord, readJsonBody } from '@/lib/arcade-service'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { buyBooster } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await authorizeCrush(request, 'shop', 30, true)
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: crushHeaders })
  try {
    return NextResponse.json(await buyBooster(auth.guestId, body.code), { headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'shop')
  }
}
