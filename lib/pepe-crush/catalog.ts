import { hashSeed, type BoosterCode, type BoosterCounts } from './engine'

export const BOOSTER_INFO: Record<BoosterCode, { ru: string; en: string; descRu: string; descEn: string; price: number }> = {
  hammer: { ru: 'Молоток', en: 'Hammer', descRu: 'Уничтожает выбранный элемент', descEn: 'Destroys one chosen piece', price: 40 },
  bomb: { ru: 'Бомба', en: 'Bomb', descRu: 'Взрывает область 3×3', descEn: 'Blasts a 3×3 area', price: 70 },
  rainbow: { ru: 'Радужная конфета', en: 'Rainbow candy', descRu: 'Убирает все элементы одного цвета', descEn: 'Clears every piece of one color', price: 120 },
  rowRocket: { ru: 'Горизонтальная ракета', en: 'Row rocket', descRu: 'Очищает весь ряд', descEn: 'Clears a whole row', price: 50 },
  colRocket: { ru: 'Вертикальная ракета', en: 'Column rocket', descRu: 'Очищает весь столбец', descEn: 'Clears a whole column', price: 50 },
}

export const STARTER_BOOSTERS: BoosterCounts = { hammer: 3, bomb: 1, rainbow: 1, rowRocket: 2, colRocket: 2 }
export const BOOSTER_CAP = 99

export const DAILY_REWARDS: { coins: number; boosters?: Partial<BoosterCounts> }[] = [
  { coins: 20 },
  { coins: 30 },
  { coins: 40, boosters: { hammer: 1 } },
  { coins: 50 },
  { coins: 60, boosters: { rowRocket: 1, colRocket: 1 } },
  { coins: 80 },
  { coins: 120, boosters: { bomb: 1, rainbow: 1 } },
]

export type MissionMetric = 'levelsWon' | 'score' | 'specials' | 'bestCascade' | 'boostersUsed' | 'stars'

export type MissionDefinition = { code: string; metric: MissionMetric; target: number; reward: number; ru: string; en: string }

const MISSION_POOL: MissionDefinition[] = [
  { code: 'win3', metric: 'levelsWon', target: 3, reward: 30, ru: 'Пройди 3 уровня', en: 'Win 3 levels' },
  { code: 'win6', metric: 'levelsWon', target: 6, reward: 55, ru: 'Пройди 6 уровней', en: 'Win 6 levels' },
  { code: 'score25k', metric: 'score', target: 25_000, reward: 30, ru: 'Набери 25 000 очков', en: 'Score 25,000 points' },
  { code: 'score70k', metric: 'score', target: 70_000, reward: 55, ru: 'Набери 70 000 очков', en: 'Score 70,000 points' },
  { code: 'specials8', metric: 'specials', target: 8, reward: 25, ru: 'Создай 8 спецэлементов', en: 'Create 8 special pieces' },
  { code: 'specials20', metric: 'specials', target: 20, reward: 45, ru: 'Создай 20 спецэлементов', en: 'Create 20 special pieces' },
  { code: 'cascade4', metric: 'bestCascade', target: 4, reward: 30, ru: 'Сделай цепочку ×4 за один ход', en: 'Reach a ×4 chain in one move' },
  { code: 'boosters2', metric: 'boostersUsed', target: 2, reward: 20, ru: 'Используй 2 бустера', en: 'Use 2 boosters' },
  { code: 'stars6', metric: 'stars', target: 6, reward: 35, ru: 'Заработай 6 звёзд', en: 'Earn 6 stars' },
]

export function getDailyMissions(dayKey: string): MissionDefinition[] {
  const dayNumber = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000)
  const pool = [...MISSION_POOL]
  const chosen: MissionDefinition[] = []
  let seed = hashSeed(dayNumber, 0xd41)
  while (chosen.length < 3 && pool.length > 0) {
    seed = hashSeed(seed, chosen.length)
    const [mission] = pool.splice(seed % pool.length, 1)
    if (chosen.some((item) => item.metric === mission.metric)) continue
    chosen.push(mission)
  }
  return chosen
}

