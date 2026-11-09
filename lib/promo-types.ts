export type PromoClaim = {
  code: string
  rewardAtomic: number
  createdAt: string
}

export type PromoActivityEligibility = {
  eligible: boolean
  lastActivityAt: string | null
  windowDays: number
}

export type PromoCodeOverview = {
  claims: PromoClaim[]
}
