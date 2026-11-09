import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  return NextResponse.json(
    { error: 'Reward activities are unavailable until a verified partner is connected.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
