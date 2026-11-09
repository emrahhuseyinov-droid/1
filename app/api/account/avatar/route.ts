import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Choose one of the available avatars.' }, { status: 400, headers: noStoreHeaders })
  }

  if (!payload || typeof payload !== 'object' || !('image' in payload) || !isProfileAvatar(payload.image)) {
    return NextResponse.json({ error: 'Choose one of the available avatars.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const account = await getAccountForRequest(
      request.headers,
      request.cookies.get(guestCookieName)?.value,
    )
    if (!account) {
      return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
    }

    const [updatedUser] = await db
      .update(user)
      .set({ image: payload.image, updatedAt: new Date() })
      .where(eq(user.id, account.session.user.id))
      .returning({ image: user.image })

    if (!updatedUser) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404, headers: noStoreHeaders })
    }

    return NextResponse.json({ image: updatedUser.image }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[profile-avatar] Could not update profile avatar:', error)
    return NextResponse.json({ error: 'Could not save your avatar.' }, { status: 500, headers: noStoreHeaders })
  }
}
