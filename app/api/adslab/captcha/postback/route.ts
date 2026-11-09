import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { wheelCaptchaSessions } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const signaturePattern = /^[a-f0-9]{64}$/i
const maxTimestampSkewSeconds = 10 * 60

function response(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADSLAB_POSTBACK_SECRET?.trim()
  if (!secret) return response('postback unavailable', 503)

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body)) return response('invalid payload', 400)

  const subId = typeof body.sub_id === 'string' ? body.sub_id.trim() : ''
  const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : ''
  const timestampValue = body.timestamp
  const timestampText = typeof timestampValue === 'number' && Number.isSafeInteger(timestampValue)
    ? String(timestampValue)
    : typeof timestampValue === 'string'
      ? timestampValue.trim()
      : ''
  const signature = typeof body.signature === 'string' ? body.signature.trim() : ''

  if (!uuidPattern.test(subId) || !status || !/^\d{10}$/.test(timestampText) || !signaturePattern.test(signature)) {
    return response('missing or invalid parameters', 400)
  }

  const timestamp = Number(timestampText)
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxTimestampSkewSeconds) {
    return response('stale postback', 403)
  }

  const expectedSignature = createHmac('sha256', secret).update(`${subId}:${timestampText}`).digest()
  const suppliedSignature = Buffer.from(signature, 'hex')
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) {
    return response('invalid signature', 403)
  }

  const captchaSessionId = subId.toLowerCase()
  const now = new Date()
  const successful = status === 'success'

  try {
    await db.transaction(async (transaction) => {
      const [session] = await transaction
        .select({ id: wheelCaptchaSessions.id, status: wheelCaptchaSessions.status, expiresAt: wheelCaptchaSessions.expiresAt })
        .from(wheelCaptchaSessions)
        .where(eq(wheelCaptchaSessions.id, captchaSessionId))
        .for('update')
        .limit(1)

      if (!session || session.status !== 'pending' || session.expiresAt <= now) return

      await transaction
        .update(wheelCaptchaSessions)
        .set(successful ? { status: 'verified', verifiedAt: now } : { status: 'failed' })
        .where(and(eq(wheelCaptchaSessions.id, captchaSessionId), eq(wheelCaptchaSessions.status, 'pending')))
    })

    return response('OK')
  } catch {
    console.error('[wheel/captcha] Could not process AdsLab postback.')
    return response('postback error', 500)
  }
}
