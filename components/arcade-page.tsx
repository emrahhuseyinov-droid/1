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
import { initializeAdsLabInterstitial, showAdsLabInterstitial } from '@/lib/adslab-interstitial'

type ArcadeState = {
  energy: number
  energyCap: number
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

export function ArcadePage({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    initializeAdsLabInterstitial(userId)
  }, [userId])
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
    void showAdsLabInterstitial()
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
      setMessage(itemCode === 'energy' ? 'One energy added to your account.' : 'One extra life is ready for any run.')
      await refreshState()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete the purchase.')
    } finally {
      setShopBusy(null)
    }
  }

  const shopItems = state?.shop ?? []
  const visibleShopItems = mode === 'casual' ? shopItems.filter((item) => item.code !== 'life') : shopItems

  const energyValue = state?.energy ?? 0
  const energyCap = state?.energyCap ?? ARCADE_ENERGY_CAP
  const energyBalanceLabel = state ? formatEnergy(energyValue) : isLoading ? '—' : '0'
  const missingEnergy = Math.max(0, 1 - energyValue)
  const missingEnergyLabel = missingEnergy === 1 ? 'Need 1 energy' : `Need ${formatEnergy(missingEnergy)} more energy`
  const startRunLabel = state?.dailyRunsAvailable === false ? 'Daily limit reached' : mode === 'casual' ? 'Start free run' : energyValue < 1 ? missingEnergyLabel : 'Start run · 1 energy'
  const showLives = mode === 'ranked'
  const lifeCount = run ? runLives : state?.inventory.life ?? 0

  if (stateError) {
    return <LocalizedTree><main id="top" className="dashboard-page-shell"><section role="alert" className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-sm text-rose-200">{stateError.message}</section></main></LocalizedTree>
  }

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell min-w-0 space-y-5 text-white">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[30px]"><Gamepad2 className="text-amber-300" size={25} /> Arcade</h1>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/55 sm:text-sm">Run as far as you can before a collision. Speed rises every 100 m; Ranked runs are replay-verified for the weekly board. Collect the coin that appears every 100 m in Ranked mode to earn 1 HOMERO, up to 200 HOMERO per account. Earn energy from verified View Ads tasks.</p>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <div className="min-w-0 space-y-5">
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
                  <button type="button" onClick={() => void startRun()} disabled={busy || state?.dailyRunsAvailable === false || (mode === 'ranked' && energyValue < 1) || isLoading} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-[#111] shadow-[0_8px_28px_rgba(250,204,21,0.2)] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-50"><Gamepad2 size={15} />{busy ? 'Starting…' : startRunLabel}</button>
                )}
              </div>
              {pendingFinish && <button type="button" onClick={() => void finishRun(pendingFinish.activeRun, pendingFinish.jumpTimes)} disabled={busy || isPaused} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-extrabold text-amber-100 transition hover:bg-amber-300/[0.12] disabled:cursor-not-allowed disabled:opacity-50">Retry verified run save</button>}
              {message && <p role="status" aria-live="polite" className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[10px] font-semibold leading-5 text-white/75">{message}</p>}
            </div>
          </ArcadeCard>
        </div>

        <aside className="min-w-0 space-y-5">
          <ArcadeCard>
            <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">Player profile</p><h2 className="mt-1 text-sm font-black">Your stats</h2></div><Trophy size={18} className="text-amber-300" /></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">Personal best</p><p className="mt-1 font-mono text-xl font-black">{(state?.bestDistanceM ?? 0).toLocaleString()}<span className="text-xs text-white/40"> m</span></p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">Arcade energy</p><BatteryCharging size={14} className="text-amber-200" /></div>
                <p className="mt-1 font-mono text-xl font-black tabular-nums text-white">{energyBalanceLabel}<span className="ml-1 text-[10px] font-bold text-white/40">/ {formatEnergy(energyCap)}</span></p>
                <div role="progressbar" aria-label="Arcade energy" aria-valuemin={0} aria-valuemax={energyCap} aria-valuenow={energyValue} aria-valuetext={`${energyBalanceLabel} of ${formatEnergy(energyCap)}`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, (energyValue / energyCap) * 100)}%` }} /></div>
                <p className="mt-1 text-[8px] text-white/40">+0.02 per PTC task · +1 Daily Bonus · 1 per Ranked run</p>
                <p className="mt-1 flex items-center justify-between gap-2 text-[8px] text-white/55"><span>Arcade runs this Baku day</span><span className="font-mono font-bold tabular-nums">{state?.dailyRunsToday ?? 0} / {state?.dailyRunLimit ?? 7}</span></p>
                <p className="mt-1 flex items-center justify-between gap-2 text-[8px] text-white/55"><span>Ad energy this Baku day</span><span className="font-mono font-bold tabular-nums">{formatEnergy(state?.dailyEnergyEarned ?? 0)} / {formatEnergy(state?.dailyEnergyCap ?? 15)}</span></p>
              </div>
            </div>
          </ArcadeCard>

          {mode !== 'casual' && <ArcadeCard className="relative overflow-hidden border-amber-300/20">
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-amber-300/[0.08] blur-3xl" />
            <div className="relative">
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">PEPE shop</p><h2 className="mt-1 flex items-center gap-2 text-sm font-black"><ShoppingBag size={14} className="text-amber-300" /> Run essentials</h2></div><Coins size={17} className="text-white/45" /></div>
              <div className="flex flex-col gap-3">
                {visibleShopItems.map((item) => {
                  const isEnergy = item.code === 'energy'
                  const lifeOwned = state?.inventory.life ?? 0
                  const unavailable = isEnergy ? energyValue >= energyCap : lifeOwned >= 1
                  return <div key={item.code} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${isEnergy ? 'border-amber-300/15 bg-gradient-to-br from-amber-300/[0.08] to-transparent' : 'border-rose-400/15 bg-gradient-to-br from-rose-400/[0.07] to-transparent'}`}>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${isEnergy ? 'border-amber-200/20 bg-amber-300/10 text-amber-200' : 'border-rose-300/20 bg-rose-400/10 text-rose-300'}`}>{isEnergy ? <BatteryCharging size={17} /> : <Heart size={17} className="fill-rose-500" />}</span>
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold">{item.label}</p><p className="mt-1 text-[9px] leading-4 text-white/50">{isEnergy ? 'Adds 1 energy' : 'One extra heart for any run · maximum 1 held'}</p></div>
                    <button type="button" onClick={() => void purchaseItem(item.code)} disabled={Boolean(shopBusy) || Boolean(run) || unavailable} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-[9px] font-extrabold text-amber-100 transition hover:border-amber-200/25 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40">{shopBusy === item.code ? '…' : unavailable && !isEnergy ? 'Owned' : `${formatPepe(item.priceAtomic)} PEPE`}</button>
                  </div>
                })}
                {!visibleShopItems.length && <p className="text-[10px] text-white/40">Shop items are loading.</p>}
              </div>
            </div>
          </ArcadeCard>}
        </aside>
      </div>
    </main>
    </LocalizedTree>
  )
}
