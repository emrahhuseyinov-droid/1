import type { ProfileAvatarSrc } from '@/lib/profile-avatars'

export type ReferralLeaderboardEntry = {
  rank: number
  displayName: string
  avatarSrc: ProfileAvatarSrc
  successfulReferrals: number
}

export type ReferralOverview = {
  referralCode: string
  referralCount: number
  activeReferralCount: number
  bonusCount: number
  bonusAtomicByToken: Record<'PEPE' | 'HOMERO', string>
}
