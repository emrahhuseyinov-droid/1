import 'server-only'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { getPepeMarketQuote } from '@/lib/pepe-market-price'

export const ADSLAB_PTC_TASK_PREFIX = 'adslab:'
export const ADSLAB_SHORTLINK_TASK_PREFIX = 'adslab-shortlinks:'

const HOMERO_PER_USD = 50_000n
const ADSLAB_USER_SHARE_BPS = 5_000n
const SHARE_BPS_SCALE = 10_000n
const TOKEN_ATOMIC_PER_UNIT = 100_000_000n
const USD_SCALE = 10n ** 18n
const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)
export const ADSLAB_PTC_PLACEMENT_ID = process.env.ADSLAB_PLACEMENT_ID?.trim() ?? ''
const ADSLAB_HOST = 'adslab.me'

type UnknownRecord = Record<string, unknown>

export type AdsLabPtcTask = {
  key: string
  title: string
  description: string
  targetUrl: string
  url: string
  iconUrl: string | null
  rewardAtomic: number
  rewardUsd: string
  pepeUsdPrice: string
  tokenSymbol: 'PEPE'
  durationSeconds: number
  visitsPerUser: number
  cooldownMinutes: number
}

export type AdsLabPtcFeed = {
  tasks: AdsLabPtcTask[]
  pepeUsdPrice: string
}

export class AdsLabPtcError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly diagnostic: { stage: string; providerStatus?: number; failureType?: 'timeout' | 'network_error' },
  ) {
    super(message)
    this.name = 'AdsLabPtcError'
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null
}

function isLoopbackIp(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized === '::1' || normalized.startsWith('127.') || normalized.startsWith('::ffff:127.')
}

function getClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get('cf-connecting-ip'),
    ...(headers.get('x-vercel-forwarded-for')?.split(',') ?? []),
    ...(headers.get('x-forwarded-for')?.split(',') ?? []),
    headers.get('x-real-ip'),
  ]

  for (const candidate of candidates) {
    const ipAddress = candidate?.trim()
    if (ipAddress && isIP(ipAddress) && !isLoopbackIp(ipAddress)) return ipAddress
  }

  return null
}

function getCountryCode(headers: Headers): string {
  const candidates = [headers.get('cf-ipcountry'), headers.get('x-vercel-ip-country')]
  for (const candidate of candidates) {
    const country = candidate?.trim()
    if (country && /^[a-z]{2}$/i.test(country) && country.toLowerCase() !== 'xx') return country.toLowerCase()
  }
  return 'us'
}

function parseScaledUsd(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0 || value >= 1_000_000_000)) return null

  const input = typeof value === 'number' ? value.toFixed(18) : value.trim()
  const match = /^(\d{1,9})(?:\.(\d{1,18}))?$/.exec(input)
  if (!match) return null

  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(18, '0') || '0')
  return whole * USD_SCALE + fraction
}

function parseAdsLabRewardAtomicAtShare(value: unknown, shareBps: bigint): number | null {
  const usdScaled = parseScaledUsd(value)
  if (usdScaled === null) return null

  const atomic = (usdScaled * HOMERO_PER_USD * TOKEN_ATOMIC_PER_UNIT * shareBps)
    / (USD_SCALE * SHARE_BPS_SCALE)
  if (atomic <= 0n || atomic > MAX_SAFE_ATOMIC) return null
  return Number(atomic)
}

