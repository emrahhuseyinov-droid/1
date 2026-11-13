import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { wheelCaptchaSessions } from '@/lib/db/schema'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const adsLabApiOrigin = 'https://adslab.me'
const captchaSessionTtlMs = 15 * 60 * 1000
const maxCaptchaTokenLength = 16_384

type AdsLabCaptchaChallenge = { solveUrl: string; challengeToken: string | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCaptchaChallenge(value: unknown): AdsLabCaptchaChallenge | null {
  if (!isRecord(value)) return null
  const nested = isRecord(value.data) ? value.data : value
  if (nested.success !== true && value.success !== true) return null
  if (typeof nested.solve_url !== 'string') return null
  const challengeToken = typeof nested.token === 'string' && nested.token.length > 0 && nested.token.length <= maxCaptchaTokenLength
    ? nested.token
    : null

  try {
    const url = new URL(nested.solve_url)
    if (url.protocol !== 'https:' || !(url.hostname === 'adslab.me' || url.hostname.endsWith('.adslab.me'))) return null
    return { solveUrl: url.toString(), challengeToken }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const body: unknown = await request.json().catch(() => null)
  const input = isRecord(body) ? body : {}
  const requestedPurpose = input.purpose
  const purpose = requestedPurpose === undefined || requestedPurpose === 'wheel'
    ? 'wheel'
    : requestedPurpose === 'daily_bonus'
      ? 'daily_bonus'
      : null
  if (!purpose) return NextResponse.json({ error: 'A valid CAPTCHA purpose is required.' }, { status: 400, headers: noStoreHeaders })

  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'CAPTCHA verification is not configured.' }, { status: 503, headers: noStoreHeaders })
  }

  const captchaSessionId = randomUUID()
  const returnUrl = new URL('/api/wheel/captcha/return', request.url)
  returnUrl.searchParams.set('state', captchaSessionId)
  returnUrl.searchParams.set('purpose', purpose)

  try {
    const response = await fetch(`${adsLabApiOrigin}/api/v1/captcha/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        sub_id: captchaSessionId,
        return_url: returnUrl.toString(),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const result: unknown = await response.json().catch(() => null)
    const challenge = response.ok ? readCaptchaChallenge(result) : null
    if (!challenge) {
      console.error('[wheel/captcha] AdsLab could not create a challenge.', { status: response.status })
      return NextResponse.json({ error: 'Could not start CAPTCHA verification. Please try again.' }, { status: 502, headers: noStoreHeaders })
    }

    const now = new Date()
    await db.insert(wheelCaptchaSessions).values({
      id: captchaSessionId,
      guestId: account.profile.id,
      purpose,
      status: 'pending',
      createdAt: now,
      expiresAt: new Date(now.getTime() + captchaSessionTtlMs),
    })

    return NextResponse.json({
      solveUrl: challenge.solveUrl,
      challengeToken: challenge.challengeToken,
      captchaSessionId,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[wheel/captcha] AdsLab initialization failed:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json({ error: 'CAPTCHA verification is temporarily unavailable. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
}
