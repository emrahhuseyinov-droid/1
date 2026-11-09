import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adslabInterstitialEvents, guestProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const placementId = 'int-OhHMK5Pof7Em'
const transactionIdPattern = /^[A-Za-z0-9._:-]{1,128}$/
const signaturePattern = /^[a-f0-9]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function response(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

function readSingleParam(params: URLSearchParams, name: string, maxLength: number) {
  const values = params.getAll(name)
  if (values.length !== 1) return null
  const value = values[0].trim()
  return value.length > 0 && value.length <= maxLength ? value : null
}

function isValidSignature(txid: string, signature: string, secret: string) {
  if (!signaturePattern.test(signature)) return false
  const expected = createHash('sha256').update(`${txid}-${secret}`).digest()
  const supplied = Buffer.from(signature, 'hex')
  return supplied.length === expected.length && timingSafeEqual(expected, supplied)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const uid = readSingleParam(params, 'uid', 128) ?? ''
  const pid = readSingleParam(params, 'pid', 128) ?? ''
  const txid = readSingleParam(params, 'txid', 128) ?? ''
  const signature = readSingleParam(params, 'signature', 128) ?? ''
  const secret = process.env.ADSLAB_POSTBACK_SECRET?.trim() ?? ''

  if (!secret) return response('postback unavailable', 503)
  if (!uid || !pid || !txid || !signature
    || params.getAll('uid').length !== 1
    || params.getAll('pid').length !== 1
    || params.getAll('txid').length !== 1
    || params.getAll('signature').length !== 1
    || !transactionIdPattern.test(txid)) {
    return response('missing or invalid parameters', 400)
  }

  if (!isValidSignature(txid, signature, secret)) return response('invalid signature', 403)
  if (pid !== placementId) return response('ok')

  try {
    const normalizedUid = uuidPattern.test(uid) ? uid.toLowerCase() : uid
    let [profile] = uuidPattern.test(normalizedUid)
      ? await db
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, normalizedUid))
        .limit(1)
      : []

    if (!profile) {
      ;[profile] = await db
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.userId, normalizedUid))
        .limit(1)
    }

    await db
      .insert(adslabInterstitialEvents)
      .values({
        id: randomUUID(),
        providerTransactionId: txid,
        guestId: profile?.id ?? null,
        uid: normalizedUid,
        placementId: pid,
      })
      .onConflictDoNothing({ target: adslabInterstitialEvents.providerTransactionId })

    return response('ok')
  } catch {
    console.error('[adslab-interstitial] Failed to record verified callback.')
    return response('postback error', 500)
  }
}
