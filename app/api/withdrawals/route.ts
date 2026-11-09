import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, withdrawalRequests } from '@/lib/db/schema'
import { ADVERTISER_WALLET_EVENT_SOURCES } from '@/lib/advertiser-wallet'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import { DAILY_WITHDRAWAL_LIMIT_ATOMIC, MIN_WITHDRAWAL_ATOMIC } from '@/lib/withdrawal-constants'
import { PEPE_RESERVE_EVENT_SOURCES } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const faucetPayEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function verifyFaucetPayEmail(email: string): Promise<'registered' | 'not_registered' | 'unavailable'> {
  const apiKey = process.env.FAUCETPAY_API_KEY?.trim()
  if (!apiKey) return 'unavailable'

  const body = new URLSearchParams({ api_key: apiKey, address: email, currency: 'BTC' })

  try {
    const response = await fetch('https://faucetpay.io/api/v1/checkaddress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return 'unavailable'

    const result: unknown = await response.json().catch(() => null)
    if (typeof result !== 'object' || result === null || !('status' in result)) return 'unavailable'

    if (result.status === 200) return 'registered'
    if (result.status === 456) return 'not_registered'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

type FaucetPayPayoutResult =
  | { outcome: 'paid'; paymentReference: string | null }
  | { outcome: 'rejected' }
  | { outcome: 'uncertain' }

async function sendFaucetPayPayout(email: string, amountAtomic: number): Promise<FaucetPayPayoutResult> {
  const apiKey = process.env.FAUCETPAY_API_KEY?.trim()
  if (!apiKey) return { outcome: 'uncertain' }

  const body = new URLSearchParams({
    api_key: apiKey,
    to: email,
    amount: String(amountAtomic),
    currency: 'PEPE',
  })

  try {
    const response = await fetch('https://faucetpay.io/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    const payload: unknown = await response.json().catch(() => null)
    if (typeof payload !== 'object' || payload === null || !('status' in payload) || typeof payload.status !== 'number') {
      return { outcome: 'uncertain' }
    }
    if (payload.status !== 200) return { outcome: 'rejected' }

    const reference = 'payout_id' in payload && (typeof payload.payout_id === 'number' || typeof payload.payout_id === 'string')
      ? String(payload.payout_id).slice(0, 140)
      : null
    return { outcome: 'paid', paymentReference: reference }
  } catch {
    return { outcome: 'uncertain' }
  }
}

async function settleFaucetPayPayout(requestId: string, payout: FaucetPayPayoutResult) {
  return db.transaction(async (transaction) => {
    const [withdrawal] = await transaction
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.id, requestId))
      .for('update')
      .limit(1)

    if (!withdrawal) throw new Error('Withdrawal request disappeared before payout settlement.')
    if (withdrawal.status !== 'pending') {
      return { status: withdrawal.status, paymentReference: withdrawal.paymentReference }
    }

    const now = new Date()
    if (payout.outcome === 'uncertain') {
      await transaction.update(withdrawalRequests)
        .set({
          adminNote: 'FaucetPay did not confirm the result. The reserved PEPE remains held to prevent a duplicate transfer; do not resubmit.',
          processedBy: 'faucetpay-api-v1',
          updatedAt: now,
        })
        .where(eq(withdrawalRequests.id, requestId))
      return { status: 'pending' as const, paymentReference: withdrawal.paymentReference }
    }

    const status = payout.outcome === 'paid' ? 'paid' as const : 'rejected' as const
    const adminNote = payout.outcome === 'rejected'
      ? 'FaucetPay declined the automatic payout. The reserved PEPE was returned to your balance.'
      : null

    await transaction.update(withdrawalRequests)
      .set({
        status,
        adminNote,
        paymentReference: payout.outcome === 'paid' ? payout.paymentReference : null,
        processedBy: 'faucetpay-api-v1',
        paidAt: payout.outcome === 'paid' ? now : null,
        updatedAt: now,
      })
      .where(eq(withdrawalRequests.id, requestId))

    if (payout.outcome === 'rejected') {
      await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId: withdrawal.guestId,
        source: 'withdrawal_refund',
        sourceKey: `${withdrawal.id}:refund`,
        itemId: 'Rejected PEPE withdrawal refund',
        tokenSymbol: 'PEPE',
        rewardAtomic: withdrawal.amountAtomic,
        createdAt: now,
      })
    }

    return {
      status,
      paymentReference: payout.outcome === 'paid' ? payout.paymentReference : null,
    }
  })
}

function getUtcDayKey() {
  return new Date().toISOString().slice(0, 10)
}

