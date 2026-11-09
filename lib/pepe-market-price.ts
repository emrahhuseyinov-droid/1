import 'server-only'
import { HOMERO_TO_PEPE_REFERENCE_RATE } from '@/lib/wallet-assets'

const PEPE_ETHEREUM_ADDRESS = '0x6982508145454ce325ddbe47a25d4ec3d2311933'
const PEPE_PAIRS_URL = `https://api.dexscreener.com/token-pairs/v1/ethereum/${PEPE_ETHEREUM_ADDRESS}`

type JsonRecord = Record<string, unknown>

export type PepeMarketQuote = {
  pepeUsd: number
  homeroUsdReference: number
  homeroToPepeReferenceRate: number
  source: 'DEX Screener'
  network: 'Ethereum'
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

export async function getPepeMarketQuote(): Promise<PepeMarketQuote> {
  const response = await fetch(PEPE_PAIRS_URL, {
    headers: { accept: 'application/json' },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(7_000),
  })

  if (!response.ok) {
    throw new Error(`DEX Screener returned ${response.status}`)
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('DEX Screener returned an invalid pairs response')
  }

  const candidates = payload
    .filter(isRecord)
    .map((pair) => ({ priceUsd: pairPriceUsd(pair), liquidityUsd: pairLiquidityUsd(pair) }))
    .filter((pair): pair is { priceUsd: number; liquidityUsd: number } => pair.priceUsd !== null && pair.liquidityUsd > 0)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)

  const bestPair = candidates[0]
  if (!bestPair) {
    throw new Error('No liquid PEPE/USD pair was returned')
  }

  return {
    pepeUsd: bestPair.priceUsd,
    homeroUsdReference: bestPair.priceUsd * HOMERO_TO_PEPE_REFERENCE_RATE,
    homeroToPepeReferenceRate: HOMERO_TO_PEPE_REFERENCE_RATE,
    source: 'DEX Screener',
    network: 'Ethereum',
  }
}
