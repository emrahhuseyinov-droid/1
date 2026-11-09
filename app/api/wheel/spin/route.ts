import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isRecord } from '@/lib/arcade-service'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { startWheelSpin, WheelServiceError } from '@/lib/wheel-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const MAX_CAPTCHA_TOKEN_LENGTH = 16_384

type CaptchaVerification = 'valid' | 'invalid' | 'unavailable'

async function verifyAdsLabCaptcha(token: string): Promise<CaptchaVerification> {
  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) return 'unavailable'

  try {
    const response = await fetch('https://adslab.me/api/v1/captcha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const result: unknown = await response.json().catch(() => null)
    if (!isRecord(result)) return 'unavailable'
    if (result.success === true) return 'valid'
    if (response.status === 401 || response.status === 429 || response.status >= 500) return 'unavailable'
    return 'invalid'
  } catch {
    return 'unavailable'
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const body: unknown = await request.json().catch(() => null)
  const captchaToken = isRecord(body) && typeof body.captchaToken === 'string' ? body.captchaToken : ''
  if (!captchaToken || captchaToken.length > MAX_CAPTCHA_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Complete the AdsLab verification before spinning.' }, { status: 400, headers: noStoreHeaders })
  }

  const captchaResult = await verifyAdsLabCaptcha(captchaToken)
  if (captchaResult === 'invalid') {
    return NextResponse.json({ error: 'AdsLab could not verify that challenge. Please try again.' }, { status: 403, headers: noStoreHeaders })
  }
  if (captchaResult === 'unavailable') {
    return NextResponse.json({ error: 'AdsLab verification is temporarily unavailable. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }

  try {
    return NextResponse.json(await startWheelSpin(account.profile.id), { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof WheelServiceError) {
      return NextResponse.json({ error: error.message, code: error.code, nextAllowedAt: error.nextAllowedAt }, { status: error.status, headers: noStoreHeaders })
    }
    console.error('[wheel] Could not start spin:', error)
    return NextResponse.json({ error: 'Could not start a spin. Please try again.' }, { status: 500, headers: noStoreHeaders })
  }
}
