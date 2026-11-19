'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, Bomb, Flag, Hammer, MoveHorizontal, MoveVertical, Rainbow, type LucideIcon } from 'lucide-react'
import {
  BOARD_SIZE,
  BOOSTER_CODES,
  applyAction,
  createGame,
  goalProgress,
  type BoosterCode,
  type BoosterCounts,
  type Frame,
  type GameAction,
  type GameState,
  type LevelConfig,
  type LevelGoal,
  type Tile,
} from '@/lib/pepe-crush/engine'
import { BOOSTER_INFO } from '@/lib/pepe-crush/catalog'
import { CandyPiece, candyLabel } from './candy-piece'

export type CrushSession = { sessionId: string; seed: number; config: LevelConfig; tier: { name: string; nameRu: string } }

export type CrushFinishResult =
  | { ok: false; reason: 'expired' | 'invalid' | 'error'; message?: string }
  | {
      ok: true
      won: boolean
      level: number
      score: number
      stars: number
      firstCompletion: boolean
      levelReward: number
      boosterRewards: Partial<BoosterCounts> | null
      achievements: { code: string; ru: string; en: string; reward: number }[]
      achievementReward: number
      nextLevel: number
    }

const BOOSTER_ICONS: Record<BoosterCode, LucideIcon> = {
  hammer: Hammer,
  bomb: Bomb,
  rainbow: Rainbow,
  rowRocket: MoveHorizontal,
  colRocket: MoveVertical,
}

const FRAME_DELAY: Record<Frame['kind'], number> = { swap: 170, swapBack: 190, clear: 230, fall: 250, shuffle: 360 }

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

type Display = { tiles: (Tile | null)[]; jelly: number[]; stone: number[]; score: number }

function snapshot(state: GameState): Display {
  return { tiles: [...state.tiles], jelly: [...state.jelly], stone: [...state.stone], score: state.score }
}

function GoalChip({ goal, state, ru }: { goal: LevelGoal; state: GameState; ru: boolean }) {
  const { current, target } = goalProgress(state, goal)
  const done = current >= target
  let label: React.ReactNode
  if (goal.type === 'score') label = ru ? 'Очки' : 'Score'
  else if (goal.type === 'jelly') label = <span className="inline-block h-4 w-4 rounded bg-pink-400/80" aria-label={ru ? 'Желе' : 'Jelly'} />
  else if (goal.type === 'stone') label = <span className="inline-block h-4 w-4 rounded bg-stone-400" aria-label={ru ? 'Камни' : 'Stones'} />
  else label = <span className="inline-block h-5 w-5"><CandyPiece tile={{ id: 0, c: goal.color, s: 0 }} /></span>
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${done ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white'}`}>
      {label}
      <span className="tabular-nums">{goal.type === 'score' ? `${current.toLocaleString()}/${target.toLocaleString()}` : `${current}/${target}`}</span>
    </div>
  )
}