function serializeRequest(row: Pick<typeof withdrawalRequests.$inferSelect, 'id' | 'faucetPayEmail' | 'amountAtomic' | 'status' | 'adminNote' | 'paymentReference' | 'createdAt'>) {
  return {
    id: row.id,
    faucetPayEmail: row.faucetPayEmail,
    amountAtomic: String(row.amountAtomic),
    status: row.status,
    adminNote: row.adminNote,
    paymentReference: row.paymentReference,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const today = getUtcDayKey()
    const [requestRows, balanceRows, dailyRows] = await Promise.all([
      db.select().from(withdrawalRequests)
        .where(eq(withdrawalRequests.userId, account.session.user.id))
        .orderBy(desc(withdrawalRequests.createdAt))
        .limit(50),
      db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
        )),
      db.select({ amount: sql<string>`coalesce(sum(${withdrawalRequests.amountAtomic}), 0)::text` })
        .from(withdrawalRequests)
        .where(and(
          eq(withdrawalRequests.userId, account.session.user.id),
          eq(withdrawalRequests.requestDay, today),
          inArray(withdrawalRequests.status, ['pending', 'paid']),
        )),
    ])

    const todayUsedAtomic = BigInt(dailyRows[0]?.amount ?? '0')
    const dailyRemainingAtomic = BigInt(DAILY_WITHDRAWAL_LIMIT_ATOMIC) - todayUsedAtomic

    return NextResponse.json({
      availableBalanceAtomic: balanceRows[0]?.amount ?? '0',
      todayUsedAtomic: todayUsedAtomic.toString(),
      dailyRemainingAtomic: (dailyRemainingAtomic > 0n ? dailyRemainingAtomic : 0n).toString(),
      dailyLimitAtomic: String(DAILY_WITHDRAWAL_LIMIT_ATOMIC),
      minWithdrawalAtomic: String(MIN_WITHDRAWAL_ATOMIC),
      requests: requestRows.map(serializeRequest),
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[withdrawals] Could not load withdrawal data:', error)
    return NextResponse.json({ error: 'Could not load withdrawal requests.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })
  }

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('withdrawal-create', account.session.user.id, { windowSeconds: 60 * 60, max: 5 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Enter valid withdrawal details.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const amountAtomic = parsePepeAmountToAtomic(input.amount)
  const faucetPayEmail = typeof input.faucetPayEmail === 'string' ? input.faucetPayEmail.trim().toLowerCase() : ''
  const requestKey = typeof input.requestKey === 'string' && uuidPattern.test(input.requestKey)
    ? input.requestKey.toLowerCase()
    : null

  if (amountAtomic === null || BigInt(amountAtomic) < BigInt(MIN_WITHDRAWAL_ATOMIC)) {
    return NextResponse.json({ error: 'The minimum withdrawal is 5,000 PEPE.' }, { status: 400, headers: noStoreHeaders })
  }
  if (BigInt(amountAtomic) > BigInt(DAILY_WITHDRAWAL_LIMIT_ATOMIC)) {
    return NextResponse.json({ error: 'The daily withdrawal limit is 50,000 PEPE.' }, { status: 400, headers: noStoreHeaders })
  }
  if (faucetPayEmail.length > 254 || !faucetPayEmailPattern.test(faucetPayEmail)) {
    return NextResponse.json({ error: 'Enter a valid FaucetPay email address.' }, { status: 400, headers: noStoreHeaders })
  }
  if (!requestKey) {
    return NextResponse.json({ error: 'Could not identify this request. Please try again.' }, { status: 400, headers: noStoreHeaders })
  }

  const faucetPayVerification = await verifyFaucetPayEmail(faucetPayEmail)
  if (faucetPayVerification === 'not_registered') {
    return NextResponse.json({ error: 'This email is not a verified FaucetPay account. Check the address or use another account.' }, { status: 422, headers: noStoreHeaders })
  }
  if (faucetPayVerification === 'unavailable') {
    return NextResponse.json({ error: 'FaucetPay could not verify this email right now. Please try again later.' }, { status: 503, headers: noStoreHeaders })
  }

  try {
    const today = getUtcDayKey()
    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'profile_missing' as const }

      const [existingRequest] = await transaction
        .select()
        .from(withdrawalRequests)
        .where(and(
          eq(withdrawalRequests.userId, account.session.user.id),
          eq(withdrawalRequests.requestKey, requestKey),
        ))
        .for('update')
        .limit(1)

      if (existingRequest) {
        if (existingRequest.amountAtomic !== amountAtomic || existingRequest.faucetPayEmail !== faucetPayEmail) {
          return { status: 'idempotency_conflict' as const }
        }
        return {
          status: 'ok' as const,
          requestId: existingRequest.id,
          amountAtomic: String(existingRequest.amountAtomic),
          requestStatus: existingRequest.status,
          paymentReference: existingRequest.paymentReference,
          createdAt: existingRequest.createdAt.toISOString(),
          alreadyProcessed: true,
        }
      }

      const [dailyRow] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${withdrawalRequests.amountAtomic}), 0)::text` })
        .from(withdrawalRequests)
        .where(and(
          eq(withdrawalRequests.userId, account.session.user.id),
          eq(withdrawalRequests.requestDay, today),
          inArray(withdrawalRequests.status, ['pending', 'paid']),
        ))
      const todayUsedAtomic = BigInt(dailyRow?.amount ?? '0')
      if (todayUsedAtomic + BigInt(amountAtomic) > BigInt(DAILY_WITHDRAWAL_LIMIT_ATOMIC)) {
        const dailyRemainingAtomic = BigInt(DAILY_WITHDRAWAL_LIMIT_ATOMIC) - todayUsedAtomic
        return { status: 'daily_limit' as const, dailyRemainingAtomic: (dailyRemainingAtomic > 0n ? dailyRemainingAtomic : 0n).toString() }
      }

      const [balanceRow] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]),
        ))
      const balanceAtomic = BigInt(balanceRow?.amount ?? '0')
      if (balanceAtomic < BigInt(amountAtomic)) {
        return { status: 'insufficient_balance' as const, availableBalanceAtomic: balanceAtomic.toString() }
      }

      const requestId = randomUUID()
      const now = new Date()
      const [createdRequest] = await transaction.insert(withdrawalRequests).values({
        id: requestId,
        userId: account.session.user.id,
        guestId: account.profile.id,
        faucetPayEmail,
        requestKey,
        amountAtomic,
        requestDay: today,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }).returning({ id: withdrawalRequests.id, status: withdrawalRequests.status, createdAt: withdrawalRequests.createdAt })

      await transaction.insert(earningEvents).values({
        id: randomUUID(),
        guestId: account.profile.id,
        source: 'withdrawal_request',
        sourceKey: `${requestId}:reserve`,
        itemId: 'PEPE withdrawal request',
        tokenSymbol: 'PEPE',
        rewardAtomic: -amountAtomic,
        createdAt: now,
      })

      return {
        status: 'ok' as const,
        requestId: createdRequest.id,
        amountAtomic: String(amountAtomic),
        requestStatus: createdRequest.status,
        paymentReference: null,
        createdAt: createdRequest.createdAt.toISOString(),
        alreadyProcessed: false,
      }
    })

    if (result.status === 'profile_missing') {
      return NextResponse.json({ error: 'Your account profile could not be found.' }, { status: 404, headers: noStoreHeaders })
    }
    if (result.status === 'idempotency_conflict') {
      return NextResponse.json({ error: 'This request key was already used for different withdrawal details.' }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'daily_limit') {
      return NextResponse.json({ error: 'This request would exceed your 50,000 PEPE daily limit.', dailyRemainingAtomic: result.dailyRemainingAtomic }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'insufficient_balance') {
      return NextResponse.json({ error: 'Your available PEPE balance is too low for this request.', availableBalanceAtomic: result.availableBalanceAtomic }, { status: 409, headers: noStoreHeaders })
    }

    let payoutStatus = result.requestStatus
    let paymentReference = result.paymentReference

    if (!result.alreadyProcessed) {
      try {
        const payout = await sendFaucetPayPayout(faucetPayEmail, amountAtomic)
        const settled = await settleFaucetPayPayout(result.requestId, payout)
        payoutStatus = settled.status
        paymentReference = settled.paymentReference
      } catch {
        console.error('[withdrawals] FaucetPay result could not be recorded; the request remains reserved.')
        payoutStatus = 'pending'
      }
    }

    return NextResponse.json({
      requestId: result.requestId,
      amountAtomic: result.amountAtomic,
      status: payoutStatus,
      paymentReference,
      createdAt: result.createdAt,
      alreadyProcessed: result.alreadyProcessed,
    }, { status: result.alreadyProcessed ? 200 : 201, headers: noStoreHeaders })
  } catch (error) {
    console.error('[withdrawals] Could not create withdrawal request:', error)
    return NextResponse.json({ error: 'Could not submit your withdrawal request. Please retry.' }, { status: 500, headers: noStoreHeaders })
  }
}
