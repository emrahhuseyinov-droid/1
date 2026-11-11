import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { AdsLabCaptchaError, fetchAdsLabCaptchaStatus, readManualFaucetCaptchaStateToken } from '@/lib/manual-faucet-captcha'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const rateLimitResponse = await enforceApiRateLimit('manual-faucet-captcha-status', account.profile.id, { windowSeconds: 60, max: 25 })
  if (rateLimitResponse) return rateLimitResponse

  const values = request.nextUrl.searchParams.getAll('state')
  const state = values.length === 1 ? readManualFaucetCaptchaStateToken(values[0]) : null
  if (!state) return NextResponse.json({ error: 'A valid CAPTCHA session is required.' }, { status: 400, headers: noStoreHeaders })
  if (state.guestId !== account.profile.id.toLowerCase()) {
    return NextResponse.json({ error: 'This CAPTCHA session does not belong to your account.' }, { status: 403, headers: noStoreHeaders })
  }

  try {
    const result = await fetchAdsLabCaptchaStatus(state.sessionId)
    if (result.success && result.status === 'solved') {
      return NextResponse.json({ status: 'verified' }, { headers: noStoreHeaders })
    }
    if (['failed', 'expired', 'cancelled', 'rejected'].includes(result.status)) {
      return NextResponse.json({ status: 'failed' }, { headers: noStoreHeaders })
    }
    return NextResponse.json({ status: 'pending' }, { headers: noStoreHeaders })
  } catch (error) {
    const status = error instanceof AdsLabCaptchaError ? error.status : 503
    const message = error instanceof AdsLabCaptchaError ? error.message : 'Could not check CAPTCHA verification.'
    return NextResponse.json({ error: message }, { status, headers: noStoreHeaders })
  }
}
