import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { getWheelState } from '@/lib/wheel-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    return NextResponse.json(await getWheelState(account.profile.id), { headers: noStoreHeaders })
  } catch (error) {
    console.error('[wheel] Could not read wheel state:', error)
    return NextResponse.json({ error: 'Could not load the wheel right now.' }, { status: 500, headers: noStoreHeaders })
  }
}
