import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

async function requireAccount(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user ?? null
}

export async function GET(request: NextRequest) {
  const user = await requireAccount(request)
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  return NextResponse.json(
    { error: 'Promo-code redemptions are paused until funded campaigns are configured.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const user = await requireAccount(request)
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  return NextResponse.json(
    { error: 'Promo-code redemptions are paused until funded campaigns are configured.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
