import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { getManualFaucetState } from '@/lib/manual-faucet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const state = await getManualFaucetState(account.profile.id)
    return NextResponse.json(state, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[manual-faucet] State load failed:', error instanceof Error ? error.name : 'unknown error')
    return NextResponse.json(
      { error: 'The PEPE reward is temporarily unavailable. Please try again shortly.' },
      { status: 503, headers: noStoreHeaders },
    )
  }
}
