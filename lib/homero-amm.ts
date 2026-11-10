import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents } from '@/lib/db/schema'
import { calculatePepeSwapFeeAtomic } from '@/lib/pepe-amount'
import { PEPE_AMM_POOL_SOURCE } from '@/lib/pepe-reserve'
import {
  getHomeroTreasurySnapshot,
  HOMERO_AMM_POOL_SOURCE,
  HOMERO_TREASURY_CAP_ATOMIC,
  recordHomeroTreasuryTransfer,
} from '@/lib/homero-treasury'

export const HOMERO_AMM_PEPE_SEED_ATOMIC = 10_000_000_000_000_000n
export const HOMERO_AMM_HOMERO_SEED_ATOMIC = 50_000_000_000_000_000n
export const HOMERO_AMM_PEPE_SEED_CHUNKS_ATOMIC = [5_000_000_000_000_000, 5_000_000_000_000_000] as const
export const HOMERO_AMM_HOMERO_SEED_CHUNK_ATOMIC = 5_000_000_000_000_000
export const HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS = Array.from(
  { length: Number(HOMERO_AMM_HOMERO_SEED_ATOMIC / BigInt(HOMERO_AMM_HOMERO_SEED_CHUNK_ATOMIC)) },
  (_, index) => `initial-homero-amm-homero-${String(index + 1).padStart(3, '0')}`,
)
export const HOMERO_AMM_PEPE_SEED_SOURCE_KEYS = HOMERO_AMM_PEPE_SEED_CHUNKS_ATOMIC.map(
  (_, index) => `initial-homero-amm-pepe-${String(index + 1).padStart(3, '0')}`,
)
export const HOMERO_AMM_EVENT_SOURCES = [HOMERO_AMM_POOL_SOURCE] as const
export const HOMERO_AMM_QUOTE_TTL_MS = 30_000
export const HOMERO_AMM_FEE_PERCENT = 1
export const HOMERO_AMM_FEE_BASIS_POINTS = 100n
export const HOMERO_AMM_BASIS_POINTS_SCALE = 10_000n

const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)
const HOMERO_AMM_EXPECTED_SEED_EVENT_COUNT = HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS.length + HOMERO_AMM_PEPE_SEED_SOURCE_KEYS.length

type HomeroAmmTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type HomeroAmmDirection = 'HOMERO_TO_PEPE' | 'PEPE_TO_HOMERO'

export type HomeroAmmSnapshot = {
  homeroReserveAtomic: string
  pepeReserveAtomic: string
  homeroToPepeRate: number
  seeded: boolean
}

type SignedHomeroAmmQuote = {
  version: 1
  subject: string
  direction: HomeroAmmDirection
  amountAtomic: string
  grossOutputAtomic: string
  feePepeAtomic: string
  netOutputAtomic: string
  homeroReserveAtomic: string
  pepeReserveAtomic: string
  expiresAt: number
}

export type HomeroAmmQuote = {
  direction: HomeroAmmDirection
  amountAtomic: string
  grossOutputAtomic: string
  feePepeAtomic: string
  netOutputAtomic: string
  homeroReserveAtomic: string
  pepeReserveAtomic: string
  homeroToPepeRate: number
  expiresAt: string
  quoteToken: string
}

export class HomeroAmmUnavailableError extends Error {
  constructor(message = 'The HOMERO exchange pool is not initialized or available.') {
    super(message)
    this.name = 'HomeroAmmUnavailableError'
  }
}

export class HomeroTreasuryInsufficientError extends Error {
  constructor(message = 'The HOMERO treasury cannot fund this reward.') {
    super(message)
    this.name = 'HomeroTreasuryInsufficientError'
  }
}

function getQuoteSigningKey() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to sign HOMERO AMM quotes.')
  return createHmac('sha256', secret).update('homero-amm-quote-v1').digest()
}

function signQuotePayload(payload: string) {
  return createHmac('sha256', getQuoteSigningKey()).update(payload).digest('base64url')
}

