import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { getDashboardBalancesAtomic } from '@/lib/dashboard'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  try {
    const account = await getAccountForRequest(
      request.headers,
      request.cookies.get(guestCookieName)?.value,
    )

    if (!account) {
      return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
    }

    const balancesAtomic = await getDashboardBalancesAtomic(account.profile.id)
    return NextResponse.json({ balancesAtomic }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[account-balances] Could not load wallet balances:', error)
    return NextResponse.json({ error: 'Could not load wallet balances.' }, { status: 500, headers: noStoreHeaders })
  }
}
