import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { getClientIp, getCountryCode } from '@/lib/adslab-ptc'
import { createOfferwallMeSignedIdentity, OFFERWALL_ME_PTC_PUBLIC_API_KEY } from '@/lib/offerwall-me'
import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'
import { applyOfferwallMeEarnerShare, calculateOfferwallMeRewardAtomic, offerwallPointsToUsd } from '@/lib/offerwall-me-pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const offerwallOrigin = 'https://offerwall.me'

type UnknownRecord = Record<string, unknown>
type OfferwallPtcTask = {
  key: string
  title: string
  description: string
  url: string
  iconUrl: string | null
  durationSeconds: number
  rewardAtomic: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return result.length > 0 && result.length <= maxLength ? result : null
}

function parseDuration(value: unknown): number | null {
  const input = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : Number.NaN
  return Number.isSafeInteger(input) && input >= 1 && input <= 3600 ? input : null
}

function parseRewardAtomic(value: unknown, pepeUsdPrice: string): string | null {
  const rewardPoints = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : ''
  const rewardUsd = offerwallPointsToUsd(rewardPoints)
  if (!rewardUsd) return null

  const userRewardUsd = applyOfferwallMeEarnerShare(rewardUsd)
  if (!userRewardUsd) return null

  const rewardAtomic = calculateOfferwallMeRewardAtomic(userRewardUsd, pepeUsdPrice)
  return rewardAtomic === null ? null : String(rewardAtomic)
}

function parseOfferwallUrl(value: unknown): string | null {
  const input = readString(value, 4096)
  if (!input) return null

  try {
    const url = new URL(input)
    if (url.origin !== offerwallOrigin || url.username || url.password) return null
    return input
  } catch {
    return null
  }
}

function parseIconUrl(value: unknown): string | null {
  const input = readString(value, 2048)
  if (!input) return null

  try {
    const url = new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

function parseTask(value: unknown, pepeUsdPrice: string): OfferwallPtcTask | null {
  if (!isRecord(value)) return null

  const url = parseOfferwallUrl(value.url)
  const title = readString(value.title, 200) ?? readString(value.name, 200)
  const durationSeconds = parseDuration(value.duration)
  const rewardAtomic = parseRewardAtomic(value.reward, pepeUsdPrice)
  if (!url || !title || durationSeconds === null || rewardAtomic === null) return null

  const description = readString(value.description, 1200) ?? ''
  const key = createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 24)
  return {
    key: `offerwall:${key}`,
    title,
    description,
    url,
    iconUrl: parseIconUrl(value.image),
    durationSeconds,
    rewardAtomic,
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders })
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return jsonError('Please sign in first.', 401)

  const rateLimitResponse = await enforceApiRateLimit('offerwall-me-ptc-list', account.profile.id, { windowSeconds: 60, max: 40 })
  if (rateLimitResponse) return rateLimitResponse

  const ip = getClientIp(request.headers)
  const token = process.env.OFFERWALL_ME_BEARER_TOKEN?.trim() ?? ''
  const identity = createOfferwallMeSignedIdentity(account.profile.id, OFFERWALL_ME_PTC_PUBLIC_API_KEY)
  if (!token || !identity) return jsonError('PTC ads are not configured on the server.', 503)
  if (!ip) return jsonError('Could not determine your network address.', 400)

  const apiUrl = new URL('/api.php', offerwallOrigin)
  apiUrl.search = new URLSearchParams({
    api: OFFERWALL_ME_PTC_PUBLIC_API_KEY,
    id: account.profile.id,
    ip,
    token,
    country: getCountryCode(request.headers).toUpperCase(),
    identityExpires: identity.identityExpires,
    identitySignature: identity.identitySignature,
  }).toString()

  const userAgent = request.headers.get('user-agent')
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 512)

  try {
    const providerResponse = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (providerResponse.status === 404) return NextResponse.json({ tasks: [] }, { headers: noStoreHeaders })

    let payload: unknown
    try {
      payload = await providerResponse.json()
    } catch {
      console.warn('[offerwall-me-ptc] Provider returned an unreadable response.', { providerStatus: providerResponse.status })
      return jsonError('PTC ads are temporarily unavailable.', 502)
    }

    if (isRecord(payload) && Number(payload.status) === 404) {
      return NextResponse.json({ tasks: [] }, { headers: noStoreHeaders })
    }
    if (!providerResponse.ok || !isRecord(payload) || Number(payload.status) !== 200 || !Array.isArray(payload.data)) {
      console.warn('[offerwall-me-ptc] Provider feed request failed.', { providerStatus: providerResponse.status })
      return jsonError('PTC ads are temporarily unavailable.', 502)
    }

    if (payload.data.length === 0) return NextResponse.json({ tasks: [] }, { headers: noStoreHeaders })

    let pepeUsdPrice: string
    try {
      pepeUsdPrice = (await getFreshPepeUsdPrice()).toFixed(18).replace(/0+$/, '').replace(/\.$/, '')
    } catch {
      return jsonError('PEPE/USD reward quote is temporarily unavailable.', 503)
    }

    const tasks = payload.data.flatMap((item) => {
      const task = parseTask(item, pepeUsdPrice)
      return task ? [task] : []
    })
    return NextResponse.json({ tasks }, { headers: noStoreHeaders })
  } catch (error) {
    console.warn('[offerwall-me-ptc] Provider feed request failed.', {
      failureType: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
    })
    return jsonError('PTC ads are temporarily unavailable.', 502)
  }
}
