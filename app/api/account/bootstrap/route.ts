import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  try {
    const account = await getAccountForRequest(
      request.headers,
      request.cookies.get(guestCookieName)?.value,
    )

    if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

    const response = NextResponse.json(
      { ok: true, referralCode: account.profile.referralCode },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    const isSecure = request.nextUrl.protocol === 'https:'
      || request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'

    response.cookies.set(guestCookieName, '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      path: '/',
      maxAge: 0,
    })
    return response
  } catch (error) {
    console.error('[account-bootstrap] Could not prepare account profile:', error)
    return NextResponse.json({ error: 'Could not prepare your account.' }, { status: 500 })
  }
}
