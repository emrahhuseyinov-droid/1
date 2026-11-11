import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isRecord } from '@/lib/arcade-service'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { startWheelSpin, WheelServiceError } from '@/lib/wheel-service'

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
  const captchaSessionId = isRecord(body) && typeof body.captchaSessionId === 'string' ? body.captchaSessionId : ''
  if (!uuidPattern.test(captchaSessionId)) {
    return NextResponse.json({ error: 'Complete CAPTCHA verification before spinning.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    return NextResponse.json(await startWheelSpin(account.profile.id, captchaSessionId), { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof WheelServiceError) {
      return NextResponse.json({ error: error.message, code: error.code, nextAllowedAt: error.nextAllowedAt }, { status: error.status, headers: noStoreHeaders })
    }
    console.error('[wheel] Could not start spin:', error)
    return NextResponse.json({ error: 'Could not start a spin. Please try again.' }, { status: 500, headers: noStoreHeaders })
  }
}
