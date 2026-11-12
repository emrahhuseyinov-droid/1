import 'server-only'

import { getFreshPepeUsdPrice } from '@/lib/pepe-market-price'

const MANUAL_FAUCET_USD_REWARD = 0.00004449
const PEPE_ATOMIC_UNITS = 100_000_000

export async function getManualFaucetRewardAtomic() {
  const pepeUsd = await getFreshPepeUsdPrice()
  const rewardAtomic = Math.round((MANUAL_FAUCET_USD_REWARD / pepeUsd) * PEPE_ATOMIC_UNITS)

  if (!Number.isSafeInteger(rewardAtomic) || rewardAtomic <= 0) {
    throw new Error('The current faucet reward is outside the supported range.')
  }

  return rewardAtomic
}
