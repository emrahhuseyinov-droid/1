import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ADVERTISER_WALLET_EVENT_SOURCES, ADVERTISER_WALLET_FAUCETPAY_DEPOSIT_SOURCE } from '@/lib/advertiser-wallet'
import { db } from '@/lib/db'
import { advertiserDeposits, earningEvents, guestProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const maxSafeAtomic = BigInt(Number.MAX_SAFE_INTEGER)
const atomicUnitsPerPepe = 100_000_000n

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePepeAtomic(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const match = /^(\d{1,20})(?:\.(\d{1,8}))?$/.exec(String(value).trim())
  if (!match) return null

  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(8, '0') || '0')
  const amountAtomic = whole * atomicUnitsPerPepe + fraction
  return amountAtomic > 0n ? amountAtomic : null
}

async function readCallbackToken(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json().catch(() => null)
    return isRecord(body) && typeof body.token === 'string' ? body.token.trim() : null
  }

  const form = await request.formData().catch(() => null)
  const token = form?.get('token')
  return typeof token === 'string' ? token.trim() : null
}

export async function POST(request: Request) {
  const token = await readCallbackToken(request)
  if (!token || token.length > 2048) {
    return NextResponse.json({ error: 'Invalid payment callback.' }, { status: 400, headers: noStoreHeaders })
  }

  const merchantUsername = process.env.FAUCETPAY_MERCHANT_USERNAME?.trim()
  if (!merchantUsername) {
    return NextResponse.json({ error: 'Payment verification is not configured.' }, { status: 503, headers: noStoreHeaders })
  }

  let payment: JsonRecord
  try {
    const response = await fetch(`https://faucetpay.io/merchant/get-payment/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 502, headers: noStoreHeaders })
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload)) return NextResponse.json({ error: 'Invalid payment verification response.' }, { status: 502, headers: noStoreHeaders })
    payment = payload
  } catch (error) {
    console.error('[faucetpay-callback] Payment verification request failed:', error)
    return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 502, headers: noStoreHeaders })
  }

  const transactionId = typeof payment.transaction_id === 'string' || typeof payment.transaction_id === 'number'
    ? String(payment.transaction_id).trim()
    : ''
  const depositId = typeof payment.custom === 'string' ? payment.custom.trim().toLowerCase() : ''
  const currency = typeof payment.currency1 === 'string' ? payment.currency1.trim().toUpperCase() : ''
  const paidAmountAtomic = parsePepeAtomic(payment.amount1)
  const verifiedMerchant = typeof payment.merchant_username === 'string' ? payment.merchant_username.trim() : ''

  if (
    payment.valid !== true ||
    !transactionId || transactionId.length > 128 ||
    !uuidPattern.test(depositId) ||
    currency !== 'PEPE' ||
    !paidAmountAtomic ||
    verifiedMerchant.toLowerCase() !== merchantUsername.toLowerCase()
  ) {
    return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const [deposit] = await transaction.select().from(advertiserDeposits)
        .where(eq(advertiserDeposits.id, depositId))
        .for('update')
        .limit(1)
      if (!deposit || deposit.provider !== 'faucetpay') return { status: 'not_found' as const }
      if (deposit.status !== 'pending') return { status: deposit.status as 'paid' | 'underpaid' | 'review' }

      const [usedTransaction] = await transaction.select({ id: advertiserDeposits.id })
        .from(advertiserDeposits)
        .where(and(
          eq(advertiserDeposits.provider, 'faucetpay'),
          eq(advertiserDeposits.providerTransactionId, transactionId),
        ))
        .limit(1)
      if (usedTransaction && usedTransaction.id !== deposit.id) {
        await transaction.update(advertiserDeposits).set({
          status: 'review',
          actualAmountAtomic: paidAmountAtomic,
          updatedAt: new Date(),
        }).where(eq(advertiserDeposits.id, deposit.id))
        return { status: 'review' as const }
      }

      const now = new Date()
      const expectedAmountAtomic = BigInt(deposit.amountAtomic)
      if (paidAmountAtomic < expectedAmountAtomic) {
        await transaction.update(advertiserDeposits).set({
          status: 'underpaid',
          actualAmountAtomic: paidAmountAtomic,
          providerTransactionId: transactionId,
          updatedAt: now,
        }).where(eq(advertiserDeposits.id, deposit.id))
        return { status: 'underpaid' as const }
      }

      const [lockedProfile] = await transaction.select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, deposit.guestId))
        .for('update')
        .limit(1)
      if (!lockedProfile || paidAmountAtomic > maxSafeAtomic) {
        await transaction.update(advertiserDeposits).set({
          status: 'review',
          actualAmountAtomic: paidAmountAtomic,
          providerTransactionId: transactionId,
          updatedAt: now,
        }).where(eq(advertiserDeposits.id, deposit.id))
        return { status: 'review' as const }
      }

      const [balanceRow] = await transaction.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, deposit.guestId),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]),
        ))
      const currentBalance = BigInt(balanceRow?.amount ?? '0')
      if (currentBalance + paidAmountAtomic > maxSafeAtomic) {
        await transaction.update(advertiserDeposits).set({
          status: 'review',
          actualAmountAtomic: paidAmountAtomic,
          providerTransactionId: transactionId,
          updatedAt: now,
        }).where(eq(advertiserDeposits.id, deposit.id))
        return { status: 'review' as const }
      }

      const [existingCredit] = await transaction.select({ rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, deposit.guestId),
          eq(earningEvents.source, ADVERTISER_WALLET_FAUCETPAY_DEPOSIT_SOURCE),
          eq(earningEvents.sourceKey, deposit.id),
        ))
        .limit(1)
      if (existingCredit) {
        const status = BigInt(existingCredit.rewardAtomic) === paidAmountAtomic ? 'paid' : 'review'
        await transaction.update(advertiserDeposits).set({
          status,
          actualAmountAtomic: paidAmountAtomic,
          providerTransactionId: transactionId,
          updatedAt: now,
          paidAt: status === 'paid' ? now : null,
        }).where(eq(advertiserDeposits.id, deposit.id))
        return { status }
      }

      await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId: deposit.guestId,
        source: ADVERTISER_WALLET_FAUCETPAY_DEPOSIT_SOURCE,
        sourceKey: deposit.id,
        itemId: 'FaucetPay advertiser wallet top-up',
        tokenSymbol: 'PEPE',
        rewardAtomic: Number(paidAmountAtomic),
        createdAt: now,
      })
      await transaction.update(advertiserDeposits).set({
        status: 'paid',
        actualAmountAtomic: paidAmountAtomic,
        providerTransactionId: transactionId,
        updatedAt: now,
        paidAt: now,
      }).where(eq(advertiserDeposits.id, deposit.id))

      return { status: 'paid' as const }
    })

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Payment request was not found.' }, { status: 404, headers: noStoreHeaders })
    }

    return NextResponse.json({ received: true, status: result.status }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[faucetpay-callback] Could not apply verified payment:', error)
    return NextResponse.json({ error: 'Payment processing is temporarily unavailable.' }, { status: 500, headers: noStoreHeaders })
  }
}
