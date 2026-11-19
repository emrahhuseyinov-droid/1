import { NextResponse, type NextRequest } from 'next/server'
import { isRecord, isUuid, readJsonBody } from '@/lib/arcade-service'
import { authorizeCrush, crushError, crushHeaders } from '@/lib/pepe-crush/api'
import { finishPepeCrushSession } from '@/lib/pepe-crush/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await authorizeCrush(request, 'finish', 30, true)
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  if (!isRecord(body) || !isUuid(body.sessionId)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: crushHeaders })
  }
  try {
    const result = await finishPepeCrushSession(auth.guestId, body.sessionId, body.actions, body.gaveUp === true)
    return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: crushHeaders })
  } catch (error) {
    return crushError(error, 'finish')
  }
}
