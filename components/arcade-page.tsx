'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { BatteryCharging, Coins, Gamepad2, Heart, ShoppingBag, Timer, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTokenAtomic } from '@/lib/pepe-amount'
import { ARCADE_ENERGY_CAP, ARCADE_HOMERO_COIN_REWARD, type ArcadeBoostCode, type ArcadeInventoryCode, type ArcadeShopCode } from '@/lib/arcade-gameplay'
import { PepeRunner } from '@/components/pepe-runner'
import { HomeroTokenLogo } from '@/components/homero-token-logo'
import { LocalizedTree } from '@/components/site-language-provider'

type ArcadeState = {
  energy: number
  energyCap: number
  unlimitedEnergy: boolean
  unlimitedRanked: boolean
  dailyEnergyEarned: number
  dailyEnergyCap: number
  dailyRunsToday: number
  dailyRunLimit: number
  dailyRunsAvailable: boolean
  bestDistanceM: number
  totalRuns: number
  reserveBalanceAtomic: string
  inventory: Record<ArcadeInventoryCode, number>
  shop: Array<{ code: ArcadeShopCode; label: string; priceAtomic: string }>
}

type ActiveRun = {
  sessionId: string
  runSeed: number
  mode: 'ranked' | 'casual'
  boostCodes: ArcadeBoostCode[]
  extraLives: number
  homeroCoinsRemaining: number
  homeroCoinsEnabled: boolean
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load arcade data.')
  return result as T
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'The arcade request could not be completed.')
  return result as T
}

function formatPepe(value: number | string) {
  return formatTokenAtomic(value).replace(/\.?0+$/, '')
}

