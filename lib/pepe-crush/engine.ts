export const BOARD_SIZE = 8
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE
export const ENGINE_VERSION = 1
export const MAX_COLORS = 6

export const SPECIAL_NONE = 0
export const SPECIAL_ROW_ROCKET = 1
export const SPECIAL_COL_ROCKET = 2
export const SPECIAL_BOMB = 3
export const SPECIAL_RAINBOW = 4
export type SpecialKind = 0 | 1 | 2 | 3 | 4

export type Tile = { id: number; c: number; s: SpecialKind }

export const BOOSTER_CODES = ['hammer', 'bomb', 'rainbow', 'rowRocket', 'colRocket'] as const
export type BoosterCode = (typeof BOOSTER_CODES)[number]
export type BoosterCounts = Record<BoosterCode, number>

export function emptyBoosterCounts(): BoosterCounts {
  return { hammer: 0, bomb: 0, rainbow: 0, rowRocket: 0, colRocket: 0 }
}

export function isBoosterCode(value: unknown): value is BoosterCode {
  return typeof value === 'string' && (BOOSTER_CODES as readonly string[]).includes(value)
}

export type LevelGoal =
  | { type: 'score'; target: number }
  | { type: 'collect'; color: number; count: number }
  | { type: 'jelly'; count: number }
  | { type: 'stone'; count: number }

export type LevelConfig = {
  level: number
  colors: number
  moves: number
  goals: LevelGoal[]
  stars: [number, number, number]
  jelly: number[]
  stone: number[]
}

export type GameAction = { t: 'swap'; a: number; b: number } | { t: 'boost'; b: BoosterCode; i: number }

export type GameStats = {
  specialsCreated: number
  rocketsCreated: number
  bombsCreated: number
  rainbowsCreated: number
  maxCascade: number
  tilesCleared: number
}

export type GameStatus = 'playing' | 'won' | 'lost'

export type GameState = {
  config: LevelConfig
  tiles: (Tile | null)[]
  jelly: number[]
  stone: number[]
  rng: number
  nextId: number
  score: number
  movesLeft: number
  movesUsed: number
  collected: number[]
  jellyCleared: number
  stonesBroken: number
  stats: GameStats
  boostersUsed: BoosterCounts
  status: GameStatus
  bonusScore: number
}

export type FrameKind = 'swap' | 'swapBack' | 'clear' | 'fall' | 'shuffle'

export type Frame = {
  kind: FrameKind
  tiles: (Tile | null)[]
  jelly: number[]
  stone: number[]
  cleared: number[]
  score: number
  cascade: number
}

type FrameSink = Frame[] | null

const rowOf = (i: number) => i >> 3
const colOf = (i: number) => i & 7
const indexOf = (row: number, col: number) => row * BOARD_SIZE + col
const inBounds = (row: number, col: number) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE

function nextRandom(state: { rng: number }) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0
  let t = state.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

function randomInt(state: { rng: number }, max: number) {
  return nextRandom(state) % max
}

export function hashSeed(...parts: number[]) {
  let hash = 0x811c9dc5
  for (const part of parts) {
    let value = part >>> 0
    for (let k = 0; k < 4; k += 1) {
      hash ^= value & 0xff
      hash = Math.imul(hash, 0x01000193) >>> 0
      value >>>= 8
    }
  }
  return hash >>> 0
}

export function createRandomSource(seed: number) {
  const source = { rng: seed >>> 0 }
  return { next: () => nextRandom(source), int: (max: number) => randomInt(source, max) }
}

function cloneTiles(tiles: (Tile | null)[]) {
  return tiles.map((tile) => (tile ? { ...tile } : null))
}

export function cloneGame(state: GameState): GameState {
  return {
    ...state,
    tiles: cloneTiles(state.tiles),
    jelly: [...state.jelly],
    stone: [...state.stone],
    collected: [...state.collected],
    stats: { ...state.stats },
    boostersUsed: { ...state.boostersUsed },
  }
}

