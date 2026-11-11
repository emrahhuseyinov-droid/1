export type ArcadeBoostCode = 'jetpack' | 'shield'
export type ArcadeObstacleKind = 'candle' | 'cactus'

export const ARCADE_ENERGY_CAP = 20
export const ARCADE_DAILY_ENERGY_EARNED_CAP = 20
export const ARCADE_DAILY_RUN_LIMIT = 5
export const ARCADE_PTC_ENERGY_REWARD = 0.2
export const ARCADE_SHORTLINK_ENERGY_REWARD = 0.35
export const ARCADE_VIEW_AD_ENERGY_REWARD = 0.25
export const ARCADE_MAX_JUMPS = 100_000
export const ARCADE_HEARTBEAT_GRACE_MS = 12_000
export const ARCADE_ATOMIC_PER_PEPE = 100_000_000
export const ARCADE_HOMERO_COIN_INTERVAL_M = 100
export const ARCADE_HOMERO_COIN_REWARD = 1
export const ARCADE_HOMERO_COIN_REWARD_ATOMIC = ARCADE_HOMERO_COIN_REWARD * ARCADE_ATOMIC_PER_PEPE
export const ARCADE_HOMERO_COIN_MAX_REWARDS = 100
export const ARCADE_HOMERO_COIN_MAX_REWARD_ATOMIC = ARCADE_HOMERO_COIN_MAX_REWARDS * ARCADE_HOMERO_COIN_REWARD_ATOMIC

export function getArcadeHomeroCoinsRemaining(earnedRewardAtomic: number) {
  if (!Number.isFinite(earnedRewardAtomic)) return 0
  const earned = Math.min(ARCADE_HOMERO_COIN_MAX_REWARD_ATOMIC, Math.max(0, Math.floor(earnedRewardAtomic)))
  return Math.floor((ARCADE_HOMERO_COIN_MAX_REWARD_ATOMIC - earned) / ARCADE_HOMERO_COIN_REWARD_ATOMIC)
}
export const ARCADE_RUNNER_WIDTH = 800
export const ARCADE_RUNNER_HEIGHT = 280
export const ARCADE_RUNNER_FPS = 60
export const ARCADE_RUNNER_FRAME_MS = 1000 / ARCADE_RUNNER_FPS
export const ARCADE_TRAIN_INTERVAL_SECONDS = 13
export const ARCADE_TRAIN_PASS_SECONDS = 4
export const ARCADE_RUNNER_GROUND_Y = 180
export const ARCADE_RUNNER_PLAYER_X = 74
export const ARCADE_RUNNER_PLAYER_WIDTH = 42
export const ARCADE_RUNNER_PLAYER_HEIGHT = 40
export const ARCADE_DIFFICULTY_STEP_M = 100

const RUNNER_GRAVITY = 0.63
const RUNNER_JUMP_VELOCITY = -10.8
const RUNNER_JUMP_BUFFER_FRAMES = 8
const RUNNER_START_SPEED = 4
const RUNNER_SPEED_STEP = 0.0004
const RUNNER_DIFFICULTY_SPEED_STEP = 0.03
const RUNNER_DISTANCE_PER_PIXEL = 0.1
const RUNNER_FIRST_OBSTACLE_AT = 160
const RUNNER_LIFE_INVULNERABILITY_FRAMES = 105

export function getArcadeDifficultyLevel(distanceM: number) {
  return Math.max(0, Math.floor(distanceM / ARCADE_DIFFICULTY_STEP_M))
}

function getArcadeObstacleLevel(distanceM: number) {
  return Math.max(0, Math.floor(distanceM / (ARCADE_DIFFICULTY_STEP_M * 2)))
}

export const ARCADE_MILESTONES = [
  { key: 'milestone_500', distanceM: 500, amountAtomic: 40_000_000_000 },
  { key: 'milestone_1000', distanceM: 1000, amountAtomic: 110_000_000_000 },
  { key: 'milestone_2000', distanceM: 2000, amountAtomic: 250_000_000_000 },
] as const

type ArcadeWeeklyPrizeTier = {
  startRank: number
  endRank: number
  amount: number
  tokenSymbol: 'PEPE' | 'HOMERO'
}

export const ARCADE_WEEKLY_PRIZE_TIERS: readonly ArcadeWeeklyPrizeTier[] = [
  { startRank: 1, endRank: 1, amount: 10_000, tokenSymbol: 'PEPE' },
  { startRank: 2, endRank: 2, amount: 5_000, tokenSymbol: 'PEPE' },
  { startRank: 3, endRank: 3, amount: 2_500, tokenSymbol: 'PEPE' },
  { startRank: 4, endRank: 4, amount: 1_250, tokenSymbol: 'PEPE' },
  { startRank: 5, endRank: 10, amount: 750, tokenSymbol: 'PEPE' },
  { startRank: 11, endRank: 20, amount: 500, tokenSymbol: 'PEPE' },
  { startRank: 21, endRank: 50, amount: 250, tokenSymbol: 'PEPE' },
  { startRank: 51, endRank: 100, amount: 100, tokenSymbol: 'PEPE' },
]

