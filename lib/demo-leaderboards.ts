import { PROFILE_AVATARS } from '@/lib/profile-avatars'

const adjectives = ['Amber', 'Arctic', 'Astral', 'Azure', 'Bold', 'Bright', 'Cosmic', 'Crimson', 'Daring', 'Electric', 'Emerald']
const nouns = ['Badger', 'Comet', 'Fox', 'Harbor', 'Koala']

export const DEMO_PLAYERS = Array.from({ length: 55 }, (_, index) => ({
  id: `demo-${index + 1}`,
  displayName: `${adjectives[Math.floor(index / nouns.length)]}${nouns[index % nouns.length]}`,
  avatarSrc: PROFILE_AVATARS[10 + index].src,
}))

export const DEMO_ARCADE_LEADERBOARD = DEMO_PLAYERS.map((player, index) => ({
  rank: index + 1,
  displayName: player.displayName,
  avatarSrc: player.avatarSrc,
  bestDistanceM: 5_234 - index * 67 + (index % 4) * 13,
  prizeAmount: 0,
  prizeTokenSymbol: 'PEPE' as const,
  isCurrentUser: false,
  isDemo: true,
}))

const demoReferralCounts = [93, 57, 31, 22, 18, 14, 11, 8, 5, 2] as const

export const DEMO_REFERRAL_LEADERBOARD = DEMO_PLAYERS.slice(0, 10).map((player, index) => ({
  rank: index + 1,
  displayName: player.displayName,
  avatarSrc: player.avatarSrc,
  successfulReferrals: demoReferralCounts[index],
  isDemo: true,
}))

export type DemoCrushScope = 'all' | 'weekly'
export type DemoCrushMetric = 'levels' | 'score' | 'stars'

export function getDemoPepeCrushLeaderboard(scope: DemoCrushScope, metric: DemoCrushMetric) {
  const entries = DEMO_PLAYERS.map((player, index) => ({
    rank: index + 1,
    displayName: player.displayName,
    avatarSrc: player.avatarSrc,
    levels: scope === 'all' ? 220 - index * 3 + (index % 3) : 28 - Math.floor(index / 2),
    score: scope === 'all' ? 320_000 - index * 4_300 + (index % 4) * 120 : 58_000 - index * 750 + (index % 3) * 40,
    stars: scope === 'all' ? 540 - index * 7 + (index % 3) : 87 - index,
    isCurrentUser: false,
    isDemo: true,
  }))

  entries.sort((left, right) => right[metric] - left[metric] || right.stars - left.stars)
  return {
    scope,
    metric,
    entries: entries.map((entry, index) => ({ ...entry, rank: index + 1 })),
    me: null,
  }
}
