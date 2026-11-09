type PromotionWindow = {
  promotionFeeAtomic: number
  promotionStartedAt: Date | null
  promotionExpiresAt: Date | null
}

export function calculateUnusedPromotionRefundAtomic(campaign: PromotionWindow, now: Date) {
  const { promotionFeeAtomic, promotionStartedAt, promotionExpiresAt } = campaign
  if (promotionFeeAtomic <= 0 || !promotionStartedAt || !promotionExpiresAt) return 0

  const startsAt = promotionStartedAt.getTime()
  const expiresAt = promotionExpiresAt.getTime()
  const durationMs = expiresAt - startsAt
  if (durationMs <= 0 || now.getTime() >= expiresAt) return 0

  const remainingMs = expiresAt - Math.max(now.getTime(), startsAt)
  return Number((BigInt(promotionFeeAtomic) * BigInt(remainingMs)) / BigInt(durationMs))
}