export function GameBoard({
  session,
  inventory,
  ru,
  onExit,
  onFinished,
}: {
  session: CrushSession
  inventory: BoosterCounts
  ru: boolean
  onExit: () => void
  onFinished: (result: CrushFinishResult) => void
}) {
  const gameRef = useRef<GameState>(createGame(session.config, session.seed))
  const actionsRef = useRef<GameAction[]>([])
  const pointerRef = useRef<{ index: number; x: number; y: number } | null>(null)
  const finishingRef = useRef(false)
  const [display, setDisplay] = useState<Display>(() => snapshot(gameRef.current))
  const [, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [booster, setBooster] = useState<BoosterCode | null>(null)
  const [bursts, setBursts] = useState<{ key: number; cells: number[] } | null>(null)
  const [combo, setCombo] = useState<{ key: number; cascade: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const burstKey = useRef(0)

  const game = gameRef.current
  const available = (code: BoosterCode) => Math.max(0, inventory[code] - game.boostersUsed[code])

  const submit = useCallback(async (gaveUp: boolean) => {
    if (finishingRef.current) return
    finishingRef.current = true
    setSubmitting(true)
    try {
      const response = await fetch('/api/pepe-crush/session/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, actions: actionsRef.current, gaveUp }),
      })
      const payload = await response.json().catch(() => null)
      if (payload && typeof payload.ok === 'boolean') onFinished(payload as CrushFinishResult)
      else onFinished({ ok: false, reason: 'error', message: payload?.error })
    } catch {
      onFinished({ ok: false, reason: 'error' })
    }
  }, [onFinished, session.sessionId])

  const play = useCallback(async (action: GameAction) => {
    if (busy || finishingRef.current) return
    const frames: Frame[] = []
    const accepted = applyAction(gameRef.current, action, frames)
    if (!accepted && frames.length === 0) return
    if (accepted) actionsRef.current.push(action)
    setBusy(true)
    setSelected(null)
    setBooster(null)
    for (const frame of frames) {
      setDisplay({ tiles: frame.tiles, jelly: frame.jelly, stone: frame.stone, score: frame.score })
      if (frame.kind === 'clear' && frame.cleared.length > 0) {
        burstKey.current += 1
        setBursts({ key: burstKey.current, cells: frame.cleared })
        if (frame.cascade >= 2) setCombo({ key: burstKey.current, cascade: frame.cascade })
      }
      await sleep(FRAME_DELAY[frame.kind])
    }
    setDisplay(snapshot(gameRef.current))
    setTick((value) => value + 1)
    setBusy(false)
    if (gameRef.current.status !== 'playing') {
      await sleep(500)
      void submit(false)
    }
  }, [busy, submit])

  const handleCell = (index: number) => {
    if (busy || submitting) return
    if (booster) {
      if (available(booster) <= 0) { setBooster(null); return }
      void play({ t: 'boost', b: booster, i: index })
      return
    }
    if (selected === null) { setSelected(index); return }
    if (selected === index) { setSelected(null); return }
    const dr = Math.abs((selected >> 3) - (index >> 3))
    const dc = Math.abs((selected & 7) - (index & 7))
    if (dr + dc === 1) void play({ t: 'swap', a: selected, b: index })
    else setSelected(index)
  }

  const onPointerDown = (event: ReactPointerEvent, index: number) => {
    pointerRef.current = { index, x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    const start = pointerRef.current
    pointerRef.current = null
    if (!start || busy || booster) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    const row = start.index >> 3
    const col = start.index & 7
    let target = -1
    if (Math.abs(dx) > Math.abs(dy)) target = dx > 0 && col < 7 ? start.index + 1 : dx < 0 && col > 0 ? start.index - 1 : -1
    else target = dy > 0 && row < 7 ? start.index + 8 : dy < 0 && row > 0 ? start.index - 8 : -1
    if (target >= 0) {
      event.preventDefault()
      void play({ t: 'swap', a: start.index, b: target })
    }
  }

  useEffect(() => {
    if (!bursts) return
    const timer = window.setTimeout(() => setBursts(null), 420)
    return () => window.clearTimeout(timer)
  }, [bursts])

  useEffect(() => {
    if (!combo) return
    const timer = window.setTimeout(() => setCombo(null), 900)
    return () => window.clearTimeout(timer)
  }, [combo])

  const [s1, s2, s3] = session.config.stars
  const starProgress = Math.min(100, (display.score / s3) * 100)
  const tiles = display.tiles
    .map((tile, index) => (tile ? { tile, index } : null))
    .filter((entry): entry is { tile: Tile; index: number } => entry !== null)

  return (
    <div className="crush-root mx-auto flex w-full max-w-[760px] flex-col gap-3">
      <div className="crush-game-toolbar flex items-center justify-between gap-2">
        <button type="button" onClick={onExit} disabled={busy || submitting} className="crush-btn-ghost">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {ru ? 'Карта' : 'Map'}
        </button>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime-300/80">{ru ? session.tier.nameRu : session.tier.name}</p>
          <h2 className="text-lg font-black text-white">{ru ? 'Уровень' : 'Level'} {session.config.level.toLocaleString()}</h2>
        </div>
        <button type="button" onClick={() => void submit(true)} disabled={busy || submitting} className="crush-btn-ghost">
          <Flag className="h-4 w-4" aria-hidden="true" />
          {ru ? 'Сдаться' : 'Give up'}
        </button>
      </div>

      <div className="crush-status grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="flex flex-col items-center rounded-xl bg-lime-400/15 px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase text-lime-200/80">{ru ? 'Ходы' : 'Moves'}</span>
          <span className={`text-2xl font-black tabular-nums ${game.movesLeft <= 3 ? 'text-rose-300' : 'text-white'}`}>{game.movesLeft}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-black tabular-nums text-white">{display.score.toLocaleString()}</span>
            <span className="text-[11px] text-white/50">{ru ? 'очков' : 'points'}</span>
          </div>
          <div className="relative mt-1 h-2.5 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-yellow-300 transition-[width] duration-300" style={{ width: `${starProgress}%` }} />
            {[s1, s2, s3].map((threshold, k) => (
              <span key={k} className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm ${display.score >= threshold ? 'text-yellow-300' : 'text-white/30'}`} style={{ left: `${Math.min(97, (threshold / s3) * 100)}%` }} aria-hidden="true">★</span>
            ))}
          </div>
        </div>
        <div className="flex max-w-[220px] flex-wrap justify-end gap-1.5">
          {session.config.goals.map((goal, k) => <GoalChip key={k} goal={goal} state={game} ru={ru} />)}
        </div>
      </div>

      <div className="crush-board-frame">
        <div className="crush-board" onPointerUp={onPointerUp} onPointerLeave={() => { pointerRef.current = null }} role="grid" aria-label={ru ? 'Игровое поле 8 на 8' : '8 by 8 game board'}>
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => (
            <button
              key={`cell-${index}`}
              type="button"
              className={`crush-cell ${(index + (index >> 3)) % 2 === 0 ? 'crush-cell-a' : 'crush-cell-b'} ${display.jelly[index] > 0 ? (display.jelly[index] > 1 ? 'crush-jelly-2' : 'crush-jelly-1') : ''}`}
              style={{ left: `${(index & 7) * 12.5}%`, top: `${(index >> 3) * 12.5}%` }}
              onClick={() => handleCell(index)}
              onPointerDown={(event) => onPointerDown(event, index)}
              aria-label={display.tiles[index] ? candyLabel(display.tiles[index] as Tile, ru) : display.stone[index] > 0 ? (ru ? 'Камень' : 'Stone') : (ru ? 'Пусто' : 'Empty')}
            />
          ))}
          {tiles.map(({ tile, index }) => (
            <div
              key={tile.id}
              className="crush-tile"
              style={{ transform: `translate(${(index & 7) * 100}%, ${(index >> 3) * 100}%)` }}
              aria-hidden="true"
            >
              <CandyPiece tile={tile} selected={selected === index} />
            </div>
          ))}
          {display.stone.map((hits, index) => hits > 0 ? (
            <div key={`stone-${index}`} className="crush-stone" style={{ left: `${(index & 7) * 12.5}%`, top: `${(index >> 3) * 12.5}%` }} aria-hidden="true">
              <span className={hits > 1 ? 'crush-stone-heavy' : ''} />
            </div>
          ) : null)}
          {bursts ? bursts.cells.map((index) => (
            <span key={`${bursts.key}-${index}`} className="crush-burst" style={{ left: `${(index & 7) * 12.5}%`, top: `${(index >> 3) * 12.5}%` }} aria-hidden="true" />
          )) : null}
          {combo ? (
            <div key={combo.key} className="crush-combo" aria-live="polite">
              {combo.cascade >= 5 ? (ru ? 'НЕВЕРОЯТНО!' : 'INCREDIBLE!') : combo.cascade >= 4 ? (ru ? 'ПОТРЯСАЮЩЕ!' : 'AWESOME!') : combo.cascade >= 3 ? (ru ? 'ОТЛИЧНО!' : 'GREAT!') : (ru ? 'КОМБО!' : 'COMBO!')}
              <span className="block text-sm">x{combo.cascade}</span>
            </div>
          ) : null}
          {submitting ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/50 text-sm font-bold text-white">
              {ru ? 'Проверяем результат на сервере...' : 'Verifying result on the server...'}
            </div>
          ) : null}
        </div>
      </div>

      <div className="crush-booster-tray grid grid-cols-5 gap-2" role="toolbar" aria-label={ru ? 'Бустеры' : 'Boosters'}>
        {BOOSTER_CODES.map((code) => {
          const Icon = BOOSTER_ICONS[code]
          const count = available(code)
          const active = booster === code
          return (
            <button
              key={code}
              type="button"
              disabled={busy || submitting || count <= 0}
              onClick={() => { setSelected(null); setBooster(active ? null : code) }}
              aria-pressed={active}
              title={ru ? BOOSTER_INFO[code].descRu : BOOSTER_INFO[code].descEn}
              className={`relative flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-bold transition ${active ? 'border-yellow-300 bg-yellow-300/20 text-yellow-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'} disabled:opacity-40`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="line-clamp-1">{ru ? BOOSTER_INFO[code].ru : BOOSTER_INFO[code].en}</span>
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-lime-400 px-1 text-[10px] font-black text-black">{count}</span>
            </button>
          )
        })}
      </div>
      <p className="min-h-5 text-center text-xs text-white/60" aria-live="polite">
        {booster ? (ru ? `${BOOSTER_INFO[booster].ru}: выберите клетку на поле` : `${BOOSTER_INFO[booster].en}: choose a cell`) : (ru ? 'Меняйте соседние фишки местами, чтобы собрать 3 и более в ряд' : 'Swap neighbouring pieces to line up 3 or more')}
      </p>
    </div>
  )
}