function pushFrame(frames: FrameSink, state: GameState, kind: FrameKind, cleared: number[] = [], cascade = 0) {
  if (!frames) return
  frames.push({
    kind,
    tiles: cloneTiles(state.tiles),
    jelly: [...state.jelly],
    stone: [...state.stone],
    cleared,
    score: state.score,
    cascade,
  })
}

function sameColor(tiles: (Tile | null)[], a: number, color: number) {
  const tile = tiles[a]
  return tile !== null && tile.c >= 0 && tile.c === color
}

function createsMatchAt(tiles: (Tile | null)[], i: number) {
  const tile = tiles[i]
  if (!tile || tile.c < 0) return false
  const row = rowOf(i)
  const col = colOf(i)
  let horizontal = 1
  for (let c = col - 1; c >= 0 && sameColor(tiles, indexOf(row, c), tile.c); c -= 1) horizontal += 1
  for (let c = col + 1; c < BOARD_SIZE && sameColor(tiles, indexOf(row, c), tile.c); c += 1) horizontal += 1
  if (horizontal >= 3) return true
  let vertical = 1
  for (let r = row - 1; r >= 0 && sameColor(tiles, indexOf(r, col), tile.c); r -= 1) vertical += 1
  for (let r = row + 1; r < BOARD_SIZE && sameColor(tiles, indexOf(r, col), tile.c); r += 1) vertical += 1
  return vertical >= 3
}

type Run = { cells: number[]; horizontal: boolean }
type MatchGroup = { cells: number[]; runs: Run[]; color: number }

export function findMatchGroups(tiles: (Tile | null)[]): MatchGroup[] {
  const runs: Run[] = []
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let col = 0
    while (col < BOARD_SIZE) {
      const tile = tiles[indexOf(row, col)]
      if (!tile || tile.c < 0) { col += 1; continue }
      let end = col + 1
      while (end < BOARD_SIZE && sameColor(tiles, indexOf(row, end), tile.c)) end += 1
      if (end - col >= 3) runs.push({ cells: Array.from({ length: end - col }, (_, k) => indexOf(row, col + k)), horizontal: true })
      col = end
    }
  }
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let row = 0
    while (row < BOARD_SIZE) {
      const tile = tiles[indexOf(row, col)]
      if (!tile || tile.c < 0) { row += 1; continue }
      let end = row + 1
      while (end < BOARD_SIZE && sameColor(tiles, indexOf(end, col), tile.c)) end += 1
      if (end - row >= 3) runs.push({ cells: Array.from({ length: end - row }, (_, k) => indexOf(row + k, col)), horizontal: false })
      row = end
    }
  }
  if (runs.length === 0) return []

  const parent = runs.map((_, k) => k)
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])))
  const owner = new Map<number, number>()
  runs.forEach((run, k) => {
    for (const cell of run.cells) {
      const existing = owner.get(cell)
      if (existing === undefined) owner.set(cell, k)
      else parent[find(existing)] = find(k)
    }
  })

  const grouped = new Map<number, Run[]>()
  runs.forEach((run, k) => {
    const root = find(k)
    const list = grouped.get(root) ?? []
    list.push(run)
    grouped.set(root, list)
  })

  return [...grouped.values()].map((groupRuns) => {
    const cells = [...new Set(groupRuns.flatMap((run) => run.cells))].sort((a, b) => a - b)
    return { cells, runs: groupRuns, color: (tiles[cells[0]] as Tile).c }
  })
}

function decideSpecial(group: MatchGroup): SpecialKind {
  const longest = Math.max(...group.runs.map((run) => run.cells.length))
  const hasHorizontal = group.runs.some((run) => run.horizontal)
  const hasVertical = group.runs.some((run) => !run.horizontal)
  if (longest >= 5) return SPECIAL_RAINBOW
  if (hasHorizontal && hasVertical) return SPECIAL_BOMB
  if (longest === 4) {
    const run = group.runs.find((candidate) => candidate.cells.length === 4) as Run
    return run.horizontal ? SPECIAL_ROW_ROCKET : SPECIAL_COL_ROCKET
  }
  return SPECIAL_NONE
}

