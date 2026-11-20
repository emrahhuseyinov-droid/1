export type VerseTab = 'home' | 'tasks' | 'shop' | 'board' | 'powerups' | 'admin'

export type PepeVerseTask = {
  code: string
  title: string
  description: string
  href: string
  progress: number
  target: number
  reward: number
  claimed: boolean
}

export type PepeVerseState = {
  enabled: boolean
  balanceAtomic: string
  profile: {
    xp: number
    level: number
    coins: number
    energy: number
    stamina: number
    streak: number
    achievements: string[]
    skins: string[]
    equippedSkin: string
  }
  daily: {
    day: string
    canClaim: boolean
    streak: number
    nextDay: number
    rewards: number[]
    claimedDays: boolean[]
  }
  tasks: PepeVerseTask[]
  skins: { id: string; name: string; cost: number; color: string; owned: boolean; equipped: boolean }[]
  achievements: { id: string; title: string; description: string; unlocked: boolean }[]
  tournament: {
    weekStart: string
    previousWeekStart: string
    canClaim: boolean
    prizes: number[]
    claimedPlaces: string[]
    current: { rank: number; name: string; score: number; isCurrentUser: boolean }[]
    allTime: { rank: number; name: string; xp: number; isCurrentUser: boolean }[]
  }
  dailyLimit: number
  dailyClaimsRemaining: number
}

export type PepeVerseAdminOverview = {
  enabled: boolean
  dailyRewards: number[]
  taskRewards: Record<string, number>
  tournamentPrizes: number[]
  dailyLimit: number
  totalRewards: number
  totalRewardAtomic: string
  transactions: { id: string; guestId: string; source: string; sourceKey: string; itemId: string | null; rewardAtomic: number; createdAt: string }[]
}
