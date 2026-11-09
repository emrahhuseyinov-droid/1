import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { isRecord } from '@/lib/arcade-service'
import { claimWheelReward, WheelServiceError } from '@/lib/wheel-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body) || typeof body.spinId !== 'string' || !uuidPattern.test(body.spinId)) {
    return NextResponse.json({ error: 'A valid spin ID is required.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const result = await claimWheelReward(account.profile.id, body.spinId)
    return NextResponse.json({
      claimed: true,
      alreadyClaimed: result.alreadyClaimed,
      spin: result.spin,
      energy: result.energy,
    }, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof WheelServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStoreHeaders })
    }
    console.error('[wheel] Could not claim reward:', error)
    return NextResponse.json({ error: 'Could not collect this reward. Please try again.' }, { status: 500, headers: noStoreHeaders })
  }
}
