import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { guestProfiles } from '@/lib/db/schema'
import { getBannerPromoState, recordBannerPromoAction } from '@/lib/banner-promo'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const actionSchema = z.object({
  action: z.enum(['click', 'dismiss']),
  promoId: z.string().uuid(),
})

async function getGuestId(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return null

  const [profile] = await db
    .select({ id: guestProfiles.id })
    .from(guestProfiles)
    .where(eq(guestProfiles.userId, session.user.id))
    .limit(1)

  return profile?.id ?? null
}

export async function GET(request: NextRequest) {
  const guestId = await getGuestId(request)
  if (!guestId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })

  try {
    const state = await getBannerPromoState(guestId)
    return NextResponse.json(state, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ error: 'Unable to load the banner promotion.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers: noStoreHeaders })
  }

  const guestId = await getGuestId(request)
  if (!guestId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('banner-promo-action', guestId, { windowSeconds: 60, max: 30 })
  if (limited) return limited

  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid promotion action' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const state = await recordBannerPromoAction(guestId, parsed.data.promoId, parsed.data.action)
    return NextResponse.json(state, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ error: 'Unable to update the banner promotion.' }, { status: 500, headers: noStoreHeaders })
  }
}