export async function getHomeroAmmSnapshot(transaction: HomeroAmmTransaction, adminProfileId: string): Promise<HomeroAmmSnapshot> {
  const [homeroRows, pepeRows, seedRows] = await Promise.all([
    transaction.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        eq(earningEvents.tokenSymbol, 'HOMERO'),
        eq(earningEvents.source, HOMERO_AMM_POOL_SOURCE),
      )),
    transaction.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        eq(earningEvents.source, PEPE_AMM_POOL_SOURCE),
      )),
    transaction.select({ sourceKey: earningEvents.sourceKey, rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, adminProfileId),
        inArray(earningEvents.source, [HOMERO_AMM_POOL_SOURCE, PEPE_AMM_POOL_SOURCE]),
        inArray(earningEvents.sourceKey, [...HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS, ...HOMERO_AMM_PEPE_SEED_SOURCE_KEYS]),
      )),
  ])

  const homeroReserve = BigInt(homeroRows[0]?.amount ?? '0')
  const pepeReserve = BigInt(pepeRows[0]?.amount ?? '0')
  const seededHomero = seedRows.filter((row) => row.tokenSymbol === 'HOMERO')
  const seededPepe = seedRows.filter((row) => row.tokenSymbol === 'PEPE')
  const seeded = seededHomero.length === HOMERO_AMM_HOMERO_SEED_SOURCE_KEYS.length
    && seededPepe.length === HOMERO_AMM_PEPE_SEED_SOURCE_KEYS.length
    && seededHomero.reduce((sum, row) => sum + BigInt(row.rewardAtomic), 0n) === BigInt(HOMERO_AMM_HOMERO_SEED_ATOMIC)
    && seededPepe.reduce((sum, row) => sum + BigInt(row.rewardAtomic), 0n) === BigInt(HOMERO_AMM_PEPE_SEED_ATOMIC)

  return {
    homeroReserveAtomic: homeroReserve.toString(),
    pepeReserveAtomic: pepeReserve.toString(),
    homeroToPepeRate: homeroReserve > 0n ? Number(pepeReserve) / Number(homeroReserve) : 0,
    seeded,
  }
}

export function calculateHomeroAmmSwap(
  direction: HomeroAmmDirection,
  amountAtomic: number,
  homeroReserveAtomic: bigint,
  pepeReserveAtomic: bigint,
) {
  if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0 || homeroReserveAtomic <= 0n || pepeReserveAtomic <= 0n) return null

  const amount = BigInt(amountAtomic)
  let grossOutput: bigint
  let feePepe: bigint
  let netOutput: bigint

  if (direction === 'HOMERO_TO_PEPE') {
    grossOutput = pepeReserveAtomic * amount / (homeroReserveAtomic + amount)
    feePepe = calculatePepeSwapFeeAtomic(grossOutput)
    netOutput = grossOutput - feePepe
  } else {
    feePepe = calculatePepeSwapFeeAtomic(amount)
    const effectivePepeInput = amount - feePepe
    if (effectivePepeInput <= 0n) return null
    grossOutput = homeroReserveAtomic * effectivePepeInput / (pepeReserveAtomic + effectivePepeInput)
    netOutput = grossOutput
  }

  if (grossOutput <= 0n || netOutput <= 0n || [grossOutput, feePepe, netOutput].some((value) => value > MAX_SAFE_ATOMIC)) return null
  return { grossOutputAtomic: grossOutput, feePepeAtomic: feePepe, netOutputAtomic: netOutput }
}