function chooseSpawnCell(state: GameState, group: MatchGroup, special: SpecialKind, preferred: number[]) {
  const isPlain = (cell: number) => state.tiles[cell]?.s === SPECIAL_NONE
  for (const cell of preferred) {
    if (group.cells.includes(cell) && isPlain(cell)) return cell
  }
  if (special === SPECIAL_BOMB) {
    const horizontalCells = new Set(group.runs.filter((run) => run.horizontal).flatMap((run) => run.cells))
    const intersection = group.runs.filter((run) => !run.horizontal).flatMap((run) => run.cells).find((cell) => horizontalCells.has(cell) && isPlain(cell))
    if (intersection !== undefined) return intersection
  }
  const longest = [...group.runs].sort((a, b) => b.cells.length - a.cells.length)[0]
  const middle = longest.cells[Math.floor(longest.cells.length / 2)]
  if (isPlain(middle)) return middle
  return group.cells.find(isPlain) ?? -1
}

function mostCommonColor(state: GameState) {
  const counts = new Array(MAX_COLORS).fill(0)
  for (const tile of state.tiles) if (tile && tile.c >= 0) counts[tile.c] += 1
  let best = 0
  for (let color = 1; color < MAX_COLORS; color += 1) if (counts[color] > counts[best]) best = color
  return best
}

function rowCells(row: number) {
  return Array.from({ length: BOARD_SIZE }, (_, col) => indexOf(row, col))
}

function colCells(col: number) {
  return Array.from({ length: BOARD_SIZE }, (_, row) => indexOf(row, col))
}

function squareCells(center: number, radius: number) {
  const cells: number[] = []
  for (let row = rowOf(center) - radius; row <= rowOf(center) + radius; row += 1) {
    for (let col = colOf(center) - radius; col <= colOf(center) + radius; col += 1) {
      if (inBounds(row, col)) cells.push(indexOf(row, col))
    }
  }
  return cells
}

function colorCells(state: GameState, color: number) {
  const cells: number[] = []
  state.tiles.forEach((tile, i) => { if (tile && tile.c === color) cells.push(i) })
  return cells
}

function specialArea(state: GameState, i: number, tile: Tile) {
  if (tile.s === SPECIAL_ROW_ROCKET) return rowCells(rowOf(i))
  if (tile.s === SPECIAL_COL_ROCKET) return colCells(colOf(i))
  if (tile.s === SPECIAL_BOMB) return squareCells(i, 1)
  if (tile.s === SPECIAL_RAINBOW) return [i, ...colorCells(state, mostCommonColor(state))]
  return [i]
}

const SPECIAL_SCORE: Record<SpecialKind, number> = { 0: 0, 1: 120, 2: 120, 3: 200, 4: 400 }

function resolveClear(state: GameState, initial: Iterable<number>, cascade: number, spawns: Map<number, Tile>, frames: FrameSink) {
  const cleared = new Set<number>()
  const stoneHits = new Set<number>()
  const queue = [...initial]
  while (queue.length > 0) {
    const i = queue.pop() as number
    if (cleared.has(i)) continue
    if (state.stone[i] > 0) { stoneHits.add(i); continue }
    const tile = state.tiles[i]
    if (!tile) continue
    cleared.add(i)
    if (tile.s !== SPECIAL_NONE && !spawns.has(i)) {
      for (const cell of specialArea(state, i, tile)) if (!cleared.has(cell)) queue.push(cell)
    }
  }

  const multiplier = Math.min(cascade, 10)
  for (const i of cleared) {
    const tile = state.tiles[i] as Tile
    if (tile.c >= 0) state.collected[tile.c] += 1
    state.score += 60 * multiplier
    state.stats.tilesCleared += 1
    if (state.jelly[i] > 0) { state.jelly[i] -= 1; state.jellyCleared += 1 }
    state.tiles[i] = null
    const row = rowOf(i)
    const col = colOf(i)
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (inBounds(row + dr, col + dc)) {
        const neighbor = indexOf(row + dr, col + dc)
        if (state.stone[neighbor] > 0) stoneHits.add(neighbor)
      }
    }
  }

  for (const i of [...stoneHits].sort((a, b) => a - b)) {
    if (state.stone[i] <= 0) continue
    state.stone[i] -= 1
    state.score += 100 * multiplier
    if (state.stone[i] === 0) state.stonesBroken += 1
  }

  for (const [i, tile] of spawns) {
    state.tiles[i] = tile
    state.score += SPECIAL_SCORE[tile.s] * multiplier
    state.stats.specialsCreated += 1
    if (tile.s === SPECIAL_RAINBOW) state.stats.rainbowsCreated += 1
    else if (tile.s === SPECIAL_BOMB) state.stats.bombsCreated += 1
    else state.stats.rocketsCreated += 1
  }

  pushFrame(frames, state, 'clear', [...cleared, ...stoneHits], cascade)
}