export type AchievementMetric = 'levelsCompleted' | 'totalStars' | 'specialsCreated' | 'rainbowsCreated' | 'bestCascade' | 'threeStarLevels' | 'streak' | 'wins'

export type AchievementDefinition = {
  code: string
  metric: AchievementMetric
  target: number
  coins: number
  boosters?: Partial<BoosterCounts>
  ru: string
  en: string
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { code: 'first_win', metric: 'wins', target: 1, coins: 20, ru: 'Первая победа', en: 'First win' },
  { code: 'level_10', metric: 'levelsCompleted', target: 10, coins: 50, boosters: { hammer: 1 }, ru: '10 уровней пройдено', en: '10 levels completed' },
  { code: 'level_25', metric: 'levelsCompleted', target: 25, coins: 80, ru: '25 уровней пройдено', en: '25 levels completed' },
  { code: 'level_50', metric: 'levelsCompleted', target: 50, coins: 120, boosters: { bomb: 1 }, ru: '50 уровней пройдено', en: '50 levels completed' },
  { code: 'level_100', metric: 'levelsCompleted', target: 100, coins: 200, boosters: { rainbow: 1 }, ru: '100 уровней пройдено', en: '100 levels completed' },
  { code: 'level_250', metric: 'levelsCompleted', target: 250, coins: 350, ru: '250 уровней пройдено', en: '250 levels completed' },
  { code: 'level_500', metric: 'levelsCompleted', target: 500, coins: 600, boosters: { rainbow: 2 }, ru: '500 уровней пройдено', en: '500 levels completed' },
  { code: 'level_1000', metric: 'levelsCompleted', target: 1000, coins: 1200, boosters: { rainbow: 3, bomb: 3 }, ru: '1000 уровней пройдено', en: '1000 levels completed' },
  { code: 'stars_30', metric: 'totalStars', target: 30, coins: 50, ru: '30 звёзд', en: '30 stars' },
  { code: 'stars_100', metric: 'totalStars', target: 100, coins: 120, ru: '100 звёзд', en: '100 stars' },
  { code: 'stars_300', metric: 'totalStars', target: 300, coins: 300, ru: '300 звёзд', en: '300 stars' },
  { code: 'stars_1000', metric: 'totalStars', target: 1000, coins: 800, ru: '1000 звёзд', en: '1000 stars' },
  { code: 'three_star_10', metric: 'threeStarLevels', target: 10, coins: 100, ru: '10 уровней на 3 звезды', en: '10 three-star levels' },
  { code: 'specials_50', metric: 'specialsCreated', target: 50, coins: 60, ru: '50 спецэлементов', en: '50 special pieces' },
  { code: 'specials_500', metric: 'specialsCreated', target: 500, coins: 250, ru: '500 спецэлементов', en: '500 special pieces' },
  { code: 'rainbow_maker', metric: 'rainbowsCreated', target: 1, coins: 40, ru: 'Создай радужную конфету', en: 'Create a rainbow candy' },
  { code: 'cascade_5', metric: 'bestCascade', target: 5, coins: 60, ru: 'Цепочка ×5', en: '×5 chain reaction' },
  { code: 'streak_7', metric: 'streak', target: 7, coins: 150, boosters: { bomb: 1 }, ru: '7 дней подряд', en: '7-day streak' },
]

export function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function getUtcWeekStart(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - weekday)
  return start
}

export const CANDY_NAMES = [
  { ru: 'Вишня', en: 'Cherry' },
  { ru: 'Апельсин', en: 'Orange' },
  { ru: 'Звезда', en: 'Star' },
  { ru: 'PEPE', en: 'PEPE' },
  { ru: 'Кристалл', en: 'Crystal' },
  { ru: 'Виноград', en: 'Grape' },
]
