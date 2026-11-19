'use client'

import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Award, CalendarCheck, ChevronLeft, ChevronRight, Coins, Crosshair, Lock, Map as MapIcon, ShoppingBag, Star, Trophy } from 'lucide-react'
import { BOOSTER_CODES, emptyBoosterCounts, type BoosterCode, type BoosterCounts } from '@/lib/pepe-crush/engine'
import { BOOSTER_INFO } from '@/lib/pepe-crush/catalog'
import { useSiteLanguage } from '@/components/site-language-provider'
import { GameBoard, type CrushFinishResult, type CrushSession } from './game-board'

type CrushState = {
  profile: {
    currentLevel: number
    levelsCompleted: number
    totalStars: number
    totalScore: number
    bestScore: number
    wins: number
    losses: number
    threeStarLevels: number
    coins: number
    boosters: BoosterCounts
    achievements: string[]
    streak: number
  }
  tier: { name: string; nameRu: string }
  daily: {
    canClaimBonus: boolean
    streak: number
    nextRewardDay: number
    rewards: { coins: number; boosters?: Partial<BoosterCounts> }[]
    missions: { code: string; target: number; reward: number; ru: string; en: string; progress: number; claimed: boolean }[]
  }
  achievements: { code: string; ru: string; en: string; target: number; coins: number; unlocked: boolean; progress: number }[]
  shop: { code: BoosterCode; price: number }[]
}

type LeaderboardData = {
  entries: { rank: number; displayName: string; avatarSrc: string | null; levels: number; score: number; stars: number; isCurrentUser: boolean }[]
  me: { rank: number | null; levels: number; score: number; stars: number } | null
}

type Tab = 'map' | 'daily' | 'shop' | 'leaderboard' | 'achievements'

const PAGE_SIZE = 30

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'Request failed')
  return payload as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'Request failed')
  return payload as T
}

function Stars({ count, size = 'h-3.5 w-3.5' }: { count: number; size?: string }) {
  return (
    <span className="flex gap-0.5" aria-label={`${count}/3`}>
      {[0, 1, 2].map((k) => <Star key={k} className={`${size} ${k < count ? 'fill-yellow-300 text-yellow-300' : 'text-white/25'}`} aria-hidden="true" />)}
    </span>
  )
}

