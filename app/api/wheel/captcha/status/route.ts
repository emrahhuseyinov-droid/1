import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { wheelCaptchaSessions } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const adsLabApiOrigin = 'https://adslab.me'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSessionInfo(value: unknown) {
  if (!isRecord(value)) return null
  const session = isRecord(value.data) ? value.data : value
  if (typeof session.status !== 'string') return null
  const success = typeof session.success === 'boolean' ? session.success : value.success === true
  return { success, status: session.status.toLowerCase() }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const states = request.nextUrl.searchParams.getAll('state')
  const captchaSessionId = states.length === 1 ? states[0].toLowerCase() : ''
  const purposes = request.nextUrl.searchParams.getAll('purpose')
  const purpose: 'wheel' | 'daily_bonus' | null = purposes.length === 0
    ? 'wheel'
    : purposes.length === 1 && (purposes[0] === 'wheel' || purposes[0] === 'daily_bonus')
      ? purposes[0] as 'wheel' | 'daily_bonus'
      : null
  if (!purpose) return NextResponse.json({ error: 'A valid CAPTCHA purpose is required.' }, { status: 400, headers: noStoreHeaders })
  if (!uuidPattern.test(captchaSessionId)) {
    return NextResponse.json({ error: 'A valid CAPTCHA session is required.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const [session] = await db
      .select({ status: wheelCaptchaSessions.status, expiresAt: wheelCaptchaSessions.expiresAt })
      .from(wheelCaptchaSessions)
      .where(and(
        eq(wheelCaptchaSessions.id, captchaSessionId),
        eq(wheelCaptchaSessions.guestId, account.profile.id),
        eq(wheelCaptchaSessions.purpose, purpose),
      ))
      .limit(1)

    if (!session) return NextResponse.json({ error: 'CAPTCHA session not found.' }, { status: 404, headers: noStoreHeaders })

    if (session.expiresAt <= new Date() && session.status !== 'consumed') {
      return NextResponse.json({ status: 'expired' }, { headers: noStoreHeaders })
    }
    if (session.status !== 'pending') {
      return NextResponse.json({ status: session.status }, { headers: noStoreHeaders })
    }

    const apiKey = process.env.ADSLAB_PUBLISHER_API_KEY?.trim()
    if (!apiKey) return NextResponse.json({ error: 'CAPTCHA verification is not configured.' }, { status: 503, headers: noStoreHeaders })

    const verificationUrl = new URL('/api/v1/captcha/session-info', adsLabApiOrigin)
    verificationUrl.searchParams.set('token', captchaSessionId)
    const response = await fetch(verificationUrl, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    const result: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      console.error('[wheel/captcha] AdsLab session-info request failed.', { status: response.status })
      return NextResponse.json({ error: 'Could not verify the CAPTCHA session.' }, { status: 502, headers: noStoreHeaders })
    }

    const sessionInfo = readSessionInfo(result)
    if (!sessionInfo) {
      console.error('[wheel/captcha] AdsLab returned an invalid session-info response.')
      return NextResponse.json({ error: 'The verification service returned an invalid response.' }, { status: 502, headers: noStoreHeaders })
    }

    if (sessionInfo.success && sessionInfo.status === 'solved') {
      const now = new Date()
      const [verified] = await db
        .update(wheelCaptchaSessions)
        .set({ status: 'verified', verifiedAt: now })
        .where(and(
          eq(wheelCaptchaSessions.id, captchaSessionId),
          eq(wheelCaptchaSessions.guestId, account.profile.id),
          eq(wheelCaptchaSessions.purpose, purpose),
          eq(wheelCaptchaSessions.status, 'pending'),
          gt(wheelCaptchaSessions.expiresAt, now),
        ))
        .returning({ id: wheelCaptchaSessions.id })

      if (verified) return NextResponse.json({ status: 'verified' }, { headers: noStoreHeaders })

      const [latestSession] = await db
        .select({ status: wheelCaptchaSessions.status, expiresAt: wheelCaptchaSessions.expiresAt })
        .from(wheelCaptchaSessions)
        .where(and(
          eq(wheelCaptchaSessions.id, captchaSessionId),
          eq(wheelCaptchaSessions.guestId, account.profile.id),
          eq(wheelCaptchaSessions.purpose, purpose),
        ))
        .limit(1)
      if (!latestSession) return NextResponse.json({ error: 'CAPTCHA session not found.' }, { status: 404, headers: noStoreHeaders })
      const latestStatus = latestSession.expiresAt <= new Date() && latestSession.status !== 'consumed'
        ? 'expired'
        : latestSession.status
      return NextResponse.json({ status: latestStatus }, { headers: noStoreHeaders })
    }

    return NextResponse.json({ status: 'pending' }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[wheel/captcha] Could not verify AdsLab session:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json({ error: 'Could not check CAPTCHA verification.' }, { status: 503, headers: noStoreHeaders })
  }
}