function newTile(state: GameState): Tile {
  return { id: state.nextId++, c: randomInt(state, state.config.colors), s: SPECIAL_NONE }
}

function applyGravity(state: GameState, frames: FrameSink, cascade: number) {
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const cells: number[] = []
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const i = indexOf(row, col)
      if (state.stone[i] === 0) cells.push(i)
    }
    const remaining = cells.map((i) => state.tiles[i]).filter((tile): tile is Tile => tile !== null)
    cells.forEach((cell, k) => {
      state.tiles[cell] = k < remaining.length ? remaining[k] : newTile(state)
    })
  }
  pushFrame(frames, state, 'fall', [], cascade)
}

function runCascades(state: GameState, frames: FrameSink, startCascade: number, preferred: number[]) {
  let cascade = startCascade
  let first = true
  for (let guard = 0; guard < 60; guard += 1) {
    const groups = findMatchGroups(state.tiles)
    if (groups.length === 0) break
    const toClear = new Set<number>()
    const spawns = new Map<number, Tile>()
    for (const group of groups) {
      for (const cell of group.cells) toClear.add(cell)
      const special = decideSpecial(group)
      if (special === SPECIAL_NONE) continue
      const cell = chooseSpawnCell(state, group, special, first ? preferred : [])
      if (cell < 0 || spawns.has(cell)) continue
      spawns.set(cell, { id: state.nextId++, c: special === SPECIAL_RAINBOW ? -1 : group.color, s: special })
    }
    resolveClear(state, toClear, cascade, spawns, frames)
    applyGravity(state, frames, cascade)
    cascade += 1
    first = false
  }
  state.stats.maxCascade = Math.max(state.stats.maxCascade, cascade - 1)
}

function isAdjacent(a: number, b: number) {
  if (rowOf(a) === rowOf(b)) return Math.abs(colOf(a) - colOf(b)) === 1
  return colOf(a) === colOf(b) && Math.abs(rowOf(a) - rowOf(b)) === 1
}

function isCellIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < CELL_COUNT
}

export function isSwapCandidate(tiles: (Tile | null)[], a: number, b: number) {
  const ta = tiles[a]
  const tb = tiles[b]
  if (!ta || !tb) return false
  if (ta.s === SPECIAL_RAINBOW || tb.s === SPECIAL_RAINBOW) return true
  if (ta.s !== SPECIAL_NONE && tb.s !== SPECIAL_NONE) return true
  tiles[a] = tb
  tiles[b] = ta
  const valid = createsMatchAt(tiles, a) || createsMatchAt(tiles, b)
  tiles[a] = ta
  tiles[b] = tb
  return valid
}

export function findPossibleMoves(tiles: (Tile | null)[], limit = Infinity) {
  const moves: { a: number; b: number }[] = []
  for (let i = 0; i < CELL_COUNT && moves.length < limit; i += 1) {
    if (colOf(i) < BOARD_SIZE - 1 && isSwapCandidate(tiles, i, i + 1)) moves.push({ a: i, b: i + 1 })
    if (moves.length >= limit) break
    if (rowOf(i) < BOARD_SIZE - 1 && isSwapCandidate(tiles, i, i + BOARD_SIZE)) moves.push({ a: i, b: i + BOARD_SIZE })
  }
  return moves
}

function fillWithoutMatches(state: GameState) {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (state.stone[i] > 0) { state.tiles[i] = null; continue }
    const tile = newTile(state)
    state.tiles[i] = tile
    for (let attempt = 0; attempt < 12 && createsMatchAt(state.tiles, i); attempt += 1) {
      tile.c = randomInt(state, state.config.colors)
    }
  }
}

