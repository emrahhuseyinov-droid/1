import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  }

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Enter your account email and verification code.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const action = input.action === 'send' || input.action === 'verify' ? input.action : null
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const accountEmail = account.session.user.email.trim().toLowerCase()
  if (!action || !email || email.length > 254 || !emailPattern.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400, headers: noStoreHeaders })
  }
  if (email !== accountEmail) {
    return NextResponse.json({ error: 'Enter the email address connected to this signed-in account.' }, { status: 400, headers: noStoreHeaders })
  }
  if (account.session.user.emailVerified) {
    return NextResponse.json({ emailVerified: true }, { headers: noStoreHeaders })
  }

  if (action === 'send') {
    const limited = await enforceApiRateLimit('account-email-verification-send', account.session.user.id, { windowSeconds: 60 * 60, max: 5 })
    if (limited) return limited

    try {
      await auth.api.sendVerificationOTP({
        body: { email: accountEmail, type: 'email-verification' },
        headers: request.headers,
      })
      return NextResponse.json({ sent: true }, { headers: noStoreHeaders })
    } catch {
      console.error('[email-verification] Could not send a verification code.')
      return NextResponse.json({ error: 'Could not send a verification code. Please try again later.' }, { status: 503, headers: noStoreHeaders })
    }
  }

  const otp = typeof input.otp === 'string' ? input.otp.trim() : ''
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the six-digit code from your email.' }, { status: 400, headers: noStoreHeaders })
  }

  const limited = await enforceApiRateLimit('account-email-verification-check', account.session.user.id, { windowSeconds: 10 * 60, max: 10 })
  if (limited) return limited

  try {
    await auth.api.verifyEmailOTP({
      body: { email: accountEmail, otp },
      headers: request.headers,
    })
    return NextResponse.json({ emailVerified: true }, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ error: 'That code is invalid or expired. Request a new one and try again.' }, { status: 400, headers: noStoreHeaders })
  }
}