function formatEnergy(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function ArcadeCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-[24px] border border-white/[0.08] bg-[#09090B] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.22)] sm:p-5 ${className}`}>{children}</section>
}

const arcadeGuideCards = [
  {
    title: 'Weekly leaderboard:',
    description: 'Take part in Ranked runs to climb the leaderboard. Every result is automatically verified before the weekly results are finalized.',
    Icon: Trophy,
    color: 'border-amber-100/90 bg-gradient-to-br from-amber-100 via-yellow-200 to-amber-300',
  },
  {
    title: 'Run rewards:',
    description: 'Valuable coins appear along the route in Ranked mode. Collect them while running to add to your HOMERO balance!',
    Icon: Coins,
    color: 'border-cyan-100/90 bg-gradient-to-br from-cyan-100 via-sky-200 to-sky-300',
  },
  {
    title: 'Energy refill:',
    description: 'Out of energy for another attempt? Complete verified View Ads tasks and jump straight back into the game!',
    Icon: BatteryCharging,
    color: 'border-rose-100/90 bg-gradient-to-br from-rose-100 via-pink-200 to-fuchsia-200',
  },
] as const

export function ArcadePage() {
  const router = useRouter()
  const { data: state, error: stateError, isLoading, mutate: refreshState } = useSWR<ArcadeState>('/api/arcade/state', getJson, { revalidateOnFocus: true })
  const { trigger: sendHeartbeat } = useSWRMutation('/api/arcade/run/heartbeat', (url, { arg }: { arg: { sessionId: string; active: boolean } }) => postJson(url, arg))
  const [run, setRun] = useState<ActiveRun | null>(null)
  const [runLives, setRunLives] = useState(0)
  const [mode, setMode] = useState<'ranked' | 'casual'>('ranked')
  const [selectedBoosts, setSelectedBoosts] = useState<ArcadeBoostCode[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [score, setScore] = useState(0)
  const [homeroCoinsCollected, setHomeroCoinsCollected] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shopBusy, setShopBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingFinish, setPendingFinish] = useState<{ activeRun: ActiveRun; jumpTimes: number[] } | null>(null)
  const pauseStateRef = useRef(false)
  const jumpRequestRef = useRef(false)

  useEffect(() => {
    if (!run) {
      pauseStateRef.current = false
      setIsPaused(false)
      return
    }

    let disposed = false
    let resumeInFlight = false
    const endRun = (reason: string) => {
      if (disposed) return
      pauseStateRef.current = false
      setIsPaused(false)
      setRun(null)
      setMessage(reason)
      void refreshState()
    }
    const heartbeat = () => {
      const active = document.visibilityState === 'visible' && document.hasFocus()
      if (!active) {
        if (!pauseStateRef.current) {
          pauseStateRef.current = true
          setIsPaused(true)
          void sendHeartbeat({ sessionId: run.sessionId, active: false }).catch(() => {
            if (!disposed) setMessage('The runner is paused. It will reconnect when this tab is active again.')
          })
        }
        return
      }

      if (pauseStateRef.current) {
        if (resumeInFlight) return
        resumeInFlight = true
        void sendHeartbeat({ sessionId: run.sessionId, active: true })
          .then(() => {
            if (disposed) return
            pauseStateRef.current = false
            setIsPaused(false)
            setMessage('Run resumed. Clear the next hazard.')
          })
          .catch(() => endRun('The run ended because its server heartbeat expired.'))
          .finally(() => { resumeInFlight = false })
        return
      }

      void sendHeartbeat({ sessionId: run.sessionId, active: true }).catch(() => {
        endRun('The run ended because its server heartbeat expired.')
      })
    }

    const interval = window.setInterval(heartbeat, 4_000)
    window.addEventListener('blur', heartbeat)
    window.addEventListener('focus', heartbeat)
    document.addEventListener('visibilitychange', heartbeat)
    heartbeat()
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('blur', heartbeat)
      window.removeEventListener('focus', heartbeat)
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [refreshState, run, sendHeartbeat])

  const finishRun = useCallback(async (activeRun: ActiveRun, jumpTimes: number[]) => {
    setBusy(true)
    try {
      await postJson('/api/arcade/run/finish', {
        sessionId: activeRun.sessionId,
        jumpTimes,
      })
      setPendingFinish(null)
      setMessage(null)
      pauseStateRef.current = false
      setIsPaused(false)
      setRun(null)
      await refreshState()
      router.refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not save that run.'
      if (/resume|paused|replay has not reached/i.test(errorMessage)) {
        setPendingFinish({ activeRun, jumpTimes })
        setMessage(`${errorMessage} Resume if needed, then retry the save.`)
        return
      }
      setMessage(errorMessage)
      setPendingFinish(null)
      setRun(null)
      pauseStateRef.current = false
      setIsPaused(false)
      void sendHeartbeat({ sessionId: activeRun.sessionId, active: false }).catch(() => undefined)
      void refreshState()
    } finally {
      setBusy(false)
    }
  }, [refreshState, router, sendHeartbeat])

  const requestJump = useCallback(() => {
    if (!run || busy || isPaused) return
    jumpRequestRef.current = true
  }, [busy, isPaused, run])

  const reportProgress = useCallback((distanceM: number, activeElapsedMs: number, collectedCoins: number) => {
    setScore(distanceM)
    setElapsedMs(activeElapsedMs)
    setHomeroCoinsCollected(collectedCoins)
  }, [])

  const handleRunnerFinish = useCallback((jumpTimes: number[]) => {
    if (run) void finishRun(run, jumpTimes)
  }, [finishRun, run])

  const handleRunnerLivesChange = useCallback((livesRemaining: number) => {
    setRunLives(livesRemaining)
  }, [])

  const startRun = async () => {
    if (busy || run) return
    setBusy(true)
    setMessage(null)
    setPendingFinish(null)
    try {
      const result = await postJson<{ sessionId: string; runSeed: number; mode: 'ranked' | 'casual'; boostCodes: ArcadeBoostCode[]; extraLives: number; homeroCoinsRemaining: number; homeroCoinsEnabled: boolean }>('/api/arcade/run/start', {
        mode,
        boostCodes: mode === 'casual' ? selectedBoosts : [],
      })
      pauseStateRef.current = false
      jumpRequestRef.current = false
      setIsPaused(false)
      setRun(result)
      setRunLives(result.extraLives)
      setScore(0)
      setHomeroCoinsCollected(0)
      setElapsedMs(0)
      setMessage('Run live. Tap, click, Space, or ↑ to clear the neon hazards.')
      await refreshState()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start a run.')
      void refreshState()
    } finally {
      setBusy(false)
    }
  }

  const purchaseItem = async (itemCode: ArcadeShopCode) => {
    if (shopBusy || mode === 'casual') return
    setShopBusy(itemCode)
    setMessage(null)
    try {
      await postJson('/api/arcade/shop', { itemCode, idempotencyKey: crypto.randomUUID() })
      setMessage('One extra life is ready for any run.')
      await refreshState()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete the purchase.')
    } finally {
      setShopBusy(null)
    }
  }

  const shopItems = state?.shop ?? []
  const visibleShopItems = mode === 'casual' ? [] : shopItems

  const energyValue = state?.energy ?? 0
  const energyCap = state?.energyCap ?? ARCADE_ENERGY_CAP
  const energyBalanceLabel = state ? formatEnergy(energyValue) : isLoading ? '—' : '0'
  const missingEnergy = Math.max(0, 1 - energyValue)
  const missingEnergyLabel = missingEnergy === 1 ? 'Need 1 energy' : `Need ${formatEnergy(missingEnergy)} more energy`
  const rankedDailyLimitReached = mode === 'ranked' && state?.dailyRunsAvailable === false
  const startRunLabel = rankedDailyLimitReached ? 'Daily limit reached' : mode === 'casual' ? 'Start free run' : state?.unlimitedEnergy ? 'Start ranked run · unlimited energy' : energyValue < 1 ? missingEnergyLabel : 'Start run · 1 energy'
  const showLives = mode === 'ranked'
  const lifeCount = run ? runLives : state?.inventory.life ?? 0

  if (stateError) {
    return <LocalizedTree><main id="top" className="dashboard-page-shell"><section role="alert" className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-sm text-rose-200">{stateError.message}</section></main></LocalizedTree>
  }

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell min-w-0 space-y-5 text-white">
      <header className="space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[30px]"><Gamepad2 className="text-amber-300" size={25} /> Arcade</h1>
        <section aria-label="Arcade guide" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {arcadeGuideCards.map(({ title, description, Icon, color }) => (
            <article key={title} className={cn('relative min-h-[136px] overflow-hidden rounded-[22px] border-2 p-3.5 text-[#241600] shadow-[0_5px_0_rgba(0,0,0,0.25),0_14px_28px_rgba(0,0,0,0.18)] transition-transform duration-200 hover:-translate-y-1 sm:p-4', color)}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="mt-0.5 text-[13px] font-black tracking-tight sm:text-sm">{title}</h2>
                <span aria-hidden="true" className="grid size-9 shrink-0 rotate-3 place-items-center rounded-[14px] border-2 border-white/80 bg-white/65 text-[#241600] shadow-[0_3px_0_rgba(0,0,0,0.13)]"><Icon size={17} /></span>
              </div>
              <p className="mt-2 max-w-[42ch] text-[11px] font-semibold leading-[1.45] text-[#241600]/80 sm:text-xs">{description}</p>
            </article>
          ))}
        </section>
      </header>

      <div className="min-w-0 space-y-5">
        <div className="min-w-0">
          <ArcadeCard className={cn('overflow-hidden border-amber-300/15 p-0', mode !== 'casual' && 'xl:pb-[38px]')}>
            <div className="relative isolate aspect-[2.55] min-h-[132px] w-full min-w-0 overflow-hidden rounded-[24px] bg-[#09090B] sm:aspect-[20/7] sm:min-h-[160px]">
              <PepeRunner
                runId={run?.sessionId ?? null}
                runSeed={run?.runSeed ?? 1}
                boostCodes={run?.boostCodes ?? []}
                extraLives={run?.extraLives ?? 0}
                homeroCoinsEnabled={run?.homeroCoinsEnabled ?? false}
                homeroCoinsRemaining={run?.homeroCoinsRemaining ?? 0}
                paused={isPaused}
                disabled={busy}
                jumpRequestRef={jumpRequestRef}
                onProgress={reportProgress}
                onLivesChange={handleRunnerLivesChange}
                onFinish={handleRunnerFinish}
              />
              <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1 sm:hidden">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="max-w-[68px] truncate rounded-full border border-white/10 bg-black/55 px-1.5 py-1 text-[7px] font-extrabold uppercase tracking-[0.08em] text-white/80 backdrop-blur">{run ? run.mode === 'ranked' ? 'Ranked' : 'FREE' : 'Night run'}</span>
                  {showLives && <span aria-label={`${lifeCount} ${lifeCount === 1 ? 'life' : 'lives'} ${run ? 'remaining' : 'available'}`} className="inline-flex min-h-5 shrink-0 items-center gap-1 rounded-full border border-rose-400/25 bg-black/55 px-1.5 py-0.5 text-[8px] font-black text-white backdrop-blur"><Heart size={9} className="fill-rose-500 text-rose-500" aria-hidden="true" />{lifeCount}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="whitespace-nowrap rounded-full border border-amber-300/20 bg-black/55 px-1.5 py-1 font-mono text-[8px] font-black leading-none tabular-nums text-white backdrop-blur"><span className="sr-only">Distance </span>{run ? `${score.toLocaleString()} m` : `${state?.bestDistanceM.toLocaleString() ?? '0'} m best`}</span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300/20 bg-black/55 px-1.5 py-1 text-[7px] font-extrabold text-amber-100 backdrop-blur"><Timer size={9} aria-hidden="true" />{run ? `${(elapsedMs / 1000).toFixed(1)}s` : 'Runner'}</span>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 hidden items-center justify-between gap-3 p-4 sm:flex sm:p-5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/75 backdrop-blur">{run ? run.mode === 'ranked' ? 'Ranked run' : 'Free run' : 'Night run'}</span>
                  {showLives && <span aria-label={`${lifeCount} ${lifeCount === 1 ? 'life' : 'lives'} ${run ? 'remaining' : 'available'}`} className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-rose-400/25 bg-black/50 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur"><Heart size={12} className="fill-rose-500 text-rose-500" aria-hidden="true" />{lifeCount}</span>}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300/20 bg-black/45 px-3 py-1.5 text-[10px] font-extrabold text-amber-100 backdrop-blur"><Timer size={12} /> {run ? `${(elapsedMs / 1000).toFixed(1)}s` : 'Pepe runner'}</span>
              </div>

              {run && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 rounded-xl border border-amber-300/25 bg-slate-950/75 px-3 py-2 font-mono text-lg font-black leading-none tabular-nums text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md sm:block">
                  <span className="sr-only">Distance </span>{score.toLocaleString()} m
                </div>
              )}


              {run?.mode === 'ranked' && (
                <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-black/60 px-2.5 py-1.5 text-[9px] font-black text-amber-100 backdrop-blur sm:bottom-4 sm:left-4">
                  <HomeroTokenLogo size={14} />
                  <span aria-label="HOMERO earned this run">+{homeroCoinsCollected * ARCADE_HOMERO_COIN_REWARD} HOMERO</span>
                </div>
              )}

              {isPaused && run && (
                <div className="absolute inset-0 grid place-items-center bg-[#09090B]/55 backdrop-blur-[2px]">
                  <div className="rounded-2xl border border-amber-300/20 bg-black/60 px-5 py-4 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">Run paused</p>
                    <p className="mt-1 text-[10px] text-white/65">Switch back to resume the city run.</p>
                  </div>
                </div>
              )}

              {busy && run && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
                  <span className="rounded-full border border-amber-300/25 bg-black/60 px-4 py-2 text-[10px] font-extrabold text-amber-100">Saving verified distance…</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-1">
                  <button type="button" onClick={() => { setMode('ranked'); setSelectedBoosts([]) }} disabled={Boolean(run)} aria-pressed={mode === 'ranked'} className={`rounded-lg px-3 py-2 text-[10px] font-extrabold transition ${mode === 'ranked' ? 'bg-amber-300 text-[#111]' : 'text-white/55 hover:text-white'} disabled:opacity-50`}>Ranked</button>
                  <button type="button" onClick={() => setMode('casual')} disabled={Boolean(run)} aria-pressed={mode === 'casual'} className={`rounded-lg px-3 py-2 text-[10px] font-extrabold transition ${mode === 'casual' ? 'bg-amber-300 text-[#111]' : 'text-white/55 hover:text-white'} disabled:opacity-50`}>FREE</button>
                </div>
              </div>
              <div className="flex w-full">
                {run ? (
                  <button type="button" onPointerDown={(event) => { if (event.button === 0) requestJump() }} onClick={(event) => { if (event.detail === 0) requestJump() }} disabled={busy || isPaused} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-[#111] shadow-[0_8px_28px_rgba(250,204,21,0.2)] touch-manipulation transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-wait disabled:opacity-60"><Zap size={15} />{busy ? 'Saving run…' : isPaused ? 'Paused' : 'JUMP'}</button>
                ) : (
                  <button type="button" onClick={() => void startRun()} disabled={busy || rankedDailyLimitReached || (mode === 'ranked' && !state?.unlimitedEnergy && energyValue < 1) || isLoading} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-[#111] shadow-[0_8px_28px_rgba(250,204,21,0.2)] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-50"><Gamepad2 size={15} />{busy ? 'Starting…' : startRunLabel}</button>
                )}
              </div>
              {pendingFinish && <button type="button" onClick={() => void finishRun(pendingFinish.activeRun, pendingFinish.jumpTimes)} disabled={busy || isPaused} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-extrabold text-amber-100 transition hover:bg-amber-300/[0.12] disabled:cursor-not-allowed disabled:opacity-50">Retry verified run save</button>}
              {message && <p role="status" aria-live="polite" className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[10px] font-semibold leading-5 text-white/75">{message}</p>}
            </div>
          </ArcadeCard>
        </div>

        {mode === 'ranked' && <aside className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
          <ArcadeCard className="border-2 border-sky-300/25 bg-gradient-to-br from-[#111b32] via-[#0c1326] to-[#09090B] shadow-[0_8px_0_rgba(56,189,248,0.08),0_18px_50px_rgba(0,0,0,0.35)]">
            <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">Player profile</p><h2 className="mt-1 text-sm font-black">Your stats</h2></div><Trophy size={18} className="text-amber-300" /></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="group relative overflow-hidden rounded-[22px] border-2 border-sky-200/35 bg-gradient-to-br from-[#24405d] via-[#172943] to-[#10172e] p-3 shadow-[0_4px_0_rgba(14,165,233,0.2),0_12px_24px_rgba(0,0,0,0.3)]">
                <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-5 size-20 rounded-full bg-sky-300/10 blur-xl" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-sky-100/70">Personal best</p><span className="grid size-7 place-items-center rounded-xl border border-sky-100/20 bg-sky-200/10 text-sky-100 shadow-inner"><Trophy size={12} /></span></div>
                  <p className="mt-3 flex items-baseline gap-1.5 font-mono text-2xl font-black tabular-nums text-white drop-shadow-[0_2px_8px_rgba(125,211,252,0.35)]">{(state?.bestDistanceM ?? 0).toLocaleString()}<span className="rounded-md bg-sky-200/10 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-100">m</span></p>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-[22px] border-2 border-amber-200/35 bg-gradient-to-br from-[#54401e] via-[#30271c] to-[#161a2d] p-3 shadow-[0_4px_0_rgba(245,158,11,0.18),0_12px_24px_rgba(0,0,0,0.3)]">
                <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-6 size-24 rounded-full bg-amber-100/10 blur-xl" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-100/75">Pepe Runner Energy</p><span className="grid size-7 place-items-center rounded-xl border border-amber-100/25 bg-amber-200/10 text-amber-100 shadow-inner"><BatteryCharging size={13} /></span></div>
                  <p className="mt-3 font-mono text-2xl font-black tabular-nums text-white drop-shadow-[0_2px_8px_rgba(253,224,71,0.35)]">{state?.unlimitedEnergy ? 'Unlimited' : energyBalanceLabel}{!state?.unlimitedEnergy && <span className="ml-1 text-[10px] font-extrabold text-amber-100/65">/ {formatEnergy(energyCap)}</span>}</p>
                  {!state?.unlimitedEnergy && <div role="progressbar" aria-label="Pepe Runner Energy" aria-valuemin={0} aria-valuemax={energyCap} aria-valuenow={energyValue} aria-valuetext={`${energyBalanceLabel} of ${formatEnergy(energyCap)}`} className="mt-2 h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/30 p-0.5"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-300 shadow-[0_0_10px_rgba(253,224,71,0.55)] transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, (energyValue / energyCap) * 100)}%` }} /></div>}
                </div>
              </div>
            </div>
          </ArcadeCard>

          <ArcadeCard className="relative overflow-hidden border-2 border-amber-200/30 bg-gradient-to-br from-[#261d2c] via-[#171521] to-[#0b101c] shadow-[0_8px_0_rgba(251,191,36,0.08),0_18px_50px_rgba(0,0,0,0.35)]">
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-amber-300/[0.08] blur-3xl" />
            <div className="relative">
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">PEPE shop</p><h2 className="mt-1 flex items-center gap-2 text-sm font-black"><ShoppingBag size={14} className="text-amber-300" /> Run essentials</h2></div><Coins size={17} className="text-white/45" /></div>
              <div className="flex flex-col gap-3">
                {visibleShopItems.map((item) => {
                  const lifeOwned = state?.inventory.life ?? 0
                  const unavailable = lifeOwned >= 1
                  return <div key={item.code} className="group relative flex items-center gap-3 overflow-hidden rounded-[22px] border-2 border-rose-200/40 bg-gradient-to-r from-[#512339] via-[#2a1c2b] to-[#10131f] p-3 shadow-[0_4px_0_rgba(244,63,94,0.16),0_10px_20px_rgba(0,0,0,0.24)] transition-all duration-200 hover:-translate-y-0.5">
                    <span className="grid size-12 shrink-0 place-items-center rounded-[17px] border-2 border-rose-100/30 bg-gradient-to-br from-rose-200/25 to-rose-500/10 text-rose-100 shadow-inner"><Heart size={18} className="fill-rose-400" /></span>
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-black text-white">{item.label}</p><p className="mt-1 text-[9px] leading-4 text-white/60">One extra heart for any run · maximum 1 held</p></div>
                    <button type="button" onClick={() => void purchaseItem(item.code)} disabled={Boolean(shopBusy) || Boolean(run) || unavailable} className="shrink-0 rounded-xl border-2 border-rose-100/70 bg-gradient-to-b from-[#ffd6e3] to-[#fb7185] px-3 py-2.5 text-[9px] font-black text-[#3b0c1d] shadow-[0_3px_0_#a92446] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">{shopBusy === item.code ? '…' : unavailable ? 'Owned' : `${formatPepe(item.priceAtomic)} PEPE`}</button>
                  </div>
                })}
                {!visibleShopItems.length && <p className="text-[10px] text-white/40">Shop items are loading.</p>}
              </div>
            </div>
          </ArcadeCard>
        </aside>}
      </div>
    </main>
    </LocalizedTree>
  )
}