export function createHomeroAmmQuote(
  direction: HomeroAmmDirection,
  amountAtomic: number,
  snapshot: HomeroAmmSnapshot,
  subject: string,
  now = Date.now(),
): HomeroAmmQuote | null {
  if (!snapshot.seeded || !subject || !Number.isSafeInteger(amountAtomic) || amountAtomic <= 0) return null
  const homeroReserve = BigInt(snapshot.homeroReserveAtomic)
  const pepeReserve = BigInt(snapshot.pepeReserveAtomic)
  const swap = calculateHomeroAmmSwap(direction, amountAtomic, homeroReserve, pepeReserve)
  if (!swap) return null

  const expiresAt = now + HOMERO_AMM_QUOTE_TTL_MS
  const payload: SignedHomeroAmmQuote = {
    version: 1,
    subject,
    direction,
    amountAtomic: String(amountAtomic),
    grossOutputAtomic: swap.grossOutputAtomic.toString(),
    feePepeAtomic: swap.feePepeAtomic.toString(),
    netOutputAtomic: swap.netOutputAtomic.toString(),
    homeroReserveAtomic: homeroReserve.toString(),
    pepeReserveAtomic: pepeReserve.toString(),
    expiresAt,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return {
    direction,
    amountAtomic: payload.amountAtomic,
    grossOutputAtomic: payload.grossOutputAtomic,
    feePepeAtomic: payload.feePepeAtomic,
    netOutputAtomic: payload.netOutputAtomic,
    homeroReserveAtomic: payload.homeroReserveAtomic,
    pepeReserveAtomic: payload.pepeReserveAtomic,
    homeroToPepeRate: snapshot.homeroToPepeRate,
    expiresAt: new Date(expiresAt).toISOString(),
    quoteToken: `${encodedPayload}.${signQuotePayload(encodedPayload)}`,
  }
}

export function verifyHomeroAmmQuote(token: unknown, subject: string): SignedHomeroAmmQuote | null {
  if (typeof token !== 'string' || token.length > 2_048 || !subject) return null
  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra !== undefined) return null

  const expectedSignature = Buffer.from(signQuotePayload(encodedPayload), 'base64url')
  const suppliedSignature = Buffer.from(signature, 'base64url')
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SignedHomeroAmmQuote>
    if (
      payload.version !== 1 ||
      payload.subject !== subject ||
      (payload.direction !== 'HOMERO_TO_PEPE' && payload.direction !== 'PEPE_TO_HOMERO') ||
      !Number.isSafeInteger(payload.expiresAt) ||
      ![payload.amountAtomic, payload.grossOutputAtomic, payload.feePepeAtomic, payload.netOutputAtomic, payload.homeroReserveAtomic, payload.pepeReserveAtomic]
        .every((value) => typeof value === 'string' && /^\d+$/.test(value))
    ) return null

    const amount = BigInt(payload.amountAtomic as string)
    const grossOutput = BigInt(payload.grossOutputAtomic as string)
    const feePepe = BigInt(payload.feePepeAtomic as string)
    const netOutput = BigInt(payload.netOutputAtomic as string)
    const homeroReserve = BigInt(payload.homeroReserveAtomic as string)
    const pepeReserve = BigInt(payload.pepeReserveAtomic as string)
    if (
      amount <= 0n || amount > MAX_SAFE_ATOMIC || grossOutput <= 0n || grossOutput > MAX_SAFE_ATOMIC ||
      feePepe < 0n || feePepe > MAX_SAFE_ATOMIC || netOutput <= 0n || netOutput > MAX_SAFE_ATOMIC ||
      homeroReserve <= 0n || pepeReserve <= 0n
    ) return null

    return payload as SignedHomeroAmmQuote
  } catch {
    return null
  }
}

export function convertPepeAtomicToHomeroAtomic(pepeAtomic: number | bigint, snapshot: HomeroAmmSnapshot) {
  const pepeAmount = BigInt(pepeAtomic)
  const homeroReserve = BigInt(snapshot.homeroReserveAtomic)
  const pepeReserve = BigInt(snapshot.pepeReserveAtomic)
  if (!snapshot.seeded || pepeAmount <= 0n || homeroReserve <= 0n || pepeReserve <= 0n) {
    throw new HomeroAmmUnavailableError()
  }

  const homeroAtomic = pepeAmount * homeroReserve / pepeReserve
  if (homeroAtomic <= 0n || homeroAtomic > MAX_SAFE_ATOMIC) throw new HomeroAmmUnavailableError('The HOMERO reward quote is outside supported limits.')
  return Number(homeroAtomic)
}

export async function issueHomeroRewardForPepe(
  transaction: HomeroAmmTransaction,
  input: {
    adminProfileId: string
    recipientProfileId: string
    pepeEquivalentAtomic: number | bigint
    sourceKey: string
    recipientSource: string
    itemId: string
    now?: Date
  },
) {
  const pool = await getHomeroAmmSnapshot(transaction, input.adminProfileId)
  const rewardAtomic = convertPepeAtomicToHomeroAtomic(input.pepeEquivalentAtomic, pool)
  const treasury = await getHomeroTreasurySnapshot(transaction, input.adminProfileId)
  if (
    BigInt(treasury.availableAtomic) < BigInt(rewardAtomic) ||
    BigInt(treasury.remainingSupplyAtomic) < BigInt(rewardAtomic)
  ) {
    throw new HomeroTreasuryInsufficientError()
  }

  await recordHomeroTreasuryTransfer(
    transaction,
    input.adminProfileId,
    input.recipientProfileId,
    rewardAtomic,
    input.sourceKey,
    input.recipientSource,
    input.itemId,
    input.now,
  )
  return { rewardAtomic, pepeEquivalentAtomic: String(input.pepeEquivalentAtomic), homeroToPepeRate: pool.homeroToPepeRate }
}
