import type { WalletBalancesAtomic, WalletCoinSymbol } from '@/lib/wallet-assets'

export type DashboardActivity = {
  id: string
  title: string
  createdAt: string
  amountAtomic: number
  tokenSymbol: WalletCoinSymbol
  kind: 'earning' | 'commission' | 'swap'
}

export type DashboardOverview = {
  balanceAtomic: number
  balancesAtomic: WalletBalancesAtomic
  dailyBonus: {
    streak: number
    claimedToday: boolean
  }
  recentActivity: DashboardActivity[]
}
