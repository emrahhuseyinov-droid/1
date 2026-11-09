import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { ADVERTISER_WALLET_EVENT_SOURCES, ADVERTISER_WALLET_TRANSFER_IN_SOURCE, ADVERTISER_WALLET_TRANSFER_OUT_SOURCE } from '@/lib/advertiser-wallet'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import { PEPE_RESERVE_EVENT_SOURCES } from '@/lib/pepe-reserve'
import { isTrustedRequestOrigin } from '@/lib/request-origin'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const publisherExcludedSources = [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES]

async function getBalances(guestId: string) {
  const [publisherRows, advertiserRows, activityRows] = await Promise.all([
    db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        notInArray(earningEvents.source, publisherExcludedSources),
      )),
    db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]),
      )),
    db.select({ id: earningEvents.id, source: earningEvents.source, amountAtomic: earningEvents.rewardAtomic, createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]),
      ))
      .orderBy(desc(earningEvents.createdAt))
      .limit(12),
  ])

  return {
    publisherBalanceAtomic: publisherRows[0]?.amount ?? '0',
    advertiserBalanceAtomic: advertiserRows[0]?.amount ?? '0',
    activity: activityRows.map((row) => ({
      id: row.id,
      source: row.source,
      amountAtomic: String(row.amountAtomic),
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const balances = await getBalances(account.profile.id)
    return NextResponse.json(balances, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-wallet] Could not load wallet balances:', error)
    return NextResponse.json({ error: 'Could not load wallet balances.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStoreHeaders })

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })
  const limited = await enforceApiRateLimit('advertiser-wallet-transfer', account.session.user.id, { windowSeconds: 60, max: 20 })
  if (limited) return limited

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Enter valid transfer details.' }, { status: 400, headers: noStoreHeaders })
  }

  const input = body as Record<string, unknown>
  const amountAtomic = parsePepeAmountToAtomic(input.amount)
  const transferId = typeof input.transferId === 'string' && uuidPattern.test(input.transferId)
    ? input.transferId.toLowerCase()
    : null

  if (amountAtomic === null || !transferId) {
    return NextResponse.json({ error: 'Enter a valid PEPE amount and try again.' }, { status: 400, headers: noStoreHeaders })
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const [lockedProfile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, account.profile.id))
        .for('update')
        .limit(1)
      if (!lockedProfile) return { status: 'profile_missing' as const }

      const [existingOut] = await transaction
        .select({ amount: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, ADVERTISER_WALLET_TRANSFER_OUT_SOURCE),
          eq(earningEvents.sourceKey, transferId),
        ))
        .limit(1)
      const [existingIn] = await transaction
        .select({ amount: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.source, ADVERTISER_WALLET_TRANSFER_IN_SOURCE),
          eq(earningEvents.sourceKey, transferId),
        ))
        .limit(1)

      if (existingOut || existingIn) {
        if (!existingOut || !existingIn) return { status: 'ledger_inconsistent' as const }
        if (existingOut.amount !== -amountAtomic || existingIn.amount !== amountAtomic) return { status: 'idempotency_conflict' as const }
        return { status: 'completed' as const, alreadyProcessed: true }
      }

      const [publisherRow] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          notInArray(earningEvents.source, publisherExcludedSources),
        ))
      const [advertiserRow] = await transaction
        .select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          eq(earningEvents.tokenSymbol, 'PEPE'),
          inArray(earningEvents.source, [...ADVERTISER_WALLET_EVENT_SOURCES]),
        ))

      const publisherBalance = BigInt(publisherRow?.amount ?? '0')
      const advertiserBalance = BigInt(advertiserRow?.amount ?? '0')
      if (publisherBalance < BigInt(amountAtomic)) {
        return { status: 'insufficient_balance' as const, publisherBalanceAtomic: publisherBalance.toString() }
      }
      if (advertiserBalance + BigInt(amountAtomic) > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { status: 'balance_limit' as const }
      }

      const now = new Date()
      await transaction.insert(earningEvents).values([
        {
          id: randomUUID(),
          guestId: account.profile.id,
          source: ADVERTISER_WALLET_TRANSFER_OUT_SOURCE,
          sourceKey: transferId,
          itemId: 'Publisher to advertiser wallet',
          tokenSymbol: 'PEPE',
          rewardAtomic: -amountAtomic,
          createdAt: now,
        },
        {
          id: randomUUID(),
          guestId: account.profile.id,
          source: ADVERTISER_WALLET_TRANSFER_IN_SOURCE,
          sourceKey: transferId,
          itemId: 'Publisher to advertiser wallet',
          tokenSymbol: 'PEPE',
          rewardAtomic: amountAtomic,
          createdAt: now,
        },
      ])

      return { status: 'completed' as const, alreadyProcessed: false }
    })

    if (result.status === 'profile_missing') return NextResponse.json({ error: 'Account profile not found.' }, { status: 404, headers: noStoreHeaders })
    if (result.status === 'insufficient_balance') {
      return NextResponse.json({ error: 'Your Publisher PEPE balance is too low for this transfer.', code: 'insufficient_pepe', publisherBalanceAtomic: result.publisherBalanceAtomic }, { status: 409, headers: noStoreHeaders })
    }
    if (result.status === 'balance_limit') return NextResponse.json({ error: 'The Advertiser balance would exceed the internal ledger limit.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'idempotency_conflict') return NextResponse.json({ error: 'This transfer ID was already used for a different amount.' }, { status: 409, headers: noStoreHeaders })
    if (result.status === 'ledger_inconsistent') return NextResponse.json({ error: 'The transfer could not be confirmed. Contact support before retrying.' }, { status: 500, headers: noStoreHeaders })

    const balances = await getBalances(account.profile.id)
    return NextResponse.json({ ...balances, alreadyProcessed: result.alreadyProcessed }, { status: result.alreadyProcessed ? 200 : 201, headers: noStoreHeaders })
  } catch (error) {
    console.error('[advertiser-wallet] Could not transfer PEPE:', error)
    return NextResponse.json({ error: 'Could not transfer PEPE. Please retry the same request.' }, { status: 500, headers: noStoreHeaders })
  }
}
