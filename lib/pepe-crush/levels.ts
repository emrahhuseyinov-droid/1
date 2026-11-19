import {
  applyAction,
  CELL_COUNT,
  cloneGame,
  createGame,
  createRandomSource,
  findPossibleMoves,
  goalProgress,
  hashSeed,
  type GameState,
  type LevelConfig,
  type LevelGoal,
} from './engine'

export const MAX_LEVEL_NUMBER = 1_000_000_000

export type LevelTier = { name: string; nameRu: string }

export function getLevelTier(level: number): LevelTier {
  if (level <= 10) return { name: 'Training', nameRu: 'Обучение' }
  if (level <= 50) return { name: 'Candy Meadow', nameRu: 'Конфетный луг' }
  if (level <= 100) return { name: 'Stone Valley', nameRu: 'Каменная долина' }
  if (level <= 500) return { name: 'Crystal Caves', nameRu: 'Кристальные пещеры' }
  if (level <= 1000) return { name: 'Frog Kingdom', nameRu: 'Королевство PEPE' }
  return { name: 'Endless Swamp', nameRu: 'Бесконечное болото' }
}

const roundTo = (value: number, step: number) => Math.max(step, Math.round(value / step) * step)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function pickCells(random: ReturnType<typeof createRandomSource>, count: number, blocked: Set<number>, allowTopRow: boolean) {
  const candidates = Array.from({ length: CELL_COUNT }, (_, i) => i).filter((i) => !blocked.has(i) && (allowTopRow || i >= 8))
  for (let k = candidates.length - 1; k > 0; k -= 1) {
    const swap = random.int(k + 1)
    ;[candidates[k], candidates[swap]] = [candidates[swap], candidates[k]]
  }
  return candidates.slice(0, count)
}

export function generateLevelDraft(level: number, scale = 1): LevelConfig {
  const random = createRandomSource(hashSeed(level, 0x50c2))
  const growth = Math.log2(1 + level)
  const colors = level <= 12 ? 5 : 6
  const stone = new Array(CELL_COUNT).fill(0)
  const jelly = new Array(CELL_COUNT).fill(0)

  const scoreTarget = roundTo((1000 + 260 * growth * growth) * (0.6 + 0.4 * scale), 100)
  const goals: LevelGoal[] = [{ type: 'score', target: scoreTarget }]

  const extraGoals: ('collect' | 'jelly' | 'stone')[] = []
  if (level >= 4 && level <= 10) extraGoals.push('collect')
  else if (level > 10) {
    const rotation: ('collect' | 'jelly' | 'stone')[][] = [['collect'], ['jelly'], ['stone'], ['collect', 'jelly']]
    const primary = rotation[level % rotation.length]
    extraGoals.push(...primary)
    if (level > 100 && extraGoals.length < 2) extraGoals.push(primary[0] === 'stone' ? 'collect' : 'stone')
    if (level > 500) for (const type of ['collect', 'jelly', 'stone'] as const) if (!extraGoals.includes(type)) extraGoals.push(type)
  }

  const obstacleStones = level > 50 ? clamp(Math.round((growth - 4) * 1.6 * scale), 1, 10) : 0
  const stoneGoalCount = clamp(Math.round((2 + growth * 1.1) * scale), 2, 14)
  const stoneCount = extraGoals.includes('stone') ? stoneGoalCount : obstacleStones
  const maxStoneHp = level > 1000 ? 3 : level > 500 ? 2 : 1
  const blocked = new Set<number>()
  for (const cell of pickCells(random, stoneCount, blocked, false)) {
    stone[cell] = 1 + random.int(maxStoneHp)
    blocked.add(cell)
  }
  if (extraGoals.includes('stone')) goals.push({ type: 'stone', count: stoneCount })

  if (extraGoals.includes('jelly')) {
    const jellyCells = clamp(Math.round((6 + growth * 2.6) * scale), 5, 30)
    const doubleLayer = level > 200
    let layers = 0
    for (const cell of pickCells(random, jellyCells, blocked, true)) {
      jelly[cell] = doubleLayer && random.int(3) === 0 ? 2 : 1
      layers += jelly[cell]
    }
    goals.push({ type: 'jelly', count: layers })
  }

  if (extraGoals.includes('collect')) {
    const color = random.int(colors)
    goals.push({ type: 'collect', color, count: roundTo((12 + growth * 4.5) * scale, 1) })
    if (level > 500) {
      const second = (color + 1 + random.int(colors - 1)) % colors
      goals.push({ type: 'collect', color: second, count: roundTo((8 + growth * 3) * scale, 1) })
    }
  }

  return {
    level,
    colors,
    moves: 120,
    goals,
    stars: [scoreTarget, roundTo(scoreTarget * 1.45, 100), roundTo(scoreTarget * 2.1, 100)],
    jelly,
    stone,
  }
}

function evaluate(state: GameState) {
  if (state.status === 'won') return 1_000_000 - state.movesUsed
  let progress = 0
  for (const goal of state.config.goals) {
    const { current, target } = goalProgress(state, goal)
    progress += (current / target) * (goal.type === 'score' ? 400 : 1000)
  }
  return progress + state.score * 0.002
}

export function simulateBot(config: LevelConfig, seed: number, moveLimit: number) {
  const state = createGame({ ...config, moves: moveLimit }, seed)
  while (state.status === 'playing') {
    const moves = findPossibleMoves(state.tiles)
    let best = moves[0]
    let bestValue = -Infinity
    for (const move of moves) {
      const trial = cloneGame(state)
      applyAction(trial, { t: 'swap', a: move.a, b: move.b })
      const value = evaluate(trial)
      if (value > bestValue) { bestValue = value; best = move }
    }
    if (!best || !applyAction(state, { t: 'swap', a: best.a, b: best.b })) break
  }
  return { won: state.status === 'won', movesUsed: state.movesUsed, score: state.score }
}

function moveSlack(level: number) {
  if (level <= 10) return 2
  return Math.max(1.3, 1.9 - 0.12 * Math.log2(level / 10))
}

const SCALE_STEPS = [1, 0.8, 0.62, 0.45, 0.3]
const BOT_RUNS = 2
const BOT_MOVE_LIMIT = 110

export function calibrateLevel(level: number): LevelConfig {
  for (const scale of SCALE_STEPS) {
    const draft = generateLevelDraft(level, scale)
    const runs = Array.from({ length: BOT_RUNS }, (_, run) => simulateBot(draft, hashSeed(level, run, 0xb07), BOT_MOVE_LIMIT))
    if (!runs.every((run) => run.won)) continue
    const needed = Math.max(...runs.map((run) => run.movesUsed))
    return { ...draft, moves: clamp(Math.ceil(needed * moveSlack(level)) + 2, 12, 70) }
  }
  const scoreTarget = roundTo(1000 + 120 * Math.log2(1 + level), 100)
  return {
    level,
    colors: 5,
    moves: 40,
    goals: [{ type: 'score', target: scoreTarget }],
    stars: [scoreTarget, roundTo(scoreTarget * 1.45, 100), roundTo(scoreTarget * 2.1, 100)],
    jelly: new Array(CELL_COUNT).fill(0),
    stone: new Array(CELL_COUNT).fill(0),
  }
}

const levelCache = new Map<number, LevelConfig>()

export function getLevelConfig(level: number): LevelConfig {
  const cached = levelCache.get(level)
  if (cached) return cached
  const config = calibrateLevel(level)
  if (levelCache.size > 400) levelCache.delete(levelCache.keys().next().value as number)
  levelCache.set(level, config)
  return config
}
