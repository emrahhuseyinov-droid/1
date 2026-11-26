import { NextResponse } from 'next/server'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export function emailVerificationRequiredResponse() {
  return NextResponse.json(
    {
      error: 'Verify your email in Account settings → Security before using financial features.',
      code: 'EMAIL_VERIFICATION_REQUIRED',
    },
    { status: 403, headers: noStoreHeaders },
  )
}