export const ARCADE_WEEKLY_PRIZE_BUDGET_PEPE = ARCADE_WEEKLY_PRIZE_TIERS.reduce(
  (total, tier) => total + (tier.tokenSymbol === 'PEPE' ? (tier.endRank - tier.startRank + 1) * tier.amount : 0),
  0,
)

export const ARCADE_WEEKLY_PRIZE_BUDGET_HOMERO = ARCADE_WEEKLY_PRIZE_TIERS.reduce(
  (total, tier) => total + (tier.tokenSymbol === 'HOMERO' ? (tier.endRank - tier.startRank + 1) * tier.amount : 0),
  0,
)

export function getArcadeWeeklyPrize(rank: number) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) return null
  const tier = ARCADE_WEEKLY_PRIZE_TIERS.find((item) => rank >= item.startRank && rank <= item.endRank)
  return tier ? { amountAtomic: tier.amount * ARCADE_ATOMIC_PER_PEPE, tokenSymbol: tier.tokenSymbol } : null
}

export const ARCADE_SHOP = {
  life: { code: 'life', label: 'Extra Life', priceAtomic: 6_000_000_000 },
} as const

export type ArcadeShopCode = keyof typeof ARCADE_SHOP
export type ArcadeInventoryCode = ArcadeBoostCode | 'life'

export type ArcadeRunnerObstacle = {
  kind: ArcadeObstacleKind
  x: number
  y: number
  width: number
  height: number
}

export type ArcadeRunnerCoin = {
  milestoneM: number
  x: number
  y: number
  width: number
  height: number
}

export type ArcadeRunnerState = {
  frameCount: number
  distancePx: number
  distanceM: number
  speed: number
  playerY: number
  jumpVelocity: number
  jumpBufferFrames: number
  isJumping: boolean
  obstacles: ArcadeRunnerObstacle[]
  homeroCoins: ArcadeRunnerCoin[]
  homeroCoinsEnabled: boolean
  homeroCoinsCollected: number
  homeroCoinRewardLimit: number
  collectedHomeroCoinMilestones: number[]
  nextHomeroCoinAtM: number
  nextObstacleAtPx: number
  randomState: number
  shieldAvailable: boolean
  distanceMultiplier: number
  livesRemaining: number
  invulnerabilityFrames: number
  alive: boolean
  finishedBy: 'collision' | null
  acceptedJumps: number
}

export function createArcadeRunnerState(seed: number, boostCodes: ArcadeBoostCode[] = [], extraLives = 0, homeroCoinsEnabled = false, homeroCoinRewardLimit = ARCADE_HOMERO_COIN_MAX_REWARDS): ArcadeRunnerState {
  return {
    frameCount: 0,
    distancePx: 0,
    distanceM: 0,
    speed: RUNNER_START_SPEED,
    playerY: ARCADE_RUNNER_GROUND_Y,
    jumpVelocity: 0,
    jumpBufferFrames: 0,
    isJumping: false,
    obstacles: [],
    homeroCoins: [],
    homeroCoinsEnabled,
    homeroCoinsCollected: 0,
    homeroCoinRewardLimit: Math.min(ARCADE_HOMERO_COIN_MAX_REWARDS, Math.max(0, Math.floor(homeroCoinRewardLimit))),
    collectedHomeroCoinMilestones: [],
    nextHomeroCoinAtM: ARCADE_HOMERO_COIN_INTERVAL_M,
    nextObstacleAtPx: RUNNER_FIRST_OBSTACLE_AT,
    randomState: seed >>> 0 || 1,
    shieldAvailable: boostCodes.includes('shield'),
    distanceMultiplier: boostCodes.includes('jetpack') ? 1.25 : 1,
    livesRemaining: extraLives,
    invulnerabilityFrames: 0,
    alive: true,
    finishedBy: null,
    acceptedJumps: 0,
  }
}

function nextRandom(state: ArcadeRunnerState) {
  let value = state.randomState
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState
}

function createObstacle(state: ArcadeRunnerState) {
  const kindIndex = nextRandom(state) % 2
  if (kindIndex === 0) {
    return { kind: 'candle' as const, x: ARCADE_RUNNER_WIDTH, y: 184, width: 22, height: 36 }
  }
  return { kind: 'cactus' as const, x: ARCADE_RUNNER_WIDTH, y: 172, width: 30, height: 48 }
}

