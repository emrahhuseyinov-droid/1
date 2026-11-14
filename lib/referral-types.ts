export type ReferralOverview = {
  referralCode: string
  referralCount: number
  activeReferralCount: number
  bonusCount: number
  bonusAtomicByToken: Record<'PEPE' | 'HOMERO', string>
}
