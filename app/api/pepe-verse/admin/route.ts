import { NextResponse, type NextRequest } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'
import { arcadeNoStoreHeaders, readJsonBody } from '@/lib/arcade-service'
import { getPepeVerseAdminOverview, PepeVerseError, updatePepeVerseSettings } from '@/lib/pepe-verse/service'

export const dynamic = 'force-dynamic'

async function requireAdmin(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return { response: NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: arcadeNoStoreHeaders }) }
  if (!isPepeReserveAdmin(account.session.user.email, account.session.user.emailVerified)) {
    return { response: NextResponse.json({ error: 'Only the configured administrator can manage PEPE VERSE.' }, { status: 403, headers: arcadeNoStoreHeaders }) }
  }
  const limited = await enforceApiRateLimit('pepe-verse:admin', account.profile.id, { windowSeconds: 60, max: 20 })
  if (limited) return { response: limited }
  return { account }
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request)
  if ('response' in access) return access.response
  try {
    return NextResponse.json(await getPepeVerseAdminOverview(), { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[pepe-verse] admin overview failed', error)
    return NextResponse.json({ error: 'Could not load PEPE VERSE settings.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: arcadeNoStoreHeaders })
  const access = await requireAdmin(request)
  if ('response' in access) return access.response
  const body = await readJsonBody(request)
  try {
    return NextResponse.json(await updatePepeVerseSettings(body), { headers: arcadeNoStoreHeaders })
  } catch (error) {
    if (error instanceof PepeVerseError) return NextResponse.json({ error: error.message }, { status: error.status, headers: arcadeNoStoreHeaders })
    console.error('[pepe-verse] admin update failed', error)
    return NextResponse.json({ error: 'Could not save PEPE VERSE settings.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
