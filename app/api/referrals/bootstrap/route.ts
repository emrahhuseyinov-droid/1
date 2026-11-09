import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Email sign-in is required to create or access a profile.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}
