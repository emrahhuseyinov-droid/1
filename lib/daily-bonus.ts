export const atomicUnitsPerDoge = 100_000_000

export const dailyBonusRewardsAtomic = [
  5_000_000_000,
  5_000_000_000,
  7_500_000_000,
  10_000_000_000,
  10_000_000_000,
  12_500_000_000,
  15_000_000_000,
] as const

export function getUtcDateKey(offsetDays = 0, referenceDate = new Date()) {
  const date = new Date(referenceDate)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export function getStreakFromDate(dateKeys: Set<string>, anchorDate: string) {
  const date = new Date(`${anchorDate}T00:00:00.000Z`)
  let streak = 0

  for (let day = 0; day < dailyBonusRewardsAtomic.length; day += 1) {
    const dateKey = date.toISOString().slice(0, 10)
    if (!dateKeys.has(dateKey)) break
    streak += 1
    date.setUTCDate(date.getUTCDate() - 1)
  }

  return streak
}

export function getDailyBonusRewardAtomic(streakBeforeToday: number) {
  const dayIndex = Math.min(Math.max(0, streakBeforeToday), dailyBonusRewardsAtomic.length - 1)
  return dailyBonusRewardsAtomic[dayIndex]
}