function ensurePlayable(state: GameState, frames: FrameSink) {
  if (findPossibleMoves(state.tiles, 1).length > 0) return
  const positions = state.tiles.map((tile, i) => (tile ? i : -1)).filter((i) => i >= 0)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pool = positions.map((i) => state.tiles[i] as Tile)
    for (let k = pool.length - 1; k > 0; k -= 1) {
      const swap = randomInt(state, k + 1)
      ;[pool[k], pool[swap]] = [pool[swap], pool[k]]
    }
    positions.forEach((cell, k) => { state.tiles[cell] = pool[k] })
    if (findMatchGroups(state.tiles).length === 0 && findPossibleMoves(state.tiles, 1).length > 0) {
      pushFrame(frames, state, 'shuffle')
      return
    }
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    fillWithoutMatches(state)
    if (findMatchGroups(state.tiles).length === 0 && findPossibleMoves(state.tiles, 1).length > 0) break
  }
  pushFrame(frames, state, 'shuffle')
}

export function createGame(config: LevelConfig, seed: number): GameState {
  const state: GameState = {
    config,
    tiles: new Array(CELL_COUNT).fill(null),
    jelly: [...config.jelly],
    stone: [...config.stone],
    rng: seed >>> 0,
    nextId: 1,
    score: 0,
    movesLeft: config.moves,
    movesUsed: 0,
    collected: new Array(MAX_COLORS).fill(0),
    jellyCleared: 0,
    stonesBroken: 0,
    stats: { specialsCreated: 0, rocketsCreated: 0, bombsCreated: 0, rainbowsCreated: 0, maxCascade: 0, tilesCleared: 0 },
    boostersUsed: emptyBoosterCounts(),
    status: 'playing',
    bonusScore: 0,
  }
  fillWithoutMatches(state)
  ensurePlayable(state, null)
  return state
}

export function goalProgress(state: GameState, goal: LevelGoal) {
  if (goal.type === 'score') return { current: Math.min(state.score, goal.target), target: goal.target }
  if (goal.type === 'collect') return { current: Math.min(state.collected[goal.color] ?? 0, goal.count), target: goal.count }
  if (goal.type === 'jelly') return { current: Math.min(state.jellyCleared, goal.count), target: goal.count }
  return { current: Math.min(state.stonesBroken, goal.count), target: goal.count }
}

export function goalsComplete(state: GameState) {
  return state.config.goals.every((goal) => {
    const progress = goalProgress(state, goal)
    return progress.current >= progress.target
  })
}

export function starsForState(state: GameState) {
  if (state.status !== 'won') return 0
  if (state.score >= state.config.stars[2]) return 3
  if (state.score >= state.config.stars[1]) return 2
  return 1
}

function finishTurn(state: GameState, frames: FrameSink) {
  if (goalsComplete(state)) {
    state.bonusScore = state.movesLeft * 250
    state.score += state.bonusScore
    state.status = 'won'
    return
  }
  if (state.movesLeft <= 0) {
    state.status = 'lost'
    return
  }
  ensurePlayable(state, frames)
}

function neutralize(tile: Tile | null) {
  if (tile) { tile.s = SPECIAL_NONE; if (tile.c < 0) tile.c = -1 }
}

