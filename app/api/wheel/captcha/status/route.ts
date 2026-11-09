import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { wheelCaptchaSessions } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  const states = request.nextUrl.searchParams.getAll('state')
  const captchaSessionId = states.length === 1 ? states[0].toLowerCase() : ''
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
      ))
      .limit(1)

    if (!session) return NextResponse.json({ error: 'CAPTCHA session not found.' }, { status: 404, headers: noStoreHeaders })

    const status = session.expiresAt <= new Date() && session.status !== 'consumed'
      ? 'expired'
      : session.status
    return NextResponse.json({ status }, { headers: noStoreHeaders })
  } catch {
    console.error('[wheel/captcha] Could not read CAPTCHA session status.')
    return NextResponse.json({ error: 'Could not check CAPTCHA status.' }, { status: 500, headers: noStoreHeaders })
  }
}
