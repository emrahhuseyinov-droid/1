import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, offerwallMeTransactions } from '@/lib/db/schema'
import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'
import { calculateOfferwallMeRewardAtomic, normalizeOfferwallUsd, offerwallPointsToUsd } from '@/lib/offerwall-me-pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const maxBodyBytes = 16 * 1024
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

function getSignature(params: URLSearchParams): ParamValue {
  return getSingleParam(params, 'signature')
}

function isValidSignature(subId: string, transId: string, reward: string, supplied: string, secret: string) {
  const candidate = supplied.trim().toLowerCase()
  if (!/^[a-f0-9]{32}$/.test(candidate)) return false

  const expected = createHash('md5').update(`${subId}${transId}${reward}${secret}`, 'utf8').digest()
  const actual = Buffer.from(candidate, 'hex')
  return actual.length === expected.length && timingSafeEqual(expected, actual)
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? null

  let body: string | null
  try {
    body = await readLimitedBody(request)
  } catch {
    return response('no', 400)
  }
  if (body === null) return response('no', 413)

  const params = new URLSearchParams(request.nextUrl.searchParams)
  if (body) {
    if (contentType === 'application/x-www-form-urlencoded') {
      new URLSearchParams(body).forEach((value, key) => params.append(key, value))
    } else if (contentType === 'application/json') {
      let payload: unknown
      try {
        payload = JSON.parse(body)
      } catch {
        return response('no', 400)
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response('no', 400)
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value !== 'string' && typeof value !== 'number') return response('no', 400)
        params.append(key, String(value))
      }
    } else {
      return response('no', 415)
    }
  }
  const subIdParam = getSingleParam(params, 'subId')
  const transIdParam = getSingleParam(params, 'transId')
  const rewardParam = getSingleParam(params, 'reward')
  const statusParam = getSingleParam(params, 'status')
  const signatureParam = getSignature(params)
  const offerTypeParam = getSingleParam(params, 'offer_type')
  const offerNameParam = getSingleParam(params, 'offer_name')
  const payoutParam = getSingleParam(params, 'payout')
  const debugParam = getSingleParam(params, 'debug')

  if (![subIdParam, transIdParam, rewardParam, statusParam, signatureParam, offerTypeParam, offerNameParam, payoutParam, debugParam].every((param) => param.valid)) {
    return response('no', 400)
  }

  const subId = subIdParam.value ?? ''
  const transId = transIdParam.value ?? ''
  const reward = rewardParam.value ?? ''
  const status = statusParam.value ?? ''
  const signature = signatureParam.value ?? ''
  const guestId = subId.toLowerCase()
  const testPostback = debugParam.value === '1' || /^test-user-[a-z0-9_-]{1,128}$/i.test(subId)

  if (!subId || subId.length > 200 || /[\u0000-\u001f\u007f]/.test(subId) || (!testPostback && !uuidPattern.test(subId)) || !transId || transId.length > 200 || /[\u0000-\u001f\u007f]/.test(transId)) {
    return response('no', 400)
  }
  if (status !== '1' && status !== '2') return response('no', 400)

  const pointsUsd = offerwallPointsToUsd(reward)
  if (pointsUsd === null) return response('no', 400)

  const secret = process.env.OFFERWALL_ME_SECRET?.trim() ?? ''
  if (!secret) return response('no', 503)
  if (!isValidSignature(subId, transId, reward, signature, secret)) return response('no', 401)
  if (testPostback) return response('ok', 200)

  if (status === '1') {
    try {
      const [existingRecord] = await db
        .select({ guestId: offerwallMeTransactions.guestId })
        .from(offerwallMeTransactions)
        .where(eq(offerwallMeTransactions.providerTransactionId, transId))
        .limit(1)

      if (existingRecord) {
        return existingRecord.guestId === guestId ? response('ok', 200) : response('no', 409)
      }
    } catch (error) {
      console.error('[offerwall-me-postback] Could not check for an existing transaction.', error)
      return response('no', 500)
    }
  }

  const rawOfferType = offerTypeParam.value?.trim().toLowerCase() || 'offer'
  if (!/^[a-z0-9_-]{1,64}$/.test(rawOfferType)) return response('no', 400)
  const offerName = offerNameParam.value?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500) || null
  const rawPayoutUsd = payoutParam.value?.trim() ?? ''
  const payoutUsd = rawPayoutUsd ? normalizeOfferwallUsd(rawPayoutUsd) : null
  if (rawPayoutUsd && payoutUsd === null) return response('no', 400)
  // The provider signature covers reward points, so reject an unsigned payout that contradicts the configured rate.
  if (payoutUsd && payoutUsd !== pointsUsd) return response('no', 400)

  const usdAmount = payoutUsd ?? pointsUsd
  let rewardAtomic = 0
  if (status === '1') {
    let pepeUsdPrice: string
    try {
      pepeUsdPrice = (await getFreshPepeUsdPrice()).toFixed(18).replace(/0+$/, '').replace(/\.$/, '')
    } catch (error) {
      console.error('[offerwall-me-postback] Live PEPE/USD quote is unavailable.', error)
      return response('no', 503)
    }

    const convertedRewardAtomic = calculateOfferwallMeRewardAtomic(usdAmount, pepeUsdPrice)
    if (convertedRewardAtomic === null) return response('no', 400)
    rewardAtomic = convertedRewardAtomic
  }

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

      let [record] = await transaction
        .select()
        .from(offerwallMeTransactions)
        .where(eq(offerwallMeTransactions.providerTransactionId, transId))
        .for('update')
        .limit(1)

      if (!record) {
        const [inserted] = await transaction
          .insert(offerwallMeTransactions)
          .values({
            providerTransactionId: transId,
            guestId,
            offerType: rawOfferType,
            offerName,
            payoutUsd: usdAmount,
            status: status === '1' ? 'credited' : 'reversed',
            rewardAtomic: status === '1' ? rewardAtomic : 0,
            reversedAt: status === '1' ? null : now,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [offerwallMeTransactions.providerTransactionId] })
          .returning()

        if (inserted) {
          if (status === '1') {
            await transaction.insert(earningEvents).values({
              id: randomUUID(),
              guestId,
              source: 'offerwall_me',
              sourceKey: transId,
              itemId: offerName ?? rawOfferType,
              tokenSymbol: 'PEPE',
              rewardAtomic,
              createdAt: now,
            })
          }
          return status === '1' ? 'credited' as const : 'reversed' as const
        }

        ;[record] = await transaction
          .select()
          .from(offerwallMeTransactions)
          .where(eq(offerwallMeTransactions.providerTransactionId, transId))
          .for('update')
          .limit(1)
      }

      if (!record) throw new Error('Offerwall.me transaction could not be locked.')
      if (record.guestId !== guestId) return 'user_mismatch' as const

      if (status === '1') return 'duplicate' as const
      if (record.status === 'reversed') return 'duplicate' as const

      const [originalCredit] = await transaction
        .select({ tokenSymbol: earningEvents.tokenSymbol })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, guestId),
          eq(earningEvents.source, 'offerwall_me'),
          eq(earningEvents.sourceKey, transId),
        ))
        .limit(1)

      await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId,
        source: 'offerwall_me_reversal',
        sourceKey: transId,
        itemId: record.offerName ?? record.offerType,
        tokenSymbol: originalCredit?.tokenSymbol ?? 'HOMERO',
        rewardAtomic: -record.rewardAtomic,
        createdAt: now,
      }).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })

      await transaction
        .update(offerwallMeTransactions)
        .set({ status: 'reversed', reversedAt: now })
        .where(and(
          eq(offerwallMeTransactions.id, record.id),
          eq(offerwallMeTransactions.status, 'credited'),
        ))

      return 'reversed' as const
    })

    if (result === 'not_found') return response('no', 404)
    if (result === 'user_mismatch') return response('no', 409)
    return response('ok', 200)
  } catch (error) {
    console.error('[offerwall-me-postback] Failed to process a verified callback.', error)
    return response('no', 500)
  }
}
