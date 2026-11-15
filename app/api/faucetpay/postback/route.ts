import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'
import { FAUCETPAY_PAIDVIEW_PLACEMENT_ID } from '@/lib/faucetpay-paidview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const maxBodyBytes = 16 * 1024
const maxSafeAtomic = BigInt(Number.MAX_SAFE_INTEGER)
const atomicUnitsPerPepe = 100_000_000n
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
type ParamValue = { value: string | null; valid: boolean }

function response(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { ...noStoreHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function readLimitedBody(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) return null

  const reader = request.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxBodyBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}

function getSingleParam(params: URLSearchParams, name: string): ParamValue {
  const values = params.getAll(name)
  if (values.length > 1) return { value: null, valid: false }
  return { value: values[0] ?? null, valid: true }
}

function parseRequestParams(request: NextRequest, body: string, contentType: string | null) {
  const params = new URLSearchParams(request.nextUrl.searchParams)
  if (!body) return params

  if (contentType === 'application/x-www-form-urlencoded') {
    new URLSearchParams(body).forEach((value, key) => params.append(key, value))
    return params
  }
  if (contentType !== 'application/json') return null

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== 'string' && typeof value !== 'number') return null
    params.append(key, String(value))
  }
  return params
}

function parsePositiveDecimal(value: string) {
  if (!/^\d{1,6}(?:\.\d{1,18})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const scaled = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0') || '0')
  return scaled > 0n ? scaled : null
}

function calculatePepeRewardAtomic(amount: string, pepeUsdPrice: number) {
  if (!Number.isFinite(pepeUsdPrice) || pepeUsdPrice <= 0) return null
  const amountScaled = parsePositiveDecimal(amount)
  const priceScaled = parsePositiveDecimal(pepeUsdPrice.toFixed(18).replace(/0+$/, '').replace(/\.$/, ''))
  if (amountScaled === null || priceScaled === null) return null

  const rewardAtomic = (amountScaled * atomicUnitsPerPepe) / priceScaled
  if (rewardAtomic <= 0n || rewardAtomic > maxSafeAtomic) return null
  return Number(rewardAtomic)
}

function isValidSignature(fields: Record<string, string>, signature: string, secret: string) {
  const candidate = signature.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(candidate)) return false

  const canonical = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&')
  const expected = createHmac('sha256', secret).update(canonical, 'utf8').digest()
  const actual = Buffer.from(candidate, 'hex')
  return actual.length === expected.length && timingSafeEqual(expected, actual)
}

async function handlePostback(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? null
  let body = ''
  try {
    const parsedBody = await readLimitedBody(request)
    if (parsedBody === null) return response('no', 413)
    body = parsedBody
  } catch {
    return response('no', 400)
  }
  if (body && contentType !== 'application/json' && contentType !== 'application/x-www-form-urlencoded') {
    return response('no', 415)
  }

  const params = parseRequestParams(request, body, contentType)
  if (!params) return response('no', 400)

  const names = ['user_id', 'sub_id', 'click_id', 'amount', 'currency', 'status', 'timestamp', 'signature', 'campaign_id', 'placement_id']
  const values = Object.fromEntries(names.map((name) => [name, getSingleParam(params, name)])) as Record<string, ParamValue>
  if (Object.values(values).some((param) => !param.valid)) return response('no', 400)

  const rawUserId = values.user_id.value ?? values.sub_id.value ?? ''
  if (!rawUserId || (values.user_id.value && values.sub_id.value && values.user_id.value !== values.sub_id.value)) {
    return response('no', 400)
  }
  const guestId = rawUserId.toLowerCase()
  const clickId = values.click_id.value ?? ''
  const amount = values.amount.value ?? ''
  const currency = values.currency.value ?? ''
  const status = values.status.value ?? ''
  const timestamp = values.timestamp.value ?? ''
  const signature = values.signature.value ?? ''
  const campaignId = values.campaign_id.value
  const placementId = values.placement_id.value

  if (!uuidPattern.test(rawUserId) || !/^[^\u0000-\u001f\u007f]{0,200}$/.test(clickId)) return response('no', 400)
  if (campaignId !== null && campaignId !== '0') return response('no', 400)
  if (placementId !== null && placementId !== FAUCETPAY_PAIDVIEW_PLACEMENT_ID) return response('no', 400)
  if (status !== 'completed' || !/^\d{1,12}$/.test(timestamp) || Number(timestamp) > Math.floor(Date.now() / 1000) + 300) {
    return response('no', 400)
  }
  if (!parsePositiveDecimal(amount) || !['USD', 'USDT'].includes(currency.toUpperCase())) return response('no', 400)

  const secret = process.env.FAUCETPAY_AD_SECRET?.trim() ?? ''
  if (!secret) return response('no', 503)
  const signedFields = {
    user_id: rawUserId,
    click_id: clickId,
    campaign_id: '0',
    placement_id: FAUCETPAY_PAIDVIEW_PLACEMENT_ID,
    amount,
    currency,
    status,
    timestamp,
  }
  if (!isValidSignature(signedFields, signature, secret)) return response('no', 401)

  const sourceKey = clickId ? `click:${clickId}` : `signature:${signature.toLowerCase()}`
  try {
    const [existingEvent] = await db
      .select({ id: earningEvents.id })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'faucetpay_paidview'),
        eq(earningEvents.sourceKey, sourceKey),
      ))
      .limit(1)
    if (existingEvent) return response('OK', 200)
  } catch (error) {
    console.error('[faucetpay-postback] Could not check for a duplicate callback.', error)
    return response('no', 500)
  }

  let rewardAtomic: number
  try {
    rewardAtomic = calculatePepeRewardAtomic(amount, await getFreshPepeUsdPrice()) ?? 0
  } catch (error) {
    console.error('[faucetpay-postback] Live PEPE/USD quote is unavailable.', error)
    return response('no', 503)
  }
  if (rewardAtomic <= 0) return response('no', 400)

  const now = new Date()
  try {
    const result = await db.transaction(async (transaction) => {
      const [profile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, guestId))
        .for('update')
        .limit(1)
      if (!profile) return 'not_found' as const

      const [inserted] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId,
          source: 'faucetpay_paidview',
          sourceKey,
          itemId: `Paid View (${currency.toUpperCase()})`,
          tokenSymbol: 'PEPE',
          rewardAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })

      return inserted ? 'credited' as const : 'duplicate' as const
    })

    if (result === 'not_found') return response('no', 404)
    return response('OK', 200)
  } catch (error) {
    console.error('[faucetpay-postback] Failed to process a verified callback.', error)
    return response('no', 500)
  }
}

export async function GET(request: NextRequest) {
  return handlePostback(request)
}

export async function POST(request: NextRequest) {
  return handlePostback(request)
}
