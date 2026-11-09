export const HOMERO_TO_PEPE_REFERENCE_RATE = 1
export const MARKET_PRICE_REFRESH_INTERVAL_MS = 60_000

export const walletAssets = [
  { symbol: 'HOMERO', name: 'Homero' },
  { symbol: 'PEPE', name: 'Pepe Coin' },
] as const

export type WalletCoinSymbol = (typeof walletAssets)[number]['symbol']
export type WalletBalancesAtomic = Record<WalletCoinSymbol, number>
