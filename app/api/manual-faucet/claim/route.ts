import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { AdsLabCaptchaError, fetchAdsLabCaptchaStatus, readManualFaucetCaptchaStateToken } from '@/lib/manual-faucet-captcha'
import { claimManualFaucet, ManualFaucetError } from '@/lib/manual-faucet'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const rateLimitResponse = await enforceApiRateLimit('manual-faucet-claim', account.profile.id, { windowSeconds: 60, max: 5 })
  if (rateLimitResponse) return rateLimitResponse

  const body: unknown = await request.json().catch(() => null)
  const stateToken = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).stateToken
    : null
  const state = readManualFaucetCaptchaStateToken(stateToken)
  if (!state) return NextResponse.json({ error: 'A valid CAPTCHA session is required.' }, { status: 400, headers: noStoreHeaders })
  if (state.guestId !== account.profile.id.toLowerCase()) {
    return NextResponse.json({ error: 'This CAPTCHA session does not belong to your account.' }, { status: 403, headers: noStoreHeaders })
  }

  try {
    const captcha = await fetchAdsLabCaptchaStatus(state.sessionId)
    if (!captcha.success || captcha.status !== 'solved') {
      return NextResponse.json({ error: 'AdsLab has not confirmed the CAPTCHA yet.' }, { status: 403, headers: noStoreHeaders })
    }

    const result = await claimManualFaucet(account.profile.id, state.sessionId)
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof ManualFaucetError) {
      return NextResponse.json({ error: error.message, code: error.code, cooldownUntil: error.cooldownUntil }, { status: error.status, headers: noStoreHeaders })
    }
    if (error instanceof AdsLabCaptchaError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStoreHeaders })
    }
    console.error('[manual-faucet] Claim failed:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json({ error: 'Could not claim the HOMERO reward. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
}