function LevelMap({ current, ru, onPlay }: { current: number; ru: boolean; onPlay: (level: number) => void }) {
  const [page, setPage] = useState(() => Math.floor((current - 1) / PAGE_SIZE))
  const from = page * PAGE_SIZE + 1
  const { data } = useSWR<{ results: { level: number; stars: number; bestScore: number }[] }>(`/api/pepe-crush/levels?from=${from}&count=${PAGE_SIZE}`, fetchJson)
  const results = useMemo(() => new Map((data?.results ?? []).map((row) => [row.level, row])), [data])
  const levels = Array.from({ length: PAGE_SIZE }, (_, k) => from + k)
  const lastPage = Math.floor((current - 1) / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="crush-btn-ghost" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />{ru ? 'Назад' : 'Prev'}
        </button>
        <div className="text-center">
          <p className="text-sm font-black text-white">{ru ? 'Уровни' : 'Levels'} {from.toLocaleString()}–{(from + PAGE_SIZE - 1).toLocaleString()}</p>
          {page !== lastPage ? (
            <button type="button" onClick={() => setPage(lastPage)} className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-lime-300 hover:underline">
              <Crosshair className="h-3 w-3" aria-hidden="true" />{ru ? 'К текущему уровню' : 'Go to current level'}
            </button>
          ) : null}
        </div>
        <button type="button" className="crush-btn-ghost" onClick={() => setPage((value) => value + 1)}>
          {ru ? 'Далее' : 'Next'}<ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <ol className="crush-map grid grid-cols-5 gap-x-2 gap-y-4 sm:grid-cols-6">
        {levels.map((level, k) => {
          const result = results.get(level)
          const locked = level > current
          const isCurrent = level === current
          const offset = Math.round(Math.sin(k * 0.9) * 8)
          return (
            <li key={level} className="flex justify-center" style={{ transform: `translateY(${offset}px)` }}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onPlay(level)}
                aria-label={`${ru ? 'Уровень' : 'Level'} ${level}${locked ? (ru ? ', закрыт' : ', locked') : result ? `, ${result.stars} ${ru ? 'звезды' : 'stars'}` : ''}`}
                className={`crush-node ${locked ? 'crush-node-locked' : result ? 'crush-node-done' : 'crush-node-open'} ${isCurrent ? 'crush-node-current' : ''}`}
              >
                {locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <span className="text-sm font-black tabular-nums">{level > 9999 ? `${Math.floor(level / 1000)}k` : level}</span>}
                {result ? <span className="absolute -bottom-3"><Stars count={result.stars} size="h-3 w-3" /></span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function DailyPanel({ state, ru, onChange }: { state: CrushState; ru: boolean; onChange: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const claim = async (body: { kind: 'bonus' } | { kind: 'mission'; code: string }, key: string) => {
    setPending(key)
    setMessage(null)
    try {
      await postJson('/api/pepe-crush/daily', body)
      setMessage(ru ? 'Награда получена!' : 'Reward claimed!')
      onChange()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error')
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="space-y-4">
      <section className="crush-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-white">{ru ? 'Ежедневный бонус' : 'Daily bonus'}</h3>
            <p className="text-xs text-white/60">{ru ? `Серия: ${state.daily.streak} дн.` : `Streak: ${state.daily.streak} days`}</p>
          </div>
          <button type="button" className="crush-btn-primary" disabled={!state.daily.canClaimBonus || pending !== null} onClick={() => void claim({ kind: 'bonus' }, 'bonus')}>
            {state.daily.canClaimBonus ? (ru ? 'Забрать' : 'Claim') : (ru ? 'Получено' : 'Claimed')}
          </button>
        </div>
        <ol className="mt-3 grid grid-cols-7 gap-1.5">
          {state.daily.rewards.map((reward, k) => (
            <li key={k} className={`rounded-lg border p-1.5 text-center text-[10px] font-bold ${k + 1 === state.daily.nextRewardDay && state.daily.canClaimBonus ? 'border-yellow-300 bg-yellow-300/15 text-yellow-100' : 'border-white/10 bg-white/5 text-white/70'}`}>
              <span className="block">{ru ? 'День' : 'Day'} {k + 1}</span>
              <span className="block text-xs text-white">{reward.coins}</span>
              {reward.boosters ? <span className="block text-lime-300">+{ru ? 'бустер' : 'boost'}</span> : null}
            </li>
          ))}
        </ol>
      </section>
      <section className="crush-panel space-y-2">
        <h3 className="font-black text-white">{ru ? 'Задания дня' : 'Daily missions'}</h3>
        {state.daily.missions.map((mission) => {
          const done = mission.progress >= mission.target
          return (
            <div key={mission.code} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{ru ? mission.ru : mission.en}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-lime-400" style={{ width: `${(mission.progress / mission.target) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-white/50 tabular-nums">{mission.progress.toLocaleString()}/{mission.target.toLocaleString()} · +{mission.reward} PEPE Coins</p>
              </div>
              <button type="button" className="crush-btn-primary" disabled={!done || mission.claimed || pending !== null} onClick={() => void claim({ kind: 'mission', code: mission.code }, mission.code)}>
                {mission.claimed ? (ru ? 'Готово' : 'Done') : (ru ? 'Забрать' : 'Claim')}
              </button>
            </div>
          )
        })}
      </section>
      {message ? <p className="text-center text-sm text-lime-200" role="status">{message}</p> : null}
    </div>
  )
}

function ShopPanel({ state, ru, onChange }: { state: CrushState; ru: boolean; onChange: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const buy = async (code: BoosterCode) => {
    setPending(code)
    setMessage(null)
    try {
      await postJson('/api/pepe-crush/shop', { code })
      setMessage(ru ? 'Бустер куплен!' : 'Booster purchased!')
      onChange()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error')
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/60">{ru ? 'PEPE Coins — внутренняя игровая валюта. Её нельзя вывести, она не влияет на баланс кошелька.' : 'PEPE Coins are an in-game currency. They cannot be withdrawn and do not change your wallet balance.'}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {state.shop.map(({ code, price }) => (
          <div key={code} className="crush-panel flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white">{ru ? BOOSTER_INFO[code].ru : BOOSTER_INFO[code].en}</p>
              <p className="text-xs text-white/60">{ru ? BOOSTER_INFO[code].descRu : BOOSTER_INFO[code].descEn}</p>
              <p className="mt-1 text-[11px] text-lime-300">{ru ? 'В наличии' : 'Owned'}: {state.profile.boosters[code] ?? 0}</p>
            </div>
            <button type="button" className="crush-btn-primary" disabled={pending !== null || state.profile.coins < price} onClick={() => void buy(code)}>
              <Coins className="h-4 w-4" aria-hidden="true" />{price}
            </button>
          </div>
        ))}
      </div>
      {message ? <p className="text-center text-sm text-lime-200" role="status">{message}</p> : null}
    </div>
  )
}

function LeaderboardPanel({ ru }: { ru: boolean }) {
  const [scope, setScope] = useState<'all' | 'weekly'>('weekly')
  const [metric, setMetric] = useState<'levels' | 'score' | 'stars'>('levels')
  const { data, error, isLoading } = useSWR<LeaderboardData>(`/api/pepe-crush/leaderboard?scope=${scope}&metric=${metric}`, fetchJson)
  const metricLabel = { levels: ru ? 'Уровни' : 'Levels', score: ru ? 'Очки' : 'Score', stars: ru ? 'Звёзды' : 'Stars' }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['weekly', 'all'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)} className={scope === value ? 'crush-btn-primary' : 'crush-btn-ghost'}>
            {value === 'weekly' ? (ru ? 'Неделя' : 'Weekly') : (ru ? 'За всё время' : 'All time')}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" aria-hidden="true" />
        {(['levels', 'score', 'stars'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} className={metric === value ? 'crush-btn-primary' : 'crush-btn-ghost'}>
            {metricLabel[value]}
          </button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-white/60">{ru ? 'Загрузка...' : 'Loading...'}</p> : null}
      {error ? <p className="text-sm text-rose-300">{ru ? 'Не удалось загрузить рейтинг.' : 'Could not load leaderboard.'}</p> : null}
      {data ? (
        <ol className="space-y-1.5">
          {data.entries.length === 0 ? <li className="text-sm text-white/60">{ru ? 'Пока нет игроков в рейтинге.' : 'No players ranked yet.'}</li> : null}
          {data.entries.map((entry) => (
            <li key={entry.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${entry.isCurrentUser ? 'bg-lime-400/15 ring-1 ring-lime-400/40' : 'bg-white/5'}`}>
              <span className={`w-7 text-center text-sm font-black ${entry.rank <= 3 ? 'text-yellow-300' : 'text-white/60'}`}>{entry.rank}</span>
              {entry.avatarSrc ? <img src={entry.avatarSrc} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full bg-white/10" />}
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{entry.displayName}</span>
              <span className="text-sm font-black tabular-nums text-lime-200">{entry[metric].toLocaleString()}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {data?.me && !data.entries.some((entry) => entry.isCurrentUser) ? (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80">{ru ? 'Ваше место' : 'Your rank'}: <b>{data.me.rank ?? '—'}</b> · {data.me[metric].toLocaleString()}</p>
      ) : null}
    </div>
  )
}

function AchievementsPanel({ state, ru }: { state: CrushState; ru: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {state.achievements.map((achievement) => (
        <li key={achievement.code} className={`crush-panel flex items-center gap-3 ${achievement.unlocked ? '' : 'opacity-70'}`}>
          <Award className={`h-8 w-8 shrink-0 ${achievement.unlocked ? 'text-yellow-300' : 'text-white/30'}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white">{ru ? achievement.ru : achievement.en}</p>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-yellow-300" style={{ width: `${(achievement.progress / achievement.target) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-white/50 tabular-nums">{achievement.progress}/{achievement.target} · +{achievement.coins} PEPE Coins</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ResultModal({ result, ru, onClose, onNext, onRetry }: { result: CrushFinishResult; ru: boolean; onClose: () => void; onNext: () => void; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="crush-result-title">
      <div className="crush-result w-full max-w-sm rounded-3xl p-6 text-center">
        {result.ok ? (
          <>
            <h2 id="crush-result-title" className={`text-3xl font-black ${result.won ? 'text-lime-300' : 'text-rose-300'}`}>
              {result.won ? (ru ? 'ПОБЕДА!' : 'LEVEL CLEARED!') : (ru ? 'Не получилось' : 'Out of moves')}
            </h2>
            <p className="mt-1 text-sm text-white/70">{ru ? 'Уровень' : 'Level'} {result.level.toLocaleString()}</p>
            {result.won ? <div className="mt-4 flex justify-center"><Stars count={result.stars} size="h-10 w-10" /></div> : null}
            <p className="mt-4 text-2xl font-black tabular-nums text-white">{result.score.toLocaleString()}</p>
            <p className="text-xs text-white/50">{ru ? 'очков (проверено сервером)' : 'points (server verified)'}</p>
            {result.coinsEarned + result.achievementCoins > 0 ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-yellow-300/15 px-3 py-1 text-sm font-bold text-yellow-200">
                <Coins className="h-4 w-4" aria-hidden="true" />+{result.coinsEarned + result.achievementCoins} PEPE Coins
              </p>
            ) : null}
            {result.boosterRewards ? (
              <p className="mt-2 text-sm text-lime-200">{ru ? 'Бонус' : 'Bonus'}: {Object.entries(result.boosterRewards).map(([code, n]) => `${ru ? BOOSTER_INFO[code as BoosterCode].ru : BOOSTER_INFO[code as BoosterCode].en} x${n}`).join(', ')}</p>
            ) : null}
            {result.achievements.map((achievement) => (
              <p key={achievement.code} className="mt-2 text-sm font-bold text-yellow-200">{ru ? 'Достижение' : 'Achievement'}: {ru ? achievement.ru : achievement.en}</p>
            ))}
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" className="crush-btn-ghost" onClick={onClose}>{ru ? 'Карта' : 'Map'}</button>
              <button type="button" className="crush-btn-ghost" onClick={onRetry}>{ru ? 'Ещё раз' : 'Retry'}</button>
              {result.won ? <button type="button" className="crush-btn-primary" onClick={onNext}>{ru ? 'Дальше' : 'Next level'}</button> : null}
            </div>
          </>
        ) : (
          <>
            <h2 id="crush-result-title" className="text-2xl font-black text-rose-300">{ru ? 'Результат не засчитан' : 'Result not accepted'}</h2>
            <p className="mt-2 text-sm text-white/70">
              {result.reason === 'expired' ? (ru ? 'Игровая сессия истекла. Начните уровень заново.' : 'The session expired. Please restart the level.') : result.message ?? (ru ? 'Сервер не подтвердил ходы этой партии.' : 'The server could not verify this game.')}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" className="crush-btn-ghost" onClick={onClose}>{ru ? 'Карта' : 'Map'}</button>
              <button type="button" className="crush-btn-primary" onClick={onRetry}>{ru ? 'Ещё раз' : 'Retry'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function PepeCrushPage({ onBack }: { onBack: () => void }) {
  const { language } = useSiteLanguage()
  const ru = language === 'ru'
  const { data: state, error, mutate } = useSWR<CrushState>('/api/pepe-crush/state', fetchJson)
  const [tab, setTab] = useState<Tab>('map')
  const [session, setSession] = useState<CrushSession | null>(null)
  const [result, setResult] = useState<CrushFinishResult | null>(null)
  const [lastLevel, setLastLevel] = useState<number | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const startLevel = useCallback(async (level: number) => {
    setStarting(true)
    setStartError(null)
    setResult(null)
    try {
      const next = await postJson<CrushSession>('/api/pepe-crush/session/start', { level })
      setLastLevel(level)
      setSession(next)
    } catch (startFailure) {
      setStartError(startFailure instanceof Error ? startFailure.message : 'Error')
    } finally {
      setStarting(false)
    }
  }, [])

  const handleFinished = useCallback((finish: CrushFinishResult) => {
    setResult(finish)
    void mutate()
  }, [mutate])

  const tabs: { id: Tab; label: string; icon: typeof MapIcon }[] = [
    { id: 'map', label: ru ? 'Карта' : 'Map', icon: MapIcon },
    { id: 'daily', label: ru ? 'Задания' : 'Daily', icon: CalendarCheck },
    { id: 'shop', label: ru ? 'Магазин' : 'Shop', icon: ShoppingBag },
    { id: 'leaderboard', label: ru ? 'Рейтинг' : 'Ranking', icon: Trophy },
    { id: 'achievements', label: ru ? 'Достижения' : 'Awards', icon: Award },
  ]

  const inventory = state?.profile.boosters ?? emptyBoosterCounts()

  return (
    <main id="top" className="crush-shell dashboard-page-shell">
      <div className="relative z-10 space-y-5 p-4 sm:p-6">
        {session && !result ? (
          <GameBoard key={session.sessionId} session={session} inventory={inventory} ru={ru} onExit={() => setSession(null)} onFinished={handleFinished} />
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={onBack} className="crush-btn-ghost" aria-label={ru ? 'Вернуться на сайт' : 'Back to site'}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{ru ? 'На сайт' : 'Back'}
                </button>
                <div>
                  <h1 className="crush-title text-3xl font-black tracking-tight sm:text-4xl">PEPE CRUSH</h1>
                  <p className="text-xs text-white/60">{state ? (ru ? state.tier.nameRu : state.tier.name) : '\u00a0'}</p>
                </div>
              </div>
              {state ? (
                <button type="button" className="crush-btn-primary px-5 py-3 text-base" disabled={starting} onClick={() => void startLevel(state.profile.currentLevel)}>
                  {starting ? (ru ? 'Загрузка...' : 'Loading...') : `${ru ? 'Играть' : 'Play'} · ${ru ? 'ур.' : 'Lv'} ${state.profile.currentLevel.toLocaleString()}`}
                </button>
              ) : null}
            </header>

            {error ? <p className="crush-panel text-sm text-rose-300">{ru ? 'Войдите в аккаунт, чтобы играть в PEPE CRUSH и сохранять прогресс.' : 'Sign in to play PEPE CRUSH and save your progress.'}</p> : null}
            {startError ? <p className="text-sm text-rose-300" role="alert">{startError}</p> : null}

            {state ? (
              <>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: ru ? 'Пройдено уровней' : 'Levels cleared', value: state.profile.levelsCompleted },
                    { label: ru ? 'Звёзды' : 'Stars', value: state.profile.totalStars },
                    { label: 'PEPE Coins', value: state.profile.coins },
                    { label: ru ? 'Рекорд' : 'Best score', value: state.profile.bestScore },
                    { label: ru ? 'Победы' : 'Wins', value: state.profile.wins },
                    { label: ru ? 'Поражения' : 'Losses', value: state.profile.losses },
                    { label: ru ? '3 звезды' : '3-star levels', value: state.profile.threeStarLevels },
                    { label: ru ? 'Серия дней' : 'Day streak', value: state.daily.streak },
                  ].map((item) => (
                    <div key={item.label} className="crush-panel py-2.5">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-white/50">{item.label}</dt>
                      <dd className="text-lg font-black tabular-nums text-white">{item.value.toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="PEPE CRUSH">
                  {tabs.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={tab === id ? 'crush-btn-primary' : 'crush-btn-ghost'}>
                      <Icon className="h-4 w-4" aria-hidden="true" />{label}
                      {id === 'daily' && state.daily.canClaimBonus ? <span className="h-2 w-2 rounded-full bg-rose-400" aria-label={ru ? 'есть награда' : 'reward available'} /> : null}
                    </button>
                  ))}
                </div>

                <div role="tabpanel">
                  {tab === 'map' ? <LevelMap current={state.profile.currentLevel} ru={ru} onPlay={(level) => void startLevel(level)} /> : null}
                  {tab === 'daily' ? <DailyPanel state={state} ru={ru} onChange={() => void mutate()} /> : null}
                  {tab === 'shop' ? <ShopPanel state={state} ru={ru} onChange={() => void mutate()} /> : null}
                  {tab === 'leaderboard' ? <LeaderboardPanel ru={ru} /> : null}
                  {tab === 'achievements' ? <AchievementsPanel state={state} ru={ru} /> : null}
                </div>

                <section className="crush-panel">
                  <h2 className="mb-2 text-sm font-black text-white">{ru ? 'Ваши бустеры' : 'Your boosters'}</h2>
                  <ul className="flex flex-wrap gap-2 text-xs text-white/80">
                    {BOOSTER_CODES.map((code) => <li key={code} className="rounded-lg bg-white/5 px-2.5 py-1">{ru ? BOOSTER_INFO[code].ru : BOOSTER_INFO[code].en}: <b className="text-lime-300">{inventory[code]}</b></li>)}
                  </ul>
                </section>
              </>
            ) : !error ? <p className="text-sm text-white/60">{ru ? 'Загрузка PEPE CRUSH...' : 'Loading PEPE CRUSH...'}</p> : null}
          </>
        )}
      </div>

      {result ? (
        <ResultModal
          result={result}
          ru={ru}
          onClose={() => { setResult(null); setSession(null) }}
          onRetry={() => { if (lastLevel) void startLevel(lastLevel) }}
          onNext={() => { if (result.ok) void startLevel(result.nextLevel) }}
        />
      ) : null}
    </main>
  )
}

export default PepeCrushPage
