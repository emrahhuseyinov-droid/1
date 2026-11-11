import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { createManualFaucetCaptchaStateToken, getManualFaucetCaptchaExpiry, readAdsLabCaptchaChallenge } from '@/lib/manual-faucet-captcha'
import { getManualFaucetState } from '@/lib/manual-faucet'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const adsLabApiOrigin = 'https://adslab.me'

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const rateLimitResponse = await enforceApiRateLimit('manual-faucet-captcha-init', account.profile.id, { windowSeconds: 60, max: 3 })
  if (rateLimitResponse) return rateLimitResponse

  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'CAPTCHA verification is not configured.' }, { status: 503, headers: noStoreHeaders })

  const state = await getManualFaucetState(account.profile.id)
  if (state.claimsLeft <= 0) return NextResponse.json({ error: 'You have reached today’s faucet claim limit.' }, { status: 429, headers: noStoreHeaders })
  if (state.cooldownUntil > Date.now()) {
    return NextResponse.json({ error: 'Your next faucet claim is not ready yet.' }, { status: 429, headers: noStoreHeaders })
  }

  const sessionId = randomUUID()
  const expiresAt = getManualFaucetCaptchaExpiry()
  let stateToken: string
  try {
    stateToken = createManualFaucetCaptchaStateToken({ sessionId, guestId: account.profile.id, expiresAt })
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 503
    return NextResponse.json({ error: 'CAPTCHA verification is not configured.' }, { status, headers: noStoreHeaders })
  }

  const returnUrl = new URL('/api/manual-faucet/captcha/return', request.url)
  returnUrl.searchParams.set('state', stateToken)

  try {
    const response = await fetch(`${adsLabApiOrigin}/api/v1/captcha/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        sub_id: sessionId,
        return_url: returnUrl.toString(),
        domain: request.nextUrl.hostname,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const result: unknown = await response.json().catch(() => null)
    const challenge = response.ok ? readAdsLabCaptchaChallenge(result) : null
    if (!challenge) {
      console.error('[manual-faucet/captcha] AdsLab could not create a challenge.', { status: response.status })
      return NextResponse.json({ error: 'Could not start CAPTCHA verification. Please try again.' }, { status: 502, headers: noStoreHeaders })
    }

    return NextResponse.json({
      solveUrl: challenge.solveUrl,
      challengeToken: challenge.challengeToken,
      captchaSessionId: sessionId,
      stateToken,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[manual-faucet/captcha] AdsLab initialization failed:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json({ error: 'CAPTCHA verification is temporarily unavailable. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
}
