import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getReferralLeaderboard } from '@/lib/referral-leaderboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
    }

    const leaderboard = await getReferralLeaderboard()
    return NextResponse.json({ leaderboard }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[referral-leaderboard] Could not load leaderboard:', error)
    return NextResponse.json(
      { error: 'Could not load the referral leaderboard.' },
      { status: 500, headers: noStoreHeaders },
    )
  }
}
