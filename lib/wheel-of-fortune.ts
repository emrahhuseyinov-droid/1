export const WHEEL_COOLDOWN_MS = 2 * 60 * 60 * 1000
export const WHEEL_ATOMIC_PER_HOMERO = 100_000_000

export type WheelRewardType = 'homero' | 'energy' | 'life'

export type WheelSector = {
  key: string
  label: string
  shortLabel: string
  rewardType: WheelRewardType
  rewardAtomic: number
  rewardQuantity: number
  chanceBps: number
  color: string
}

export const wheelSectors: WheelSector[] = [
  { key: 'small-prize', label: '25 HOMERO', shortLabel: '25', rewardType: 'homero', rewardAtomic: 25 * WHEEL_ATOMIC_PER_HOMERO, rewardQuantity: 0, chanceBps: 4_000, color: '#e6bd19' },
  { key: 'arcade-energy', label: '+1 Arcade energy', shortLabel: '+1 energy', rewardType: 'energy', rewardAtomic: 0, rewardQuantity: 1, chanceBps: 2_500, color: '#57b72b' },
  { key: 'medium-prize', label: '100 HOMERO', shortLabel: '100', rewardType: 'homero', rewardAtomic: 100 * WHEEL_ATOMIC_PER_HOMERO, rewardQuantity: 0, chanceBps: 1_500, color: '#08a6bf' },
  { key: 'arcade-energy-bonus', label: '+0.5 Arcade energy', shortLabel: '+0.5 energy', rewardType: 'energy', rewardAtomic: 0, rewardQuantity: 0.5, chanceBps: 1_000, color: '#1d56bd' },
  { key: 'large-prize', label: '500 HOMERO', shortLabel: '500', rewardType: 'homero', rewardAtomic: 500 * WHEEL_ATOMIC_PER_HOMERO, rewardQuantity: 0, chanceBps: 600, color: '#5e169e' },
  { key: 'extra-life', label: '+1 Arcade life', shortLabel: '+1 life', rewardType: 'life', rewardAtomic: 0, rewardQuantity: 1, chanceBps: 300, color: '#a20ea5' },
  { key: 'jackpot', label: '1,000 HOMERO jackpot', shortLabel: '1,000', rewardType: 'homero', rewardAtomic: 1_000 * WHEEL_ATOMIC_PER_HOMERO, rewardQuantity: 0, chanceBps: 90, color: '#c21d2e' },
  { key: 'consolation-prize', label: '10 HOMERO', shortLabel: '10', rewardType: 'homero', rewardAtomic: 10 * WHEEL_ATOMIC_PER_HOMERO, rewardQuantity: 0, chanceBps: 10, color: '#b95d13' },
]

export function chooseWheelSector(randomValue: number) {
  let remaining = randomValue
  for (let index = 0; index < wheelSectors.length; index += 1) {
    remaining -= wheelSectors[index].chanceBps
    if (remaining < 0) return index
  }
  return wheelSectors.length - 1
}

export function getWheelRewardLabel(sectorIndex: number) {
  return wheelSectors[sectorIndex]?.label ?? 'Wheel reward'
}
