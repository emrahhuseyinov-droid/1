const DECIMAL_SCALE_DIGITS = 18
const DECIMAL_SCALE = 10n ** BigInt(DECIMAL_SCALE_DIGITS)
const POINTS_SCALE = 100_000_000n
const POINTS_TO_USD_SCALE = 10_000_000n
const BASIS_POINTS_SCALE = 10_000n
const ATOMIC_UNITS_PER_PEPE = 100_000_000n
export const OFFERWALL_ME_EARNER_SHARE_PERCENT = 40
const MAX_SAFE_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER)

function parseScaledUsd(value: string): bigint | null {
  if (value.length > 30 || !/^\d{1,6}(?:\.\d{1,18})?$/.test(value)) return null

  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(DECIMAL_SCALE_DIGITS, '0') || '0')
}

function formatScaledUsd(value: bigint) {
  const whole = value / DECIMAL_SCALE
  const fraction = (value % DECIMAL_SCALE).toString().padStart(DECIMAL_SCALE_DIGITS, '0')
  return `${whole}.${fraction}`
}

export function offerwallPointsToUsd(points: string): string | null {
  if (!/^\d{1,14}(?:\.\d{1,8})?$/.test(points)) return null

  const [whole, fraction = ''] = points.split('.')
  const pointsScaled = BigInt(whole) * POINTS_SCALE + BigInt(fraction.padEnd(8, '0') || '0')
  if (pointsScaled <= 0n) return null

  const usdScaled = pointsScaled * POINTS_TO_USD_SCALE
  if (usdScaled / DECIMAL_SCALE > 999_999n) return null
  return formatScaledUsd(usdScaled)
}

export function normalizeOfferwallUsd(value: string): string | null {
  const usdScaled = parseScaledUsd(value)
  if (usdScaled === null || usdScaled <= 0n) return null
  return formatScaledUsd(usdScaled)
}

export function applyOfferwallMeEarnerShare(amountUsd: string): string | null {
  const usdScaled = parseScaledUsd(amountUsd)
  if (usdScaled === null || usdScaled <= 0n) return null

  const earnerUsdScaled = (usdScaled * BigInt(OFFERWALL_ME_EARNER_SHARE_PERCENT * 100)) / BASIS_POINTS_SCALE
  if (earnerUsdScaled <= 0n) return null
  return formatScaledUsd(earnerUsdScaled)
}

export function calculateOfferwallMeRewardAtomic(amountUsd: string, pepeUsdPrice: string): number | null {
  const amountUsdScaled = parseScaledUsd(amountUsd)
  const pepeUsdPriceScaled = parseScaledUsd(pepeUsdPrice)
  if (amountUsdScaled === null || amountUsdScaled <= 0n || pepeUsdPriceScaled === null || pepeUsdPriceScaled <= 0n) {
    return null
  }

  const rewardAtomic = (amountUsdScaled * ATOMIC_UNITS_PER_PEPE) / pepeUsdPriceScaled
  if (rewardAtomic <= 0n || rewardAtomic > MAX_SAFE_ATOMIC) return null
  return Number(rewardAtomic)
}
