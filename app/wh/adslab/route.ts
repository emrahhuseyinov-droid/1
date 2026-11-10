import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { grantArcadeEnergy } from '@/lib/arcade-service'
import { db } from '@/lib/db'
import { adslabOfferwallTransactions, earningEvents, guestProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const transactionIdPattern = /^[A-Za-z0-9._:-]{1,128}$/
const signaturePattern = /^[a-f0-9]{64}$/i
const maxSafeAtomic = BigInt(Number.MAX_SAFE_INTEGER)
const atomicUnitsPerPepe = 100_000_000n
const ADSLAB_HOLD_MS = 24 * 60 * 60 * 1000

function response(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { ...noStoreHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function readSingleParam(params: URLSearchParams, name: string, maxLength: number) {
  const values = params.getAll(name)
  if (values.length !== 1) return null
  const value = values[0].trim()
  return value.length > 0 && value.length <= maxLength ? value : null
}

function parsePepeRewardAtomic(value: string) {
  if (value.length > 32) return null
  const match = /^(\d{1,12})(?:\.(\d{1,8}))?$/.exec(value)
  if (!match) return null

  const atomic = BigInt(match[1]) * atomicUnitsPerPepe + BigInt((match[2] ?? '').padEnd(8, '0') || '0')
  return atomic > 0n && atomic <= maxSafeAtomic ? Number(atomic) : null
}

function matchesSignature(txid: string, signature: string, secret: string) {
  if (!signaturePattern.test(signature)) return false
  const supplied = Buffer.from(signature, 'hex')
  const expected = createHash('sha256').update(`${txid}-${secret}`).digest()
  return supplied.length === expected.length && timingSafeEqual(expected, supplied)
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const uid = readSingleParam(params, 'uid', 128) ?? ''
  const action = readSingleParam(params, 'type', 32)?.toLowerCase() ?? ''
  const txid = readSingleParam(params, 'txid', 128) ?? ''
  const reward = readSingleParam(params, 'reward', 64) ?? ''
  const signature = readSingleParam(params, 'signature', 128) ?? ''
  const secret = process.env.API_KEY_2?.trim() ?? ''

  if (!secret) return response('postback unavailable', 503)
  if (!uid || !action || !txid || !reward || !signature
    || params.getAll('uid').length !== 1
    || params.getAll('type').length !== 1
    || params.getAll('txid').length !== 1
    || params.getAll('reward').length !== 1
    || params.getAll('signature').length !== 1
    || !transactionIdPattern.test(txid)) {
    return response('Missing or invalid parameters', 400)
  }

  if (!matchesSignature(txid, signature, secret)) return response('ERROR: Signature does not match', 401)

  const isChargeback = action === 'chargeback' || action === '2'
  const rewardAtomic = isChargeback ? 0 : parsePepeRewardAtomic(reward)
  if (!isChargeback && rewardAtomic === null) return response('Invalid reward', 400)

  try {
    const result = await db.transaction(async (transaction) => {
      let [profile] = uuidPattern.test(uid)
        ? await transaction
          .select({ id: guestProfiles.id })
          .from(guestProfiles)
          .where(eq(guestProfiles.id, uid.toLowerCase()))
          .for('update')
          .limit(1)
        : []

      if (!profile) {
        ;[profile] = await transaction
          .select({ id: guestProfiles.id })
          .from(guestProfiles)
          .where(eq(guestProfiles.userId, uid))
          .for('update')
          .limit(1)
      }

      if (!profile) return 'unknown_user' as const

      let [record] = await transaction
        .select()
        .from(adslabOfferwallTransactions)
        .where(eq(adslabOfferwallTransactions.providerTransactionId, txid))
        .for('update')
        .limit(1)

      if (!record) {
        const now = new Date()
        const [inserted] = await transaction
          .insert(adslabOfferwallTransactions)
          .values({
            providerTransactionId: txid,
            guestId: profile.id,
            status: isChargeback ? 'reversed' : 'credited',
            rewardAtomic: isChargeback ? 0 : rewardAtomic!,
            releaseAt: isChargeback ? null : new Date(now.getTime() + ADSLAB_HOLD_MS),
            rewardReleased: false,
            createdAt: now,
            reversedAt: isChargeback ? now : null,
          })
          .onConflictDoNothing({ target: adslabOfferwallTransactions.providerTransactionId })
          .returning({ id: adslabOfferwallTransactions.id })

        if (inserted) return isChargeback ? 'reversed_before_credit' as const : 'held' as const

        ;[record] = await transaction
          .select()
          .from(adslabOfferwallTransactions)
          .where(eq(adslabOfferwallTransactions.providerTransactionId, txid))
          .for('update')
          .limit(1)
      }

      if (!record) throw new Error('AdsLab transaction could not be read after insert.')
      if (record.guestId !== profile.id) return 'user_mismatch' as const
      if (!isChargeback || record.status === 'reversed') return 'duplicate' as const

      const now = new Date()
      let reversalRecorded = false
      if (record.rewardReleased) {
        const [credited] = await transaction
          .select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, profile.id),
            eq(earningEvents.source, 'adslab_offerwall'),
            eq(earningEvents.sourceKey, txid),
          ))
          .for('update')
          .limit(1)

        if (credited) {
          const [debit] = await transaction
            .insert(earningEvents)
            .values({
              id: randomUUID(),
              guestId: profile.id,
              source: 'adslab_offerwall_reversal',
              sourceKey: txid,
              itemId: txid,
              tokenSymbol: credited.tokenSymbol,
              rewardAtomic: -Math.abs(credited.rewardAtomic),
              createdAt: now,
            })
            .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
            .returning({ id: earningEvents.id })
          reversalRecorded = Boolean(debit)
        }
      }

      await transaction
        .update(adslabOfferwallTransactions)
        .set({ status: 'reversed', reversedAt: now })
        .where(eq(adslabOfferwallTransactions.id, record.id))

      if (!record.rewardReleased) return 'reversed_before_release' as const
      return reversalRecorded ? 'reversed' as const : 'duplicate' as const
    })

    if (result === 'unknown_user') return response('User not found', 404)
    if (result === 'user_mismatch') return response('Transaction user mismatch', 409)

    console.info('[adslab-offerwall] Processed signed callback.', {
      outcome: result,
      uidFingerprint: fingerprint(uid),
      txidFingerprint: fingerprint(txid),
      action,
    })
    return response(result === 'duplicate' ? 'DUP' : 'OK')
  } catch {
    console.error('[adslab-offerwall] Could not process callback.', {
      uidFingerprint: fingerprint(uid),
      txidFingerprint: fingerprint(txid),
    })
    return response('postback error', 500)
  }
}
