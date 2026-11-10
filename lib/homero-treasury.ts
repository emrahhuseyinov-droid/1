import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { getPepeReserveAdminProfile } from '@/lib/pepe-reserve'

export const HOMERO_ATOMIC_PER_TOKEN = 100_000_000n
export const HOMERO_TREASURY_CAP = 10_000_000_000n
export const HOMERO_TREASURY_CAP_ATOMIC = HOMERO_TREASURY_CAP * HOMERO_ATOMIC_PER_TOKEN
export const HOMERO_TREASURY_SEED_SOURCE = 'homero_treasury_seed'
export const HOMERO_TREASURY_OUTGOING_SOURCE = 'homero_treasury_outgoing'
export const HOMERO_AMM_POOL_SOURCE = 'homero_amm_pool'
export const HOMERO_TREASURY_EVENT_SOURCES = [HOMERO_TREASURY_SEED_SOURCE, HOMERO_TREASURY_OUTGOING_SOURCE] as const
export const HOMERO_AMM_EVENT_SOURCES = [HOMERO_AMM_POOL_SOURCE] as const
export const HOMERO_TREASURY_SEED_CHUNK_COUNT = 200
export const HOMERO_TREASURY_SEED_CHUNK_ATOMIC = Number(HOMERO_TREASURY_CAP_ATOMIC / BigInt(HOMERO_TREASURY_SEED_CHUNK_COUNT))
export const HOMERO_TREASURY_SEED_SOURCE_KEYS = Array.from(
  { length: HOMERO_TREASURY_SEED_CHUNK_COUNT },
  (_, index) => `initial-10b-homero-v1-${String(index + 1).padStart(3, '0')}`,
)

type HomeroTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function getHomeroTreasuryAdminProfile() {
  return getPepeReserveAdminProfile()
}

export async function lockHomeroTreasuryProfiles(transaction: HomeroTransaction, profileIds: string[]) {
  const uniqueProfileIds = [...new Set(profileIds)].sort()
  if (uniqueProfileIds.length === 0) return

  const lockedProfiles = await transaction
    .select({ id: guestProfiles.id })
    .from(guestProfiles)
    .where(inArray(guestProfiles.id, uniqueProfileIds))
    .orderBy(asc(guestProfiles.id))
    .for('update')

  if (lockedProfiles.length !== uniqueProfileIds.length) {
    throw new Error('Could not lock all HOMERO treasury profiles.')
  }
}

export async function recordHomeroTreasuryTransfer(
  transaction: HomeroTransaction,
  adminProfileId: string,
  recipientProfileId: string,
  amountAtomic: number,
  sourceKey: string,
  recipientSource: string,
  itemId: string,
  now = new Date(),
) {
  if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0) {
    throw new Error('HOMERO treasury transfers require a positive safe atomic amount.')
  }

  await transaction.insert(earningEvents).values([
    {
      id: randomUUID(),
      guestId: adminProfileId,
      source: HOMERO_TREASURY_OUTGOING_SOURCE,
      sourceKey,
      itemId,
      tokenSymbol: 'HOMERO',
      rewardAtomic: -amountAtomic,
      createdAt: now,
    },
    {
      id: randomUUID(),
      guestId: recipientProfileId,
      source: recipientSource,
      sourceKey,
      itemId,
      tokenSymbol: 'HOMERO',
      rewardAtomic: amountAtomic,
      createdAt: now,
    },
  ])
}

export async function getHomeroTreasurySnapshot(transaction: HomeroTransaction, adminProfileId: string) {
  const [balanceRows, distributionRows, seedRows] = await Promise.all([
    transaction.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        eq(earningEvents.tokenSymbol, 'HOMERO'),
        inArray(earningEvents.source, [...HOMERO_TREASURY_EVENT_SOURCES]),
      )),
    transaction.select({ amount: sql<string>`coalesce(sum(-${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        eq(earningEvents.tokenSymbol, 'HOMERO'),
        eq(earningEvents.source, HOMERO_TREASURY_OUTGOING_SOURCE),
      )),
    transaction.select({ sourceKey: earningEvents.sourceKey })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        eq(earningEvents.tokenSymbol, 'HOMERO'),
        eq(earningEvents.source, HOMERO_TREASURY_SEED_SOURCE),
        inArray(earningEvents.sourceKey, HOMERO_TREASURY_SEED_SOURCE_KEYS),
      )),
  ])

  const distributedAmount = BigInt(distributionRows[0]?.amount ?? '0')
  const distributedAtomic = distributedAmount > 0n ? distributedAmount : 0n
  return {
    availableAtomic: balanceRows[0]?.amount ?? '0',
    distributedAtomic: distributedAtomic.toString(),
    remainingSupplyAtomic: distributedAtomic >= HOMERO_TREASURY_CAP_ATOMIC
      ? '0'
      : (HOMERO_TREASURY_CAP_ATOMIC - distributedAtomic).toString(),
    initialReserveSeeded: seedRows.length === HOMERO_TREASURY_SEED_CHUNK_COUNT,
  }
}