function getNextObstacleGap(state: ArcadeRunnerState) {
  const difficultyLevel = getArcadeObstacleLevel(state.distanceM)
  const minimumGap = Math.max(130, Math.floor((280 - difficultyLevel * 4) / 2))
  const gapVariation = Math.max(55, Math.floor((151 - difficultyLevel * 3) / 2))
  const gapAtStartingSpeed = (minimumGap + (nextRandom(state) % gapVariation)) * 2
  return Math.ceil(gapAtStartingSpeed * (state.speed / RUNNER_START_SPEED))
}

function intersectsPlayer(obstacle: Pick<ArcadeRunnerObstacle, 'x' | 'y' | 'width' | 'height'>, playerY: number) {
  const playerLeft = ARCADE_RUNNER_PLAYER_X + 5
  const playerRight = ARCADE_RUNNER_PLAYER_X + ARCADE_RUNNER_PLAYER_WIDTH - 5
  const playerTop = playerY + 4
  const playerBottom = playerY + ARCADE_RUNNER_PLAYER_HEIGHT - 2
  return playerLeft < obstacle.x + obstacle.width - 2
    && playerRight > obstacle.x + 2
    && playerTop < obstacle.y + obstacle.height - 2
    && playerBottom > obstacle.y + 2
}

function getHomeroCoinDistanceLeadM(state: ArcadeRunnerState) {
  const playerCenterX = ARCADE_RUNNER_PLAYER_X + ARCADE_RUNNER_PLAYER_WIDTH / 2
  return (ARCADE_RUNNER_WIDTH - playerCenterX) * RUNNER_DISTANCE_PER_PIXEL * state.distanceMultiplier
}

export function stepArcadeRunner(state: ArcadeRunnerState, jumpPressed: boolean) {
  if (!state.alive || state.finishedBy) return { jumped: false, collision: false }

  if (jumpPressed) state.jumpBufferFrames = RUNNER_JUMP_BUFFER_FRAMES
  else if (state.jumpBufferFrames > 0) state.jumpBufferFrames -= 1

  let jumped = false
  if (state.jumpBufferFrames > 0 && !state.isJumping) {
    state.isJumping = true
    state.jumpVelocity = RUNNER_JUMP_VELOCITY
    state.jumpBufferFrames = 0
    state.acceptedJumps += 1
    jumped = true
  }

  state.frameCount += 1
  const difficultyLevel = getArcadeDifficultyLevel(state.distanceM)
  state.speed = RUNNER_START_SPEED + state.frameCount * RUNNER_SPEED_STEP + difficultyLevel * RUNNER_DIFFICULTY_SPEED_STEP
  if (state.isJumping) {
    state.playerY += state.jumpVelocity
    state.jumpVelocity += RUNNER_GRAVITY
    if (state.playerY >= ARCADE_RUNNER_GROUND_Y) {
      state.playerY = ARCADE_RUNNER_GROUND_Y
      state.isJumping = false
      state.jumpVelocity = 0
    }
  }

  state.distancePx += state.speed
  state.distanceM += state.speed * RUNNER_DISTANCE_PER_PIXEL * state.distanceMultiplier
  if (state.homeroCoinsEnabled) {
    while (state.homeroCoinsCollected + state.homeroCoins.length < state.homeroCoinRewardLimit
      && state.distanceM >= state.nextHomeroCoinAtM - getHomeroCoinDistanceLeadM(state)) {
      state.homeroCoins.push({ milestoneM: state.nextHomeroCoinAtM, x: ARCADE_RUNNER_WIDTH, y: 120, width: 30, height: 30 })
      state.nextHomeroCoinAtM += ARCADE_HOMERO_COIN_INTERVAL_M
    }
  }
  if (state.distancePx >= state.nextObstacleAtPx) {
    state.obstacles.push(createObstacle(state))
    state.nextObstacleAtPx += getNextObstacleGap(state)
  }

  for (const obstacle of state.obstacles) obstacle.x -= state.speed
  for (const coin of state.homeroCoins) coin.x -= state.speed

  let collision = false
  if (state.invulnerabilityFrames > 0) state.invulnerabilityFrames -= 1
  for (let index = state.obstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = state.obstacles[index]
    if (state.invulnerabilityFrames === 0 && intersectsPlayer(obstacle, state.playerY)) {
      if (state.shieldAvailable) {
        state.shieldAvailable = false
        state.obstacles.splice(index, 1)
      } else if (state.livesRemaining > 0) {
        state.livesRemaining -= 1
        state.invulnerabilityFrames = RUNNER_LIFE_INVULNERABILITY_FRAMES
        state.obstacles.splice(index, 1)
        collision = true
        break
      } else {
        state.alive = false
        state.finishedBy = 'collision'
        collision = true
        break
      }
    }
  }

  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -12)
  if (state.alive && state.isJumping) {
    for (let index = state.homeroCoins.length - 1; index >= 0; index -= 1) {
      const coin = state.homeroCoins[index]
      if (!intersectsPlayer(coin, state.playerY)) continue
      state.homeroCoinsCollected += 1
      state.collectedHomeroCoinMilestones.push(coin.milestoneM)
      state.homeroCoins.splice(index, 1)
    }
  }
  state.homeroCoins = state.homeroCoins.filter((coin) => coin.x + coin.width > -12)

  return { jumped, collision }
}

