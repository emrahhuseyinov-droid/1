import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { arcadeNoStoreHeaders, authorizeArcadeRequest } from '@/lib/arcade-service'
import { PepeCrushError } from './service'

export const crushHeaders = arcadeNoStoreHeaders

export async function authorizeCrush(request: NextRequest, scope: string, max: number, requireTrustedOrigin: boolean) {
  const auth = await authorizeArcadeRequest(request, requireTrustedOrigin)
  if ('response' in auth) return { response: auth.response }
  const limited = await enforceApiRateLimit(`pepe-crush:${scope}`, auth.guestId, { windowSeconds: 60, max })
  if (limited) return { response: limited }
  return { guestId: auth.guestId as string }
}

export function crushError(error: unknown, label: string) {
  if (error instanceof PepeCrushError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: crushHeaders })
  }
  console.error(`[pepe-crush] ${label} failed`, error)
  return NextResponse.json({ error: 'PEPE Crush is temporarily unavailable.' }, { status: 500, headers: crushHeaders })
}
