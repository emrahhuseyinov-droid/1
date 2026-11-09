import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { arcadeNoStoreHeaders, settlePreviousWeekAwards } from '@/lib/arcade-service'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: arcadeNoStoreHeaders })
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: arcadeNoStoreHeaders })
  if (!isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified)) return NextResponse.json({ error: 'Only the configured reserve administrator can settle weekly awards.' }, { status: 403, headers: arcadeNoStoreHeaders })
  const limited = await enforceApiRateLimit('arcade-weekly-settlement', account.session.user.id, { windowSeconds: 60 * 60, max: 5 })
  if (limited) return limited

  try {
    const result = await settlePreviousWeekAwards()
    return NextResponse.json(result, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-weekly-settle] Could not settle weekly awards:', error)
    return NextResponse.json({ error: 'Could not settle the previous week.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