function comboArea(state: GameState, a: number, b: number): number[] | null {
  const moved = state.tiles[b] as Tile
  const target = state.tiles[a] as Tile
  const bothSpecial = moved.s !== SPECIAL_NONE && target.s !== SPECIAL_NONE
  const hasRainbow = moved.s === SPECIAL_RAINBOW || target.s === SPECIAL_RAINBOW
  if (!bothSpecial && !hasRainbow) return null

  if (moved.s === SPECIAL_RAINBOW && target.s === SPECIAL_RAINBOW) {
    neutralize(moved)
    neutralize(target)
    return Array.from({ length: CELL_COUNT }, (_, i) => i)
  }

  if (hasRainbow) {
    const rainbowCell = moved.s === SPECIAL_RAINBOW ? b : a
    const otherCell = rainbowCell === b ? a : b
    const other = state.tiles[otherCell] as Tile
    const rainbow = state.tiles[rainbowCell] as Tile
    rainbow.s = SPECIAL_NONE
    const cells = colorCells(state, other.c).filter((cell) => cell !== otherCell)
    if (other.s === SPECIAL_NONE) return [rainbowCell, otherCell, ...cells]
    const transform = other.s
    neutralize(other)
    cells.forEach((cell, k) => {
      const tile = state.tiles[cell] as Tile
      if (tile.s !== SPECIAL_NONE) return
      tile.s = transform === SPECIAL_BOMB ? SPECIAL_BOMB : (k % 2 === 0 ? SPECIAL_ROW_ROCKET : SPECIAL_COL_ROCKET)
    })
    return [rainbowCell, otherCell, ...cells]
  }

  const kinds = [moved.s, target.s]
  neutralize(moved)
  neutralize(target)
  const rockets = kinds.filter((kind) => kind === SPECIAL_ROW_ROCKET || kind === SPECIAL_COL_ROCKET).length
  const bombs = kinds.filter((kind) => kind === SPECIAL_BOMB).length
  const row = rowOf(b)
  const col = colOf(b)
  if (rockets === 2) return [a, ...rowCells(row), ...colCells(col)]
  if (bombs === 2) return [a, ...squareCells(b, 2)]
  const cells = [a]
  for (let offset = -1; offset <= 1; offset += 1) {
    if (row + offset >= 0 && row + offset < BOARD_SIZE) cells.push(...rowCells(row + offset))
    if (col + offset >= 0 && col + offset < BOARD_SIZE) cells.push(...colCells(col + offset))
  }
  return cells
}

function boosterArea(state: GameState, code: BoosterCode, i: number): number[] | null {
  const tile = state.tiles[i]
  if (!tile && state.stone[i] <= 0) return null
  if (code === 'hammer') return [i]
  if (code === 'bomb') return squareCells(i, 1)
  if (code === 'rowRocket') return rowCells(rowOf(i))
  if (code === 'colRocket') return colCells(colOf(i))
  if (!tile || tile.c < 0) return null
  return colorCells(state, tile.c)
}

export function applyAction(state: GameState, action: GameAction, frames: FrameSink = null): boolean {
  if (state.status !== 'playing' || !action || typeof action !== 'object') return false

  if (action.t === 'swap') {
    const { a, b } = action
    if (!isCellIndex(a) || !isCellIndex(b) || !isAdjacent(a, b)) return false
    const ta = state.tiles[a]
    const tb = state.tiles[b]
    if (!ta || !tb || state.stone[a] > 0 || state.stone[b] > 0) return false
    state.tiles[a] = tb
    state.tiles[b] = ta
    pushFrame(frames, state, 'swap')

    const combo = comboArea(state, a, b)
    if (combo) {
      resolveClear(state, combo, 1, new Map(), frames)
      applyGravity(state, frames, 1)
      runCascades(state, frames, 2, [])
    } else {
      if (findMatchGroups(state.tiles).length === 0) {
        state.tiles[a] = ta
        state.tiles[b] = tb
        pushFrame(frames, state, 'swapBack')
        return false
      }
      runCascades(state, frames, 1, [a, b])
    }
    state.movesLeft -= 1
    state.movesUsed += 1
    finishTurn(state, frames)
    return true
  }

  if (action.t === 'boost') {
    if (!isBoosterCode(action.b) || !isCellIndex(action.i)) return false
    const area = boosterArea(state, action.b, action.i)
    if (!area) return false
    resolveClear(state, area, 1, new Map(), frames)
    applyGravity(state, frames, 1)
    runCascades(state, frames, 2, [])
    state.boostersUsed[action.b] += 1
    finishTurn(state, frames)
    return true
  }

  return false
}

export function replayGame(config: LevelConfig, seed: number, actions: GameAction[]) {
  const state = createGame(config, seed)
  for (let k = 0; k < actions.length; k += 1) {
    if (!applyAction(state, actions[k])) return { state, invalidAt: k }
  }
  return { state, invalidAt: -1 }
}
