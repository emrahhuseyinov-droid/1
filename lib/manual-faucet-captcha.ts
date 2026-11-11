import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const captchaStateTtlMs = 15 * 60 * 1000
const adsLabApiOrigin = 'https://adslab.me'

export class AdsLabCaptchaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export type ManualFaucetCaptchaState = {
  sessionId: string
  guestId: string
  expiresAt: number
}

function getSigningSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new AdsLabCaptchaError('CAPTCHA verification is not configured.', 503)
  }
  return secret
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url')
}

export function createManualFaucetCaptchaStateToken(state: ManualFaucetCaptchaState) {
  const encodedPayload = Buffer.from(JSON.stringify(state)).toString('base64url')
  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export function readManualFaucetCaptchaStateToken(token: unknown): ManualFaucetCaptchaState | null {
  if (typeof token !== 'string' || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  let receivedSignature: Buffer
  let expectedSignature: Buffer
  try {
    receivedSignature = Buffer.from(parts[1], 'base64url')
    expectedSignature = Buffer.from(signPayload(parts[0]), 'base64url')
  } catch {
    return null
  }

  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<ManualFaucetCaptchaState>
    if (
      typeof payload.sessionId !== 'string' || !uuidPattern.test(payload.sessionId)
      || typeof payload.guestId !== 'string' || !uuidPattern.test(payload.guestId)
      || typeof payload.expiresAt !== 'number' || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt <= Date.now()
    ) return null

    return {
      sessionId: payload.sessionId.toLowerCase(),
      guestId: payload.guestId.toLowerCase(),
      expiresAt: payload.expiresAt,
    }
  } catch {
    return null
  }
}

export function getManualFaucetCaptchaExpiry(now = Date.now()) {
  return now + captchaStateTtlMs
}

export function readAdsLabCaptchaChallenge(value: unknown): { solveUrl: string; challengeToken: string | null } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const response = value as Record<string, unknown>
  const data = typeof response.data === 'object' && response.data !== null && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : response
  if (data.success !== true && response.success !== true) return null
  if (typeof data.solve_url !== 'string') return null

  const challengeToken = typeof data.token === 'string' && data.token.length > 0 && data.token.length <= 16_384
    ? data.token
    : null

  try {
    const url = new URL(data.solve_url)
    if (url.protocol !== 'https:' || !(url.hostname === 'adslab.me' || url.hostname.endsWith('.adslab.me')) || url.username || url.password) return null
    return { solveUrl: url.toString(), challengeToken }
  } catch {
    return null
  }
}

export async function fetchAdsLabCaptchaStatus(sessionId: string) {
  const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
  if (!apiKey) throw new AdsLabCaptchaError('CAPTCHA verification is not configured.', 503)

  const statusUrl = new URL('/api/v1/captcha/session-info', adsLabApiOrigin)
  statusUrl.searchParams.set('sub_id', sessionId)

  let response: Response
  try {
    response = await fetch(statusUrl, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new AdsLabCaptchaError('CAPTCHA verification is temporarily unavailable.', 503)
  }

  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new AdsLabCaptchaError('Could not verify this CAPTCHA session.', 502)
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new AdsLabCaptchaError('The verification service returned an invalid response.', 502)
  }

  const responseRecord = result as Record<string, unknown>
  const session = typeof responseRecord.data === 'object' && responseRecord.data !== null && !Array.isArray(responseRecord.data)
    ? responseRecord.data as Record<string, unknown>
    : responseRecord
  if (typeof session.status !== 'string') {
    throw new AdsLabCaptchaError('The verification service returned an invalid response.', 502)
  }

  return {
    success: session.success === true || responseRecord.success === true,
    status: session.status.toLowerCase(),
  }
}
