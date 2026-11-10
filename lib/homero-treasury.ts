import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles } from '@/lib/db/schema'
import { getPepeReserveAdminProfile } from '@/lib/pepe-reserve'
import { calculatePepeSwapFeeAtomic } from '@/lib/pepe-amount'

export const HOMERO_ATOMIC_PER_TOKEN = 100_000_000n
export const HOMERO_TREASURY_CAP = 10_000_000_000n
export const HOMERO_TREASURY_CAP_ATOMIC = HOMERO_TREASURY_CAP * HOMERO_ATOMIC_PER_TOKEN
export const HOMERO_TREASURY_SEED_SOURCE = 'homero_treasury_seed'
export const HOMERO_TREASURY_OUTGOING_SOURCE = 'homero_treasury_outgoing'
export const HOMERO_TREASURY_EVENT_SOURCES = [HOMERO_TREASURY_SEED_SOURCE, HOMERO_TREASURY_OUTGOING_SOURCE] as const
export const HOMERO_TREASURY_SEED_CHUNK_COUNT = 200
export const HOMERO_TREASURY_SEED_CHUNK_ATOMIC = Number(HOMERO_TREASURY_CAP_ATOMIC / BigInt(HOMERO_TREASURY_SEED_CHUNK_COUNT))
export const HOMERO_TREASURY_SEED_SOURCE_KEYS = Array.from(
  { length: HOMERO_TREASURY_SEED_CHUNK_COUNT },
  (_, index) => `initial-10b-homero-v1-${String(index + 1).padStart(3, '0')}`,
)

export const HOMERO_RATE_SCALE = 1_000_000_000_000n
export const HOMERO_SWAP_QUOTE_TTL_MS = 30_000

type HomeroTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type SignedHomeroQuote = {
  version: 1
  subject: string
  amountAtomic: string
  grossPepeAtomic: string
  feePepeAtomic: string
  netPepeAtomic: string
  distributedAtomic: string
  rateNumerator: string
  expiresAt: number
}

export type HomeroSwapQuote = {
  amountAtomic: string
  grossPepeAtomic: string
  feePepeAtomic: string
  pepeReceiveAtomic: string
  distributedAtomic: string
  pricePepePerHomero: number
  expiresAt: string
  quoteToken: string
}

export async function getHomeroTreasuryAdminProfile() {
  return getPepeReserveAdminProfile()
}

export async function lockHomeroTreasuryProfiles(transaction: HomeroTransaction, profileIds: string[]) {
  const uniqueProfileIds = [...new Set(profileIds)].sort()
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

  const distributedAtomic = BigInt(distributionRows[0]?.amount ?? '0')
  const remainingSupplyAtomic = distributedAtomic >= HOMERO_TREASURY_CAP_ATOMIC
    ? 0n
    : HOMERO_TREASURY_CAP_ATOMIC - distributedAtomic

  return {
    availableAtomic: balanceRows[0]?.amount ?? '0',
    distributedAtomic: distributedAtomic.toString(),
    remainingSupplyAtomic: remainingSupplyAtomic.toString(),
    initialReserveSeeded: seedRows.length === HOMERO_TREASURY_SEED_CHUNK_COUNT,
  }
}

export function getHomeroRateNumerator(_distributedAtomic: bigint) {
  return HOMERO_RATE_SCALE
}

export function getHomeroSpotRate(distributedAtomic: bigint) {
  return Number(getHomeroRateNumerator(distributedAtomic)) / Number(HOMERO_RATE_SCALE)
}

function getQuoteSigningKey() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to sign HOMERO swap quotes.')
  return createHmac('sha256', secret).update('homero-swap-quote-v1').digest()
}

function signQuotePayload(payload: string) {
  return createHmac('sha256', getQuoteSigningKey()).update(payload).digest('base64url')
}

export function createHomeroSwapQuote(amountAtomic: number, distributedAtomic: bigint, subject: string, now = Date.now()): HomeroSwapQuote | null {
  if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0 || !subject) return null

  const rateNumerator = getHomeroRateNumerator(distributedAtomic)
  const grossPepeAtomic = (BigInt(amountAtomic) * rateNumerator) / HOMERO_RATE_SCALE
  const feePepeAtomic = calculatePepeSwapFeeAtomic(grossPepeAtomic)
  const netPepeAtomic = grossPepeAtomic - feePepeAtomic
  if (grossPepeAtomic <= 0n || netPepeAtomic <= 0n || grossPepeAtomic > BigInt(Number.MAX_SAFE_INTEGER)) return null

  const expiresAt = now + HOMERO_SWAP_QUOTE_TTL_MS
  const payload: SignedHomeroQuote = {
    version: 1,
    subject,
    amountAtomic: String(amountAtomic),
    grossPepeAtomic: grossPepeAtomic.toString(),
    feePepeAtomic: feePepeAtomic.toString(),
    netPepeAtomic: netPepeAtomic.toString(),
    distributedAtomic: distributedAtomic.toString(),
    rateNumerator: rateNumerator.toString(),
    expiresAt,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return {
    amountAtomic: payload.amountAtomic,
    grossPepeAtomic: payload.grossPepeAtomic,
    feePepeAtomic: payload.feePepeAtomic,
    pepeReceiveAtomic: payload.netPepeAtomic,
    distributedAtomic: payload.distributedAtomic,
    pricePepePerHomero: Number(rateNumerator) / Number(HOMERO_RATE_SCALE),
    expiresAt: new Date(expiresAt).toISOString(),
    quoteToken: `${encodedPayload}.${signQuotePayload(encodedPayload)}`,
  }
}

export function verifyHomeroSwapQuote(token: unknown, subject: string): SignedHomeroQuote | null {
  if (typeof token !== 'string' || token.length > 2_048 || !subject) return null
  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra !== undefined) return null

  const expectedSignature = Buffer.from(signQuotePayload(encodedPayload), 'base64url')
  const suppliedSignature = Buffer.from(signature, 'base64url')
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SignedHomeroQuote>
    if (
      payload.version !== 1 ||
      payload.subject !== subject ||
      !Number.isSafeInteger(payload.expiresAt) ||
      ![payload.amountAtomic, payload.grossPepeAtomic, payload.feePepeAtomic, payload.netPepeAtomic, payload.distributedAtomic, payload.rateNumerator]
        .every((value) => typeof value === 'string' && /^\d+$/.test(value))
    ) return null

    const amountAtomic = BigInt(payload.amountAtomic as string)
    const grossPepeAtomic = BigInt(payload.grossPepeAtomic as string)
    const feePepeAtomic = BigInt(payload.feePepeAtomic as string)
    const netPepeAtomic = BigInt(payload.netPepeAtomic as string)
    if (
      amountAtomic <= 0n ||
      grossPepeAtomic <= 0n ||
      feePepeAtomic !== calculatePepeSwapFeeAtomic(grossPepeAtomic) ||
      netPepeAtomic !== grossPepeAtomic - feePepeAtomic
    ) return null

    return payload as SignedHomeroQuote
  } catch {
    return null
  }
}
