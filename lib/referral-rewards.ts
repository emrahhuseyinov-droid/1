export type EarningSource = 'manual_claim' | 'shortlink' | 'view_ads'

export type EligibleReward = {
  source: Exclude<EarningSource, 'manual_claim'>
  itemId: string
  rewardAtomic: number
  timerSeconds: number
}

const MANUAL_CLAIM_REWARD_HOMERO = 50
const HOMERO_ATOMIC_UNITS = 100_000_000
const manualClaimRewardAtomic = MANUAL_CLAIM_REWARD_HOMERO * HOMERO_ATOMIC_UNITS
export const VIEW_ADS_TASK_REWARD = 80
export const VIEW_ADS_TASK_REWARD_ATOMIC = VIEW_ADS_TASK_REWARD * HOMERO_ATOMIC_UNITS

const eligibleRewards: Record<string, EligibleReward> = {
  'shortlink:shrinkearn': { source: 'shortlink', itemId: 'shrinkearn', rewardAtomic: 1_890_550, timerSeconds: 10 },
  'shortlink:clk': { source: 'shortlink', itemId: 'clk', rewardAtomic: 1_890_550, timerSeconds: 10 },
  'shortlink:fc': { source: 'shortlink', itemId: 'fc', rewardAtomic: 1_890_550, timerSeconds: 10 },
  'shortlink:linkrex': { source: 'shortlink', itemId: 'linkrex', rewardAtomic: 1_512_440, timerSeconds: 10 },
  'view_ads:window-btc': { source: 'view_ads', itemId: 'window-btc', rewardAtomic: 504_147, timerSeconds: 15 },
  'view_ads:window-earnings': { source: 'view_ads', itemId: 'window-earnings', rewardAtomic: 504_147, timerSeconds: 15 },
  'view_ads:window-eth': { source: 'view_ads', itemId: 'window-eth', rewardAtomic: 504_147, timerSeconds: 15 },
  'view_ads:window-shiba': { source: 'view_ads', itemId: 'window-shiba', rewardAtomic: 252_073, timerSeconds: 7 },
  'view_ads:window-xrp': { source: 'view_ads', itemId: 'window-xrp', rewardAtomic: 252_073, timerSeconds: 7 },
  'view_ads:window-wallet': { source: 'view_ads', itemId: 'window-wallet', rewardAtomic: 312_500, timerSeconds: 10 },
  'view_ads:surf-1': { source: 'view_ads', itemId: 'surf-1', rewardAtomic: 312_500, timerSeconds: 10 },
  'view_ads:pepe-casa-1': { source: 'view_ads', itemId: 'pepe-casa-1', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:partner-2': { source: 'view_ads', itemId: 'partner-2', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-3': { source: 'view_ads', itemId: 'pepe-casa-3', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:partner-4': { source: 'view_ads', itemId: 'partner-4', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-5': { source: 'view_ads', itemId: 'pepe-casa-5', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-6': { source: 'view_ads', itemId: 'pepe-casa-6', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-7': { source: 'view_ads', itemId: 'pepe-casa-7', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-8': { source: 'view_ads', itemId: 'pepe-casa-8', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-9': { source: 'view_ads', itemId: 'pepe-casa-9', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-10': { source: 'view_ads', itemId: 'pepe-casa-10', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-11': { source: 'view_ads', itemId: 'pepe-casa-11', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-12': { source: 'view_ads', itemId: 'pepe-casa-12', rewardAtomic: VIEW_ADS_TASK_REWARD_ATOMIC, timerSeconds: 30 },
  'view_ads:pepe-casa-13': { source: 'view_ads', itemId: 'pepe-casa-13', rewardAtomic: 5_000_000_000, timerSeconds: 30 },
  'view_ads:pepe-casa-14': { source: 'view_ads', itemId: 'pepe-casa-14', rewardAtomic: 5_000_000_000, timerSeconds: 30 },
  'view_ads:pepe-casa-15': { source: 'view_ads', itemId: 'pepe-casa-15', rewardAtomic: 5_000_000_000, timerSeconds: 30 },
}

export const VIEW_ADS_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const VIEW_ADS_REWARD_ITEM_IDS = [
  'pepe-casa-1',
  'partner-2',
  'pepe-casa-3',
  'partner-4',
  'pepe-casa-5',
  'pepe-casa-6',
  'pepe-casa-7',
  'pepe-casa-8',
  'pepe-casa-9',
  'pepe-casa-10',
  'pepe-casa-11',
  'pepe-casa-12',
] as const

const activeViewAdItemIds = new Set<string>(VIEW_ADS_REWARD_ITEM_IDS)

export function isActiveViewAdItemId(value: unknown): value is string {
  return typeof value === 'string' && activeViewAdItemIds.has(value)
}

export function getEligibleReward(source: string, itemId: string | null): EligibleReward | null {
  if (!itemId || (source !== 'shortlink' && source !== 'view_ads')) return null
  return eligibleRewards[`${source}:${itemId}`] ?? null
}

export function getManualClaimRewardAtomic() {
  return manualClaimRewardAtomic
}
