import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, offerwallTransactions } from '@/lib/db/schema'
import { OFFERWALL_PLATFORM_SHARE_BPS, OFFERWALL_USER_SHARE_BPS } from '@/lib/offerwall-pricing'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function response(body: string, status: number) {
  return new NextResponse(body, { status, headers: { ...noStoreHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
}

function isValidSignature(transId: string, suppliedSignature: string | null, secureHash: string) {
  const candidate = suppliedSignature?.trim().toLowerCase() ?? ''
  if (!/^[a-f0-9]{32}$/.test(candidate)) return false

  const expected = createHash('md5').update(`${transId}-${secureHash}`).digest()
  const actual = Buffer.from(candidate, 'hex')
  return actual.length === expected.length && timingSafeEqual(expected, actual)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const userId = params.get('user_id')?.trim().toLowerCase() ?? ''
  const transId = params.get('trans_id')?.trim() ?? ''
  const status = params.get('status')?.trim() ?? ''
  const secureHash = process.env.CPX_SECURE_HASH?.trim() ?? ''
  const suppliedSignature = params.get('secure_hash')?.trim() || params.get('hash')

  if (!secureHash) return response('0', 503)
  if (!uuidPattern.test(userId) || !transId || transId.length > 200 || /[\u0000-\u001f\u007f]/.test(transId)) {
    return response('0', 400)
  }
  if (!isValidSignature(transId, suppliedSignature, secureHash)) return response('0', 401)
  if (status !== '1' && status !== '2') return response('0', 400)

  try {
    if (status === '1') {
      const [existingTransaction] = await db
        .select({ guestId: offerwallTransactions.guestId })
        .from(offerwallTransactions)
        .where(and(
          eq(offerwallTransactions.provider, 'cpx_research'),
          eq(offerwallTransactions.providerTransactionId, transId),
        ))
        .limit(1)

      if (!existingTransaction) return response('0', 410)
      if (existingTransaction.guestId !== userId) return response('0', 409)
      return response('1', 200)
    }

    if (status === '2') {
      const result = await db.transaction(async (transaction) => {
        const [profile] = await transaction
          .select({ id: guestProfiles.id })
          .from(guestProfiles)
          .where(eq(guestProfiles.id, userId))
          .for('update')
          .limit(1)

        if (!profile) return 'not_found' as const

        let [record] = await transaction
          .select()
          .from(offerwallTransactions)
          .where(and(
            eq(offerwallTransactions.provider, 'cpx_research'),
            eq(offerwallTransactions.providerTransactionId, transId),
          ))
          .for('update')
          .limit(1)

        if (!record) {
          const [placeholder] = await transaction
            .insert(offerwallTransactions)
            .values({
              provider: 'cpx_research',
              providerTransactionId: transId,
              guestId: userId,
              status: 'reversed',
              amountUsd: '0',
              userShareBps: OFFERWALL_USER_SHARE_BPS,
              rewardAtomic: 0,
              platformShareBps: OFFERWALL_PLATFORM_SHARE_BPS,
              platformAmountUsd: '0',
              platformRewardAtomic: 0,
              reversedAt: new Date(),
            })
            .onConflictDoNothing({ target: [offerwallTransactions.provider, offerwallTransactions.providerTransactionId] })
            .returning()

          record = placeholder ?? (await transaction
            .select()
            .from(offerwallTransactions)
            .where(and(
              eq(offerwallTransactions.provider, 'cpx_research'),
              eq(offerwallTransactions.providerTransactionId, transId),
            ))
            .for('update')
            .limit(1))[0]
        }

        if (!record) throw new Error('Could not lock the CPX transaction for reversal.')
        if (record.guestId !== userId) return 'user_mismatch' as const
        if (record.status === 'reversed') return 'duplicate' as const

        const [debit] = await transaction
          .insert(earningEvents)
          .values({
            id: randomUUID(),
            guestId: userId,
            source: 'offerwall_cpx_reversal',
            sourceKey: transId,
            itemId: transId,
            tokenSymbol: 'PEPE',
            rewardAtomic: -record.rewardAtomic,
          })
          .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
          .returning({ id: earningEvents.id })

        await transaction
          .update(offerwallTransactions)
          .set({ status: 'reversed', reversedAt: new Date() })
          .where(eq(offerwallTransactions.id, record.id))

        return debit ? 'reversed' as const : 'already_reversed' as const
      })

      if (result === 'not_found') return response('0', 404)
      if (result === 'user_mismatch') return response('0', 409)
      return response('1', 200)
    }

    return response('0', 410)
  } catch (error) {
    console.error('[offerwalls-cpx-postback] Could not process the verified CPX callback:', error)
    return response('0', 500)
  }
}
