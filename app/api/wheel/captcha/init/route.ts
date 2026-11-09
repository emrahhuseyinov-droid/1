import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const adsLabApiOrigin = 'https://adslab.me'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSolveUrl(value: unknown) {
  if (!isRecord(value)) return null
  const nested = isRecord(value.data) ? value.data : value
  if (typeof nested.solve_url !== 'string') return null

  try {
    const url = new URL(nested.solve_url)
    if (url.protocol !== 'https:' || !(url.hostname === 'adslab.me' || url.hostname.endsWith('.adslab.me'))) return null
    return url.toString()
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

  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'AdsLab CAPTCHA is not configured.' }, { status: 503, headers: noStoreHeaders })
  }

  const returnUrl = new URL('/api/wheel/captcha/return', request.url)
  returnUrl.searchParams.set('parent_origin', new URL(request.url).origin)
  const placementId = process.env.ADSLAB_PLACEMENT_ID?.trim()

  try {
    const response = await fetch(`${adsLabApiOrigin}/api/v1/captcha/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        ...(placementId ? { placement_id: placementId } : {}),
        sub_id: account.profile.id,
        return_url: returnUrl.toString(),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const result: unknown = await response.json().catch(() => null)
    const solveUrl = response.ok ? readSolveUrl(result) : null
    if (!solveUrl) {
      console.error('[wheel/captcha] AdsLab could not create a challenge.', { status: response.status })
      return NextResponse.json({ error: 'AdsLab could not start the verification. Please try again.' }, { status: 502, headers: noStoreHeaders })
    }

    return NextResponse.json({ solveUrl }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[wheel/captcha] AdsLab initialization failed:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json({ error: 'AdsLab verification is temporarily unavailable. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
}
