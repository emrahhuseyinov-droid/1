const DECIMAL_SCALE_DIGITS = 18
const DECIMAL_SCALE = 10n ** BigInt(DECIMAL_SCALE_DIGITS)
const ATOMIC_UNITS_PER_PEPE = 100_000_000n
const BASIS_POINTS = 10_000n
const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)

export const OFFERWALL_USER_SHARE_BPS = 8_000
export const OFFERWALL_PLATFORM_SHARE_BPS = 2_000
export const OFFERWALL_USER_SHARE_PERCENT = OFFERWALL_USER_SHARE_BPS / 100
export const OFFERWALL_PLATFORM_SHARE_PERCENT = OFFERWALL_PLATFORM_SHARE_BPS / 100

function parseScaledDecimal(value: string): bigint | null {
  if (value.length > 30 || !/^\d{1,6}(?:\.\d{1,18})?$/.test(value)) return null

  const [whole, fraction = ''] = value.split('.')
  const fractionScaled = BigInt(fraction.padEnd(DECIMAL_SCALE_DIGITS, '0') || '0')
  return BigInt(whole) * DECIMAL_SCALE + fractionScaled
}

function toFixedDecimal(value: bigint): string {
  const whole = value / DECIMAL_SCALE
  const fraction = (value % DECIMAL_SCALE).toString().padStart(DECIMAL_SCALE_DIGITS, '0')
  return `${whole}.${fraction}`
}

export function calculateOfferwallPayout(amountUsd: string, pepeUsdPrice: string) {
  const amountUsdScaled = parseScaledDecimal(amountUsd)
  const pepeUsdPriceScaled = parseScaledDecimal(pepeUsdPrice)

  if (amountUsdScaled === null || amountUsdScaled <= 0n || pepeUsdPriceScaled === null || pepeUsdPriceScaled <= 0n) {
    return null
  }

  const grossRewardAtomic = (amountUsdScaled * ATOMIC_UNITS_PER_PEPE) / pepeUsdPriceScaled
  const userRewardAtomic = (amountUsdScaled * BigInt(OFFERWALL_USER_SHARE_BPS) * ATOMIC_UNITS_PER_PEPE)
    / (pepeUsdPriceScaled * BASIS_POINTS)
  const platformRewardAtomic = grossRewardAtomic - userRewardAtomic
  const platformAmountUsdScaled = (amountUsdScaled * BigInt(OFFERWALL_PLATFORM_SHARE_BPS)) / BASIS_POINTS

  if (
    userRewardAtomic <= 0n ||
    userRewardAtomic > MAX_SAFE_ATOMIC ||
    platformRewardAtomic < 0n ||
    platformRewardAtomic > MAX_SAFE_ATOMIC
  ) {
    return null
  }

  return {
    amountUsd,
    pepeUsdPrice,
    platformAmountUsd: toFixedDecimal(platformAmountUsdScaled),
    userRewardAtomic,
    platformRewardAtomic,
  }
}
