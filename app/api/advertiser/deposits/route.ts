import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { ADVERTISER_WALLET_EVENT_SOURCES } from '@/lib/advertiser-wallet'
import { db } from '@/lib/db'
import { advertiserDeposits, earningEvents, guestProfiles } from '@/lib/db/schema'
import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'
import { formatPepeAtomic } from '@/lib/pepe-amount'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const faucetPayCheckoutUrl = 'https://faucetpay.io/merchant/webscr'
const maxSafeAtomic = BigInt(Number.MAX_SAFE_INTEGER)

type DepositRecord = typeof advertiserDeposits.$inferSelect

type CheckoutFields = {
  actionUrl: string
  merchantUsername: string
  itemDescription: string
  amount1: string
  currency1: 'PEPE'
  custom: string
  callbackUrl: string
  successUrl: string
  cancelUrl: string
}

function parseUsdCents(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null

  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  if (cents < 500n) return null

  return {
    cents,
    formatted: `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`,
  }
}

function pepeAtomicForUsdCents(cents: bigint, price: number) {
  if (!Number.isFinite(price) || price <= 0) return null

  const [whole, fraction = ''] = price.toFixed(18).split('.')
  const scaledPrice = BigInt(`${whole}${fraction.padEnd(18, '0')}`)
  if (scaledPrice <= 0n) return null

  const numerator = cents * 10n ** 24n
  const amountAtomic = (numerator + scaledPrice - 1n) / scaledPrice
  if (amountAtomic <= 0n || amountAtomic > maxSafeAtomic) return null
  return amountAtomic
}

function serializeDeposit(deposit: DepositRecord) {
  return {
    id: deposit.id,
    status: deposit.status,
    amountUsd: deposit.amountUsd,
    pepeUsdPrice: deposit.pepeUsdPrice,
    amountAtomic: String(deposit.amountAtomic),
    actualAmountAtomic: deposit.actualAmountAtomic?.toString() ?? null,
    createdAt: deposit.createdAt.toISOString(),
    paidAt: deposit.paidAt?.toISOString() ?? null,
  }
}

function buildCheckoutFields(deposit: DepositRecord, request: NextRequest, merchantUsername: string): CheckoutFields {
  const origin = new URL(request.url).origin
  const callback = new URL('/api/payments/faucetpay/callback', origin)
  const success = new URL('/advertiser/deposit', origin)
  const cancel = new URL('/advertiser/deposit', origin)
  success.searchParams.set('payment', 'returned')
  success.searchParams.set('deposit', deposit.id)
  cancel.searchParams.set('payment', 'cancelled')
  cancel.searchParams.set('deposit', deposit.id)

  return {
    actionUrl: faucetPayCheckoutUrl,
    merchantUsername,
    itemDescription: 'pepe.casa Advertiser Wallet Top-up',
    amount1: formatPepeAtomic(deposit.amountAtomic),
    currency1: 'PEPE',
    custom: deposit.id,
    callbackUrl: callback.toString(),
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
  }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const rows = await db.select().from(advertiserDeposits)
      .where(and(
        eq(advertiserDeposits.userId, account.session.user.id),
        eq(advertiserDeposits.guestId, account.profile.id),
      ))
      .orderBy(desc(advertiserDeposits.createdAt))
      .limit(8)

    const merchantUsername = process.env.FAUCETPAY_MERCHANT_USERNAME?.trim()
    return NextResponse.json({
      deposits: rows.map((deposit) => ({
        ...serializeDeposit(deposit),
        checkout: deposit.status === 'pending' && merchantUsername
          ? buildCheckoutFields(deposit, request, merchantUsername)
          : null,
      })),
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-deposits] Could not load top-ups:', error)
    return NextResponse.json({ error: 'Could not load top-up history.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('advertiser-deposit-create', account.session.user.id, { windowSeconds: 60, max: 5 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Enter a valid top-up amount.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const parsedUsd = parseUsdCents(input.amountUsd)
  const requestKey = typeof input.requestKey === 'string' && uuidPattern.test(input.requestKey)
    ? input.requestKey.toLowerCase()
    : null
  if (!parsedUsd || !requestKey) {
    return NextResponse.json({ error: 'The minimum top-up is $5.00. Enter an amount with up to two decimal places.' }, { status: 400, headers: noStoreHeaders })
  }

  const merchantUsername = process.env.FAUCETPAY_MERCHANT_USERNAME?.trim()
  if (!merchantUsername || merchantUsername.length > 80) {
    return NextResponse.json({ error: 'FaucetPay merchant username is not configured.' }, { status: 503, headers: noStoreHeaders })
  }

  let pepeUsdPrice: number
  try {
    pepeUsdPrice = await getFreshPepeUsdPrice()
  } catch (error) {
    console.error('[advertiser-deposits] Could not get a fresh PEPE quote:', error)
    return NextResponse.json({ error: 'The live PEPE/USD quote is temporarily unavailable. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }

  const amountAtomic = pepeAtomicForUsdCents(parsedUsd.cents, pepeUsdPrice)
  if (amountAtomic === null) {
    return NextResponse.json({ error: 'This amount exceeds the supported PEPE ledger limit.' }, { status: 400, headers: noStoreHeaders })
  }

  const now = new Date()
  const priceString = pepeUsdPrice.toFixed(18)
  const result = await db.transaction(async (transaction) => {
    const [lockedProfile] = await transaction.select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, account.profile.id))
      .for('update')
      .limit(1)
    if (!lockedProfile) return { status: 'profile_missing' as const }

    const [existing] = await transaction.select().from(advertiserDeposits)
      .where(and(
        eq(advertiserDeposits.userId, account.session.user.id),
        eq(advertiserDeposits.requestKey, requestKey),
      ))
      .for('update')
      .limit(1)

    if (existing) {
      if (existing.amountUsd !== parsedUsd.formatted) return { status: 'idempotency_conflict' as const }
      return { status: 'ready' as const, deposit: existing, created: false }
    }

    const [balanceRow] = await transaction.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, account.profile.id),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]),
      ))
    const advertiserBalance = BigInt(balanceRow?.amount ?? '0')
    if (advertiserBalance + amountAtomic > maxSafeAtomic) return { status: 'balance_limit' as const }

    const [deposit] = await transaction.insert(advertiserDeposits).values({
      id: randomUUID(),
      userId: account.session.user.id,
      guestId: account.profile.id,
      provider: 'faucetpay',
      requestKey,
      amountUsd: parsedUsd.formatted,
      pepeUsdPrice: priceString,
      amountAtomic: Number(amountAtomic),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }).returning()

    return { status: 'ready' as const, deposit, created: true }
  })

  if (result.status === 'profile_missing') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
  if (result.status === 'idempotency_conflict') return NextResponse.json({ error: 'This request ID was already used for a different amount.' }, { status: 409, headers: noStoreHeaders })
  if (result.status === 'balance_limit') return NextResponse.json({ error: 'This payment would exceed the supported advertiser wallet balance.' }, { status: 409, headers: noStoreHeaders })

  const checkout = result.deposit.status === 'pending'
    ? buildCheckoutFields(result.deposit, request, merchantUsername)
    : null
  return NextResponse.json({
    deposit: serializeDeposit(result.deposit),
    checkout,
  }, { status: result.created ? 201 : 200, headers: noStoreHeaders })
}
