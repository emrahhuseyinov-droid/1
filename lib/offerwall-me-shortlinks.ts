import 'server-only'
import { createHash } from 'node:crypto'
import { getClientIp, getCountryCode } from '@/lib/adslab-ptc'
import { createOfferwallMeSignedIdentity, OFFERWALL_ME_PUBLIC_API_KEY } from '@/lib/offerwall-me'
import { applyOfferwallMeEarnerShare, calculateOfferwallMeRewardAtomic, offerwallPointsToUsd } from '@/lib/offerwall-me-pricing'
import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'

const offerwallOrigin = 'https://offerwall.me'
const taskKeyPrefix = 'offerwall-me-shortlinks:'

type UnknownRecord = Record<string, unknown>

export type OfferwallMeShortlinkTask = {
  key: string
  title: string
  description: string
  url: string
  rewardAtomic: string
  remainingViews: number
}

export class OfferwallMeShortlinksError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'OfferwallMeShortlinksError'
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return result.length > 0 && result.length <= maxLength ? result : null
}

function parseCount(value: unknown): number | null {
  const input = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d{1,10}$/.test(value)
      ? Number(value)
      : Number.NaN
  return Number.isSafeInteger(input) && input >= 0 && input <= 2_147_483_647 ? input : null
}

function parseUrl(value: unknown): string | null {
  const input = readString(value, 4096)
  if (!input) return null

  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseRewardAtomic(value: unknown, pepeUsdPrice: string): string | null {
  const points = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : ''
  const rewardUsd = offerwallPointsToUsd(points)
  if (!rewardUsd) return null

  const userRewardUsd = applyOfferwallMeEarnerShare(rewardUsd)
  if (!userRewardUsd) return null

  const rewardAtomic = calculateOfferwallMeRewardAtomic(userRewardUsd, pepeUsdPrice)
  return rewardAtomic === null ? null : String(rewardAtomic)
}

function parseTask(value: unknown, userId: string, pepeUsdPrice: string): OfferwallMeShortlinkTask | null {
  if (!isRecord(value)) return null

  const id = readString(value.id, 200)
  const title = readString(value.name, 200)
  const url = parseUrl(value.url)
  const rewardAtomic = parseRewardAtomic(value.reward, pepeUsdPrice)
  const remainingViews = parseCount(value.remaining_views)
  if (!id || !title || !url || !rewardAtomic || remainingViews === null || remainingViews === 0) return null

  const keyHash = createHash('sha256').update(`${userId}:${id}`, 'utf8').digest('hex')
  return {
    key: `${taskKeyPrefix}${keyHash}`,
    title,
    description: readString(value.shortlink, 300) ?? '',
    url,
    rewardAtomic,
    remainingViews,
  }
}

export function isOfferwallMeShortlinkKey(value: string) {
  return /^offerwall-me-shortlinks:[0-9a-f]{64}$/i.test(value)
}

export async function getOfferwallMeShortlinkTasks(headers: Headers, userId: string): Promise<OfferwallMeShortlinkTask[]> {
  const token = process.env.OFFERWALL_ME_BEARER_TOKEN?.trim() ?? ''
  const publicApiKey = process.env.OFFERWALL_ME_PUBLIC_API_KEY?.trim() || OFFERWALL_ME_PUBLIC_API_KEY
  const identity = createOfferwallMeSignedIdentity(userId, publicApiKey)
  const ip = getClientIp(headers)

  if (!token || !identity) throw new OfferwallMeShortlinksError('Offerwall.me Shortlinks are not configured.', 503)
  if (!ip) throw new OfferwallMeShortlinksError('Could not determine your network address.', 400)

  const apiUrl = new URL('/slapi.php', offerwallOrigin)
  apiUrl.search = new URLSearchParams({
    api: publicApiKey,
    id: userId,
    ip,
    token,
    country: getCountryCode(headers).toUpperCase(),
    identityExpires: identity.identityExpires,
    identitySignature: identity.identitySignature,
  }).toString()
  const userAgent = headers.get('user-agent')?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 512)

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const statusCode = error instanceof Error && error.name === 'TimeoutError' ? 504 : 502
    throw new OfferwallMeShortlinksError('Offerwall.me Shortlinks are temporarily unavailable.', statusCode)
  }

  if (response.status === 404) return []

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new OfferwallMeShortlinksError('Offerwall.me returned an unreadable Shortlinks response.', 502)
  }

  if (isRecord(payload) && Number(payload.status) === 404) return []
  if (!response.ok || !isRecord(payload) || Number(payload.status) !== 200 || !Array.isArray(payload.data)) {
    throw new OfferwallMeShortlinksError('Offerwall.me Shortlinks are temporarily unavailable.', 502)
  }
  if (payload.data.length === 0) return []

  let pepeUsdPrice: string
  try {
    pepeUsdPrice = (await getFreshPepeUsdPrice()).toFixed(18).replace(/0+$/, '').replace(/\.$/, '')
  } catch {
    throw new OfferwallMeShortlinksError('PEPE/USD reward quote is temporarily unavailable.', 503)
  }

  return payload.data.flatMap((item) => {
    const task = parseTask(item, userId, pepeUsdPrice)
    return task ? [task] : []
  })
}
