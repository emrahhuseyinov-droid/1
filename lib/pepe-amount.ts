const ATOMIC_UNITS_PER_PEPE = 100_000_000n
const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)
const PEPE_SWAP_FEE_BASIS_POINTS = 100n
const BASIS_POINTS_DENOMINATOR = 10_000n

export const PEPE_SWAP_FEE_PERCENT = 1

export function calculatePepeSwapFeeAtomic(amountAtomic: number | bigint) {
  return (BigInt(amountAtomic) * PEPE_SWAP_FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR
}

export const CAMPAIGN_REWARD_HOMERO_ATOMIC = 15_000_000_000
export const CAMPAIGN_REWARD_HOMERO = 150
export const CAMPAIGN_DURATION_SECONDS = 30
export const CAMPAIGN_COMMISSION_ATOMIC = 2_500_000_000
export const CAMPAIGN_COMMISSION_PEPE = 25
export const CAMPAIGN_PROMOTION_FEE_ATOMIC = 100_000_000_000
export const CAMPAIGN_PROMOTION_FEE_PEPE = 1_000
export const CAMPAIGN_PROMOTION_DURATION_HOURS = 24

export function parsePepeAmountToAtomic(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const input = String(value).trim()
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(input)
  if (!match) return null

  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(8, '0') || '0')
  const atomic = whole * ATOMIC_UNITS_PER_PEPE + fraction
  if (atomic <= 0n || atomic > MAX_SAFE_ATOMIC) return null

  return Number(atomic)
}

export function formatTokenAtomic(value: number | string) {
  const atomic = BigInt(value)
  const negative = atomic < 0n
  const absolute = negative ? -atomic : atomic
  const whole = absolute / ATOMIC_UNITS_PER_PEPE
  const fraction = (absolute % ATOMIC_UNITS_PER_PEPE).toString().padStart(8, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function formatPepeAtomic(value: number | string) {
  return formatTokenAtomic(value)
}
