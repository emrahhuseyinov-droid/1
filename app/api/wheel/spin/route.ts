import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { startWheelSpin, WheelServiceError } from '@/lib/wheel-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    return NextResponse.json(await startWheelSpin(account.profile.id), { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof WheelServiceError) {
      return NextResponse.json({ error: error.message, code: error.code, nextAllowedAt: error.nextAllowedAt }, { status: error.status, headers: noStoreHeaders })
    }
    console.error('[wheel] Could not start spin:', error)
    return NextResponse.json({ error: 'Could not start a spin. Please try again.' }, { status: 500, headers: noStoreHeaders })
  }
}
