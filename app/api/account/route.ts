import { sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

const nicknamePattern = /^[\p{L}\p{N}_-]{3,24}$/u
const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const nickname = request.nextUrl.searchParams.get('nickname')?.trim() ?? ''

  if (!nicknamePattern.test(nickname)) {
    return NextResponse.json(
      { available: false },
      { status: 400, headers: noStoreHeaders },
    )
  }

  try {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.name}) = ${nickname.toLowerCase()}`)
      .limit(1)

    return NextResponse.json(
      { available: !existingUser },
      { headers: noStoreHeaders },
    )
  } catch {
    return NextResponse.json(
      { error: 'Could not check nickname availability.' },
      { status: 500, headers: noStoreHeaders },
    )
  }
}