function formatScaledUsd(value: bigint): string {
  const whole = value / USD_SCALE
  const fraction = (value % USD_SCALE).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function normalizeAdsLabUsd(value: unknown): string | null {
  const scaled = parseScaledUsd(value)
  return scaled === null ? null : formatScaledUsd(scaled)
}

export function adsLabPtcRewardMatches(callbackUsd: unknown, taskUsd: unknown): boolean {
  const callback = parseScaledUsd(callbackUsd)
  const expected = parseScaledUsd(taskUsd)
  return callback !== null && expected !== null
    && (callback === expected || callback * 2n === expected || expected * 2n === callback)
}

export function parseAdsLabRewardAtomic(value: unknown): number | null {
  return parseAdsLabRewardAtomicAtShare(value, ADSLAB_USER_SHARE_BPS)
}

export function parseAdsLabGrossRewardAtomic(value: unknown): number | null {
  return parseAdsLabRewardAtomicAtShare(value, SHARE_BPS_SCALE)
}

export function parseAdsLabPepeRewardAtomic(value: unknown, pepeUsdPrice: unknown): number | null {
  const usdScaled = parseScaledUsd(value)
  const priceScaled = parseScaledUsd(pepeUsdPrice)
  if (usdScaled === null || priceScaled === null || priceScaled <= 0n) return null

  const atomic = (usdScaled * TOKEN_ATOMIC_PER_UNIT * ADSLAB_USER_SHARE_BPS)
    / (priceScaled * SHARE_BPS_SCALE)
  if (atomic <= 0n || atomic > MAX_SAFE_ATOMIC) return null
  return Number(atomic)
}

function parseInteger(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

function normalizeTaskUrl(value: unknown): string | null {
  const raw = readString(value, 2_000)
  if (!raw) return null
  const markdownLink = /^\[[^\]]+\]\((https:\/\/[^)]+)\)$/i.exec(raw)
  const candidate = markdownLink?.[1] ?? raw

  try {
    const url = new URL(candidate)
    if (
      url.protocol !== 'https:'
      || (url.hostname !== ADSLAB_HOST && !url.hostname.endsWith(`.${ADSLAB_HOST}`))
      || url.username
      || url.password
      || url.port
    ) return null

    const placementSegment = encodeURIComponent(ADSLAB_PTC_PLACEMENT_ID)
    url.pathname = url.pathname.replace(
      /(^|\/)(?:\[placement\]|%5Bplacement%5D)(?=\/|$)/gi,
      (_, prefix: string) => `${prefix}${placementSegment}`,
    )
    return url.toString()
  } catch {
    return null
  }
}

function normalizeTaskId(value: unknown): string | null {
  const candidate = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : readString(value, 128)
  return candidate && /^[A-Za-z0-9._~-]{1,128}$/.test(candidate) ? candidate : null
}

function getTaskKey(
  targetUrl: string,
  userId: string,
  ipAddress: string,
  prefix = ADSLAB_PTC_TASK_PREFIX,
  salt = '',
): string {
  const url = new URL(targetUrl)
  url.hash = ''
  const placementSegment = encodeURIComponent(ADSLAB_PTC_PLACEMENT_ID)
  url.pathname = url.pathname.split('/').map((segment) => (
    segment === placementSegment ? '[placement]' : segment
  )).join('/')

  for (const [name] of url.searchParams) {
    if (/^(uid|user|user_id|userid|ip|user_ip|subid)$/i.test(name)) {
      url.searchParams.set(name, `:${name.toLowerCase()}`)
    }
  }

  let stableUrl = url.toString()
  for (const value of [userId, ipAddress]) {
    stableUrl = stableUrl
      .replaceAll(encodeURIComponent(value), ':viewer')
      .replaceAll(value, ':viewer')
  }

  const digest = createHash('sha256').update(salt ? `${salt}\n${stableUrl}` : stableUrl).digest('hex')
  return `${prefix}${digest}`
}

