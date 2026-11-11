import { isIP } from 'node:net'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const aliasPattern = /^[A-Za-z0-9_-]{2,40}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDestination(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null

  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const ipAddress = hostname.replace(/^\[|\]$/g, '')
    if (
      url.protocol !== 'https:'
      || !hostname
      || url.username
      || url.password
      || isIP(ipAddress)
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeShortenedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'adslab.me' ? url.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.', code: 'invalid_origin' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.', code: 'authentication_required' }, { status: 401, headers: noStoreHeaders })

  const limited = await enforceApiRateLimit('adslab-shortener', account.session.user.id, { windowSeconds: 60 * 60, max: 10 })
  if (limited) return limited

  const apiKey = process.env.ADSLAB_SHORTENER_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Shortlink service is not configured.', code: 'configuration_missing' }, { status: 503, headers: noStoreHeaders })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return NextResponse.json({ error: 'Request is too large.', code: 'request_too_large' }, { status: 413, headers: noStoreHeaders })
  }

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid link details.', code: 'invalid_input' }, { status: 400, headers: noStoreHeaders })

  const destinationUrl = normalizeDestination(body.url)
  const alias = typeof body.alias === 'string' ? body.alias.trim() : ''
  if (!destinationUrl || (alias !== '' && !aliasPattern.test(alias))) {
    return NextResponse.json({ error: 'Enter a valid HTTPS URL and optional alias.', code: 'invalid_input' }, { status: 400, headers: noStoreHeaders })
  }

  const endpoint = new URL('https://adslab.me/api')
  endpoint.searchParams.set('api', apiKey)
  endpoint.searchParams.set('url', destinationUrl)
  if (alias) endpoint.searchParams.set('alias', alias)

  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    console.error('[adslab-shortener] Provider request failed.', {
      errorName: error instanceof Error ? error.name.slice(0, 64) : typeof error,
    })
    return NextResponse.json({ error: 'The link could not be shortened.', code: 'upstream_unavailable' }, { status: 502, headers: noStoreHeaders })
  }

  const result: unknown = await response.json().catch(() => null)
  const shortenedUrl = isRecord(result) && result.status === 'success'
    ? normalizeShortenedUrl(result.shortenedUrl)
    : null

  if (!response.ok || !shortenedUrl) {
    console.error('[adslab-shortener] Provider returned an invalid response.', { status: response.status })
    return NextResponse.json({ error: 'The link could not be shortened.', code: 'upstream_failed' }, { status: 502, headers: noStoreHeaders })
  }

  return NextResponse.json({ shortenedUrl }, { headers: noStoreHeaders })
}
