import 'server-only'
import { db } from '@/lib/db'
import { getHomeroRateNumerator, getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot } from '@/lib/homero-treasury'

const PEPE_ETHEREUM_ADDRESS = '0x6982508145454ce325ddbe47a25d4ec3d2311933'
const PEPE_PAIRS_URL = `https://api.dexscreener.com/token-pairs/v1/ethereum/${PEPE_ETHEREUM_ADDRESS}`

type JsonRecord = Record<string, unknown>

export type PepeMarketQuote = {
  pepeUsd: number
  homeroUsdReference: number
  homeroToPepeReferenceRate: number
  source: 'DEX Screener'
  network: 'Ethereum'
  updatedAt: string
  isStale: boolean
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function tokenAddress(value: unknown): string | null {
  if (!isRecord(value) || typeof value.address !== 'string') return null
  return value.address.toLowerCase()
}

function pairPriceUsd(pair: JsonRecord): number | null {
  if (pair.chainId !== 'ethereum') return null

  const baseAddress = tokenAddress(pair.baseToken)
  const quoteAddress = tokenAddress(pair.quoteToken)
  const basePriceUsd = positiveNumber(pair.priceUsd)

  if (baseAddress === PEPE_ETHEREUM_ADDRESS && basePriceUsd !== null) {
    return basePriceUsd
  }

  if (quoteAddress === PEPE_ETHEREUM_ADDRESS && basePriceUsd !== null) {
    const basePriceInQuoteToken = positiveNumber(pair.priceNative)
    return basePriceInQuoteToken === null ? null : basePriceUsd / basePriceInQuoteToken
  }

  return null
}

function pairLiquidityUsd(pair: JsonRecord): number {
  if (!isRecord(pair.liquidity)) return 0
  return positiveNumber(pair.liquidity.usd) ?? 0
}

const PEPE_PRICE_CACHE_TTL_MS = 60_000
const MAX_STALE_PRICE_AGE_MS = 10 * 60_000
const HOMERO_RATE_SCALE = 1_000_000_000_000

type CachedPepePrice = { pepeUsd: number; updatedAtMs: number }
let cachedPepePrice: CachedPepePrice | null = null
let refreshPepePrice: Promise<CachedPepePrice> | null = null

async function fetchPepePrice(): Promise<CachedPepePrice> {
  const response = await fetch(PEPE_PAIRS_URL, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7_000),
  })

  if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`)

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('DEX Screener returned an invalid pairs response')

  const candidates = payload
    .filter(isRecord)
    .map((pair) => ({ priceUsd: pairPriceUsd(pair), liquidityUsd: pairLiquidityUsd(pair) }))
    .filter((pair): pair is { priceUsd: number; liquidityUsd: number } => pair.priceUsd !== null && pair.liquidityUsd > 0)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)

  const bestPair = candidates[0]
  if (!bestPair) throw new Error('No liquid PEPE/USD pair was returned')
  return { pepeUsd: bestPair.priceUsd, updatedAtMs: Date.now() }
}

async function getCachedPepePrice() {
  const now = Date.now()
  if (cachedPepePrice && now - cachedPepePrice.updatedAtMs < PEPE_PRICE_CACHE_TTL_MS) {
    return { ...cachedPepePrice, isStale: false }
  }

  try {
    refreshPepePrice ??= fetchPepePrice()
    cachedPepePrice = await refreshPepePrice
    return { ...cachedPepePrice, isStale: false }
  } catch (error) {
    if (!cachedPepePrice || now - cachedPepePrice.updatedAtMs > MAX_STALE_PRICE_AGE_MS) throw error
    return { ...cachedPepePrice, isStale: true }
  } finally {
    refreshPepePrice = null
  }
}

export async function getPepeMarketQuote(): Promise<PepeMarketQuote> {
  const [pepePrice, adminProfile] = await Promise.all([
    getCachedPepePrice(),
    getHomeroTreasuryAdminProfile(),
  ])

  let rate = 0.2
  let internalRateUnavailable = false
  if (adminProfile) {
    try {
      const treasury = await db.transaction((transaction) => getHomeroTreasurySnapshot(transaction, adminProfile.id))
      const distributedAtomic = BigInt(treasury.distributedAtomic)
      rate = Number(getHomeroRateNumerator(distributedAtomic)) / HOMERO_RATE_SCALE
    } catch {
      internalRateUnavailable = true
    }
  }

  return {
    pepeUsd: pepePrice.pepeUsd,
    homeroUsdReference: pepePrice.pepeUsd * rate,
    homeroToPepeReferenceRate: rate,
    source: 'DEX Screener',
    network: 'Ethereum',
    updatedAt: new Date(pepePrice.updatedAtMs).toISOString(),
    isStale: pepePrice.isStale || internalRateUnavailable,
  }
}