export function getArcadeMaximumDistanceM(elapsedMs: number, boostCodes: ArcadeBoostCode[] = []) {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return 0

  const targetFrame = Math.floor(elapsedMs * ARCADE_RUNNER_FPS / 1000)
  const distanceMultiplier = boostCodes.includes('jetpack') ? 1.25 : 1
  let distanceM = 0

  for (let frameCount = 1; frameCount <= targetFrame; frameCount += 1) {
    const difficultyLevel = getArcadeDifficultyLevel(distanceM)
    const speed = RUNNER_START_SPEED + frameCount * RUNNER_SPEED_STEP + difficultyLevel * RUNNER_DIFFICULTY_SPEED_STEP
    distanceM += speed * RUNNER_DISTANCE_PER_PIXEL * distanceMultiplier
  }

  return Math.floor(distanceM)
}

export function simulateArcadeRun(seed: number, jumpTimes: number[], boostCodes: ArcadeBoostCode[], elapsedMs: number, extraLives = 0, homeroCoinsEnabled = false, homeroCoinRewardLimit = ARCADE_HOMERO_COIN_MAX_REWARDS) {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || jumpTimes.length > ARCADE_MAX_JUMPS) {
    return { valid: false, finished: false, distanceM: 0, hits: 0, failed: true, finishedBy: null, livesRemaining: 0, homeroCoinsCollected: 0, collectedHomeroCoinMilestones: [] }
  }

  const jumpFrames = jumpTimes.map((time) => Math.round(time * ARCADE_RUNNER_FPS / 1000))
  if (jumpTimes.some((time, index) => !Number.isSafeInteger(time) || time < 0 || (index > 0 && time <= jumpTimes[index - 1]))
    || jumpFrames.some((frame, index) => frame < 1 || (index > 0 && frame <= jumpFrames[index - 1]))) {
    return { valid: false, finished: false, distanceM: 0, hits: 0, failed: true, finishedBy: null, livesRemaining: 0, homeroCoinsCollected: 0, collectedHomeroCoinMilestones: [] }
  }

  const state = createArcadeRunnerState(seed, boostCodes, extraLives, homeroCoinsEnabled, homeroCoinRewardLimit)
  const targetFrame = Math.floor(elapsedMs * ARCADE_RUNNER_FPS / 1000)
  let jumpIndex = 0

  while (state.frameCount < targetFrame && state.alive && !state.finishedBy) {
    const nextFrame = state.frameCount + 1
    const shouldJump = jumpFrames[jumpIndex] === nextFrame
    if (jumpFrames[jumpIndex] < nextFrame) {
      return { valid: false, finished: false, distanceM: 0, hits: 0, failed: true, finishedBy: null, livesRemaining: 0, homeroCoinsCollected: 0, collectedHomeroCoinMilestones: [] }
    }
    const result = stepArcadeRunner(state, shouldJump)
    if (shouldJump) {
      if (!result.jumped) return { valid: false, finished: false, distanceM: 0, hits: 0, failed: true, finishedBy: null, livesRemaining: 0, homeroCoinsCollected: 0, collectedHomeroCoinMilestones: [] }
      jumpIndex += 1
    }
  }

  if (jumpIndex !== jumpTimes.length) {
    return { valid: false, finished: false, distanceM: 0, hits: 0, failed: true, finishedBy: null, livesRemaining: 0, homeroCoinsCollected: 0, collectedHomeroCoinMilestones: [] }
  }

  return {
    valid: true,
    finished: Boolean(state.finishedBy),
    distanceM: Math.floor(state.distanceM),
    hits: state.acceptedJumps,
    failed: state.finishedBy === 'collision',
    finishedBy: state.finishedBy,
    livesRemaining: state.livesRemaining,
    homeroCoinsCollected: state.homeroCoinsCollected,
    collectedHomeroCoinMilestones: state.collectedHomeroCoinMilestones,
  }
}