function getIconUrl(value: unknown): string | null {
  const raw = readString(value, 2_000)
  if (!raw) return null

  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type AdsLabTaskCategory = 'ptc' | 'shortlinks' | 'all'
type AdsLabTaskPayload = { tasks: unknown[]; pepeUsdPrice: string; ipAddress: string }

async function fetchAdsLabTaskPayload(headers: Headers, userId: string, category: AdsLabTaskCategory): Promise<AdsLabTaskPayload> {
  if (!ADSLAB_PTC_PLACEMENT_ID) {
    throw new AdsLabPtcError('AdsLab placement ID is not configured.', 503, { stage: 'configuration_missing' })
  }

  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY_2?.trim() || process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) {
    throw new AdsLabPtcError('AdsLab publisher API key is not configured.', 503, { stage: 'configuration_missing' })
  }

  const ipAddress = getClientIp(headers)
  if (!ipAddress) {
    throw new AdsLabPtcError('Could not identify the client IP address.', 503, { stage: 'client_ip_missing' })
  }

  const userAgent = readString(headers.get('user-agent'), 512)
  if (!userAgent) {
    throw new AdsLabPtcError('Could not identify the client user agent.', 503, { stage: 'user_agent_missing' })
  }

  const country = getCountryCode(headers)
  const path = `api/tasks-share/${ADSLAB_PTC_PLACEMENT_ID}/${encodeURIComponent(apiKey)}/${country}/${encodeURIComponent(userId)}/${encodeURIComponent(ipAddress)}/${category}`

  let response: Response
  try {
    response = await fetch(`https://${ADSLAB_HOST}/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const failureType = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error'
    throw new AdsLabPtcError('AdsLab is temporarily unavailable.', 502, {
      stage: 'upstream_fetch',
      failureType,
    })
  }

  const responseText = await response.text()
  if (!response.ok) {
    console.error('[adslab-ptc] AdsLab returned a non-200 response.', {
      status: response.status,
    })
    throw new AdsLabPtcError('AdsLab is temporarily unavailable.', 502, {
      stage: 'upstream_http',
      providerStatus: response.status,
    })
  }

  let payload: unknown
  try {
    payload = JSON.parse(responseText)
  } catch {
    console.error('[adslab-ptc] AdsLab returned invalid JSON.', {
      status: response.status,
    })
    throw new AdsLabPtcError('AdsLab returned an invalid response.', 502, {
      stage: 'invalid_json',
      providerStatus: response.status,
    })
  }

  let taskPayload: unknown = payload
  if (isRecord(payload)) {
    if (payload.success === false) {
      console.error('[adslab-ptc] AdsLab rejected the request.', {
        status: response.status,
      })
      throw new AdsLabPtcError('AdsLab rejected the task request.', 502, {
        stage: 'provider_rejected',
        providerStatus: response.status,
      })
    }
    taskPayload = payload.tasks
  }
  if (!Array.isArray(taskPayload)) {
    throw new AdsLabPtcError('AdsLab returned an invalid response.', 502, {
      stage: 'invalid_payload',
      providerStatus: response.status,
    })
  }

  let pepeUsdPrice: string
  try {
    pepeUsdPrice = normalizeAdsLabUsd((await getPepeMarketQuote()).pepeUsd) ?? ''
  } catch {
    throw new AdsLabPtcError('The live PEPE/USD quote is unavailable.', 503, { stage: 'pepe_quote_unavailable' })
  }
  if (!pepeUsdPrice) {
    throw new AdsLabPtcError('The live PEPE/USD quote is unavailable.', 503, { stage: 'pepe_quote_unavailable' })
  }

  return { tasks: taskPayload, pepeUsdPrice, ipAddress }
}

export async function getAdsLabPtcTasks(headers: Headers, userId: string): Promise<AdsLabPtcFeed> {
  const { tasks: taskPayload, pepeUsdPrice, ipAddress } = await fetchAdsLabTaskPayload(headers, userId, 'ptc')
  const tasks = new Map<string, AdsLabPtcTask>()

  for (const rawTask of taskPayload) {
    if (!isRecord(rawTask)) continue

    const taskType = readString(rawTask.type, 40)?.toLowerCase()
    if (!taskType || !['ptc', 'task', 'tasks'].includes(taskType)) continue

    const title = readString(rawTask.title, 160) ?? readString(rawTask.name, 160)
    const targetUrl = normalizeTaskUrl(rawTask.url)
    const rewardUsd = normalizeAdsLabUsd(rawTask.reward_usd ?? rawTask.reward)
    const rewardAtomic = rewardUsd ? parseAdsLabPepeRewardAtomic(rewardUsd, pepeUsdPrice) : null
    const durationSeconds = parseInteger(rawTask.duration, 1, 3_600)
    if (!title || !targetUrl || !rewardUsd || rewardAtomic === null || durationSeconds === null) continue

    const key = getTaskKey(targetUrl, userId, ipAddress)
    tasks.set(key, {
      key,
      title,
      description: readString(rawTask.description, 600) ?? '',
      targetUrl,
      url: targetUrl,
      iconUrl: getIconUrl(rawTask.icon ?? rawTask.image),
      rewardAtomic,
      rewardUsd,
      pepeUsdPrice,
      tokenSymbol: 'PEPE',
      durationSeconds,
      visitsPerUser: parseInteger(rawTask.visitsPerUser, 1, 10_000) ?? 1,
      cooldownMinutes: parseInteger(rawTask.cooldownMinutes, 0, 525_600) ?? 0,
    })
  }

  return { tasks: [...tasks.values()], pepeUsdPrice }
}

export async function getAdsLabShortlinkTasks(headers: Headers, userId: string): Promise<AdsLabPtcFeed> {
  const { tasks: taskPayload, pepeUsdPrice, ipAddress } = await fetchAdsLabTaskPayload(headers, userId, 'shortlinks')
  const tasks = new Map<string, AdsLabPtcTask>()

  for (const rawTask of taskPayload) {
    if (!isRecord(rawTask)) continue

    const taskType = readString(rawTask.type, 40)?.toLowerCase()
    if (taskType && !['shortlink', 'shortlinks'].includes(taskType)) continue

    const title = readString(rawTask.title, 160) ?? readString(rawTask.name, 160)
    const targetUrl = normalizeTaskUrl(rawTask.url)
    const taskId = normalizeTaskId(rawTask.task_id)
      ?? normalizeTaskId(rawTask.taskId)
      ?? normalizeTaskId(rawTask.id)
      ?? normalizeTaskId(rawTask._id)
    const rewardUsd = normalizeAdsLabUsd(rawTask.rewardPerVisit ?? rawTask.reward_usd ?? rawTask.reward)
    const rewardAtomic = rewardUsd ? parseAdsLabPepeRewardAtomic(rewardUsd, pepeUsdPrice) : null
    if (!title || !targetUrl || !taskId || !rewardUsd || rewardAtomic === null) continue

    const key = getTaskKey(targetUrl, userId, ipAddress, ADSLAB_SHORTLINK_TASK_PREFIX, taskId)
    tasks.set(key, {
      key,
      title,
      description: readString(rawTask.description, 600) ?? '',
      targetUrl,
      url: targetUrl,
      iconUrl: getIconUrl(rawTask.icon ?? rawTask.image),
      rewardAtomic,
      rewardUsd,
      pepeUsdPrice,
      tokenSymbol: 'PEPE',
      durationSeconds: 0,
      visitsPerUser: parseInteger(rawTask.visitsPerUser, 1, 2_147_483_647) ?? 2_147_483_647,
      cooldownMinutes: parseInteger(rawTask.cooldownMinutes, 0, 525_600) ?? 0,
    })
  }

  return { tasks: [...tasks.values()], pepeUsdPrice }
}

export function formatHomeroPayoutAtomic(value: number): string {
  const atomic = BigInt(value)
  const whole = atomic / TOKEN_ATOMIC_PER_UNIT
  const fraction = (atomic % TOKEN_ATOMIC_PER_UNIT).toString().padStart(8, '0')
  return `${whole}.${fraction}`
}

export function formatPepePayoutAtomic(value: number): string {
  return formatHomeroPayoutAtomic(value)
}

export function parseHomeroPayoutAtomic(value: string | null): number | null {
  if (!value || value.length > 40) return null
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value)
  if (!match) return null

  const atomic = BigInt(match[1]) * TOKEN_ATOMIC_PER_UNIT + BigInt((match[2] ?? '').padEnd(8, '0') || '0')
  return atomic > 0n && atomic <= MAX_SAFE_ATOMIC ? Number(atomic) : null
}
