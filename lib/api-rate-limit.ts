import 'server-only'
import { createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/db/schema'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

type RateLimitOptions = {
  windowSeconds: number
  max: number
}

export async function enforceApiRateLimit(scope: string, subject: string, options: RateLimitOptions) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || !Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1 || !Number.isSafeInteger(options.max) || options.max < 1) {
    console.error('[api-rate-limit] Rate limit configuration is unavailable or invalid.')
    return NextResponse.json({ error: 'Request protection is temporarily unavailable.' }, { status: 503, headers: noStoreHeaders })
  }

  try {
    const key = createHmac('sha256', secret).update(`api:${scope}:${subject}`).digest('hex')
    const now = Date.now()
    const windowStart = now - options.windowSeconds * 1000
    const [usage] = await db
      .insert(rateLimit)
      .values({ key, count: 1, lastRequest: now })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then 1 else least(${rateLimit.count} + 1, ${options.max + 1}) end`,
          lastRequest: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
        },
      })
      .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest })

    if (!usage || usage.count <= options.max) return null

    const retryAfter = Math.max(1, Math.ceil((usage.lastRequest + options.windowSeconds * 1000 - now) / 1000))
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { ...noStoreHeaders, 'Retry-After': String(retryAfter) } },
    )
  } catch (error) {
    console.error('[api-rate-limit] Could not enforce request limit:', error)
    return NextResponse.json({ error: 'Request protection is temporarily unavailable.' }, { status: 503, headers: noStoreHeaders })
  }
}
