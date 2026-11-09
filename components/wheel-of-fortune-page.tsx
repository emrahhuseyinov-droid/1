'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from 'react'
import useSWR from 'swr'
import { Check, Clock3, Volume2, VolumeX } from 'lucide-react'
import { AdsLabCaptchaModal } from '@/components/adslab-captcha-modal'
import { LocalizedTree } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'
import { wheelSectors, WHEEL_COOLDOWN_MS } from '@/lib/wheel-of-fortune'

type WheelSpin = {
  id: string
  sectorIndex: number
  rewardType: 'homero' | 'energy' | 'life'
  rewardAtomic: string
  rewardQuantity: number
  createdAt: string
  claimedAt: string | null
}

type WheelState = {
  cooldownMs: number
  nextSpinAt: string | null
  cooldownRemainingMs: number
  lastSpin: WheelSpin | null
}

type SpinResult = WheelSpin & { nextSpinAt: string }

async function getWheelState(url: string): Promise<WheelState> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as WheelState & { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load the wheel.')
  return result as WheelState
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'The request could not be completed.')
  return result as T
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function WheelCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[24px] border border-white/[0.08] bg-[#09090B] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.22)] sm:p-5 ${className}`}>{children}</section>
}

export function WheelOfFortunePage() {
  const { data: state, error, isLoading, mutate } = useSWR<WheelState>('/api/wheel/state', getWheelState, { revalidateOnFocus: true })
  const [now, setNow] = useState(() => Date.now())
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeSpin, setActiveSpin] = useState<SpinResult | WheelSpin | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const tickIntervalRef = useRef<ReturnType<Window['setInterval']> | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (dialogOpen && !dialog.open) dialog.showModal()
    if (!dialogOpen && dialog.open) dialog.close()
  }, [dialogOpen])

  useEffect(() => () => {
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current)
    void audioContextRef.current?.close()
  }, [])

  const nextSpinAt = state?.nextSpinAt ? new Date(state.nextSpinAt).getTime() : null
  const cooldownRemainingMs = nextSpinAt === null ? 0 : Math.max(0, nextSpinAt - now)
  const canSpin = cooldownRemainingMs === 0 && !busy && !spinning && !captchaUrl
  const currentSector = activeSpin ? wheelSectors[activeSpin.sectorIndex] : null
  const pendingSpin = state?.lastSpin && !state.lastSpin.claimedAt ? state.lastSpin : null

  function playTone(frequency: number, duration = 0.045) {
    if (!soundEnabled || typeof window === 'undefined' || !window.AudioContext) return
    try {
      const context = audioContextRef.current ?? new window.AudioContext()
      audioContextRef.current = context
      if (context.state === 'suspended') void context.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(frequency, context.currentTime)
      gain.gain.setValueAtTime(0.035, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + duration)
    } catch {
      setSoundEnabled(false)
    }
  }

  function playWinSound() {
    playTone(660, 0.09)
    window.setTimeout(() => playTone(880, 0.09), 100)
    window.setTimeout(() => playTone(1100, 0.16), 210)
  }

  function finishAnimation() {
    if (tickIntervalRef.current) {
      window.clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
    setSpinning(false)
    setDialogOpen(true)
    playWinSound()
  }

  async function openCaptcha() {
    if (!canSpin) return
    setBusy(true)
    setMessage(null)

    try {
      const result = await postJson<{ solveUrl: string }>('/api/wheel/captcha/init', {})
      setCaptchaUrl(result.solveUrl)
    } catch (captchaError) {
      setMessage(captchaError instanceof Error ? captchaError.message : 'Could not start the AdsLab verification.')
    } finally {
      setBusy(false)
    }
  }

  async function startSpin(captchaToken: string) {
    if (busy || spinning) return
    setBusy(true)
    setMessage(null)
    playTone(740, 0.06)

    try {
      const result = await postJson<SpinResult>('/api/wheel/spin', { captchaToken })
      setActiveSpin(result)
      const currentMod = ((rotation % 360) + 360) % 360
      const deltaToSector = (360 - ((result.sectorIndex * 45 + currentMod) % 360)) % 360
      const nextRotation = rotation + 360 * 7 + deltaToSector
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setRotation(nextRotation)
      void mutate({
        cooldownMs: WHEEL_COOLDOWN_MS,
        nextSpinAt: result.nextSpinAt,
        cooldownRemainingMs: WHEEL_COOLDOWN_MS,
        lastSpin: result,
      }, { revalidate: false })

      if (reducedMotion) {
        setSpinning(false)
        setDialogOpen(true)
        playWinSound()
      } else {
        setSpinning(true)
        tickIntervalRef.current = window.setInterval(() => playTone(560 + Math.random() * 440, 0.025), 180)
      }
    } catch (spinError) {
      setMessage(spinError instanceof Error ? spinError.message : 'Could not start the spin.')
      void mutate()
    } finally {
      setBusy(false)
    }
  }

  function handleCaptchaReturn(token: string | null) {
    setCaptchaUrl(null)
    if (!token) {
      setMessage('AdsLab did not return a verification token. Please try again.')
      return
    }
    void startSpin(token)
  }

  async function claimReward(spin: WheelSpin) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await postJson<{ claimed: boolean; alreadyClaimed: boolean; spin: WheelSpin }>('/api/wheel/claim', { spinId: spin.id })
      setActiveSpin(result.spin)
      setDialogOpen(false)
      setMessage(result.alreadyClaimed ? 'This reward was already added to your account.' : 'Reward added to your account.')
      await mutate()
    } catch (claimError) {
      setMessage(claimError instanceof Error ? claimError.message : 'Could not collect this reward.')
    } finally {
      setBusy(false)
    }
  }

  function handleWheelTransition(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform' || !spinning) return
    finishAnimation()
  }

  function openPendingReward() {
    if (!pendingSpin) return
    setActiveSpin(pendingSpin)
    setDialogOpen(true)
  }

  const segmentBackground = `conic-gradient(from -22.5deg, ${wheelSectors.map((sector, index) => `${sector.color} ${index * 45}deg ${(index + 1) * 45}deg`).join(', ')})`

  if (error) {
    return <LocalizedTree><main id="top" className="dashboard-page-shell"><section role="alert" className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-sm text-rose-200">{error.message}</section></main></LocalizedTree>
  }

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell min-w-0 space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.2em] text-emerald-300/75">Daily rewards</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-[30px]">Wheel of Fortune</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55 sm:text-sm">One free spin every 2 hours. The server selects each result using the published odds.</p>
          </div>
          <button type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} aria-pressed={soundEnabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[10px] font-extrabold text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            {soundEnabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
            {soundEnabled ? 'Sound on' : 'Sound off'}
          </button>
        </header>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <WheelCard className="flex min-w-0 flex-col items-center overflow-hidden border-emerald-300/15 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.09),transparent_55%),#09090B]">
            <div className="relative mx-auto w-full max-w-[350px] px-4 pb-4 pt-7 sm:px-6 sm:pt-9">
              <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 sm:top-3" aria-hidden="true">
                <div className="h-0 w-0 border-x-[13px] border-t-[24px] border-x-transparent border-t-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]" />
              </div>
              <div className="rounded-full border-[5px] border-[#f3cf70] p-1.5 shadow-[0_0_40px_rgba(34,197,94,0.16),inset_0_0_0_2px_rgba(255,255,255,0.18)] sm:border-[7px] sm:p-2">
                <div
                  role="img"
                  aria-label="Eight-segment prize wheel. The prize odds are listed below."
                  onTransitionEnd={handleWheelTransition}
                  className="relative aspect-square rounded-full border border-white/20 transition-transform duration-[6200ms] [transition-timing-function:cubic-bezier(0.08,0.82,0.15,1)] motion-reduce:transition-none"
                  style={{ background: segmentBackground, transform: `rotate(${rotation}deg)` }}
                >
                  <div className="absolute inset-[29%] grid place-items-center rounded-full border-4 border-[#f1d487] bg-[#101721] shadow-[0_0_25px_rgba(0,0,0,0.45)]">
                    <div className="text-center">
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300 sm:text-[10px]">PEPE</span>
                      <span className="mt-0.5 block text-[7px] font-extrabold uppercase tracking-[0.12em] text-white/55 sm:text-[8px]">Spin & win</span>
                    </div>
                  </div>
                  {wheelSectors.map((sector, index) => {
                    const angle = index * 45
                    const radians = angle * Math.PI / 180
                    const labelStyle: CSSProperties = {
                      left: `${50 + Math.sin(radians) * 34}%`,
                      top: `${50 - Math.cos(radians) * 34}%`,
                      transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                    }
                    return <span key={sector.key} style={labelStyle} className="absolute z-10 max-w-[72px] text-center text-[8px] font-black leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] sm:max-w-[80px] sm:text-[9px]">{sector.shortLabel}</span>
                  })}
                </div>
              </div>
            </div>

            <div className="mt-2 w-full max-w-sm px-1 text-center">
              <button type="button" onClick={() => void openCaptcha()} disabled={!canSpin || isLoading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-[#07120d] shadow-[0_8px_28px_rgba(52,211,153,0.18)] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-55">
                {spinning ? 'Spinning…' : busy ? 'Please wait…' : cooldownRemainingMs > 0 ? <>Next free spin in <span className="font-mono tabular-nums">{formatRemaining(cooldownRemainingMs)}</span></> : 'SPIN THE WHEEL · FREE'}
              </button>
              <p className="mt-2 inline-flex items-center justify-center gap-1.5 text-[10px] text-white/45"><Clock3 size={12} aria-hidden="true" /> One spin every 2 hours</p>
            </div>

            {pendingSpin && !spinning && (
              <div className="mt-4 flex w-full max-w-sm flex-col gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-left">
                <p className="text-[10px] font-extrabold text-amber-100">A reward is waiting to be collected.</p>
                <button type="button" onClick={openPendingReward} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-black text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"><Check size={13} aria-hidden="true" /> Show my reward</button>
              </div>
            )}

            {message && <p role="status" aria-live="polite" className="mt-4 w-full max-w-sm rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-left text-[10px] font-semibold leading-5 text-white/75">{message}</p>}
          </WheelCard>

          <WheelCard className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">Published odds</p><h2 className="mt-1 text-sm font-black">Every sector, every chance</h2></div>
              <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] font-extrabold text-emerald-100">100% total</span>
            </div>
            <ol className="flex flex-col gap-2">
              {wheelSectors.map((sector, index) => {
                const chance = `${(sector.chanceBps / 100).toFixed(1).replace(/\.0$/, '')}%`
                return (
                  <li key={sector.key} className="grid grid-cols-[22px_minmax(0,1fr)_52px] items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2.5">
                    <span className="size-3 rounded-full ring-2 ring-white/10" style={{ backgroundColor: sector.color }} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-extrabold text-white/90">{sector.label}</p>
                      <p className="mt-0.5 text-[9px] text-white/45">Sector {index + 1} of 8</p>
                    </div>
                    <span className="text-right font-mono text-[10px] font-black tabular-nums text-emerald-100">{chance}</span>
                  </li>
                )
              })}
            </ol>
            <p className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[9px] leading-5 text-white/45">The result and cooldown are saved on the server. A reward can be collected once, even if you refresh the page.</p>
          </WheelCard>
        </div>

        <AdsLabCaptchaModal solveUrl={captchaUrl} onSolved={handleCaptchaReturn} onClose={() => setCaptchaUrl(null)} />

        <dialog ref={dialogRef} onClose={() => setDialogOpen(false)} aria-labelledby="wheel-result-title" className="w-[min(92vw,420px)] rounded-[24px] border border-emerald-200/20 bg-[#0b1118] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.7)] backdrop:bg-black/75">
          {activeSpin && currentSector && (
            <div className="p-5 text-center sm:p-7">
              <div className="mx-auto grid size-14 place-items-center rounded-full border border-emerald-200/25 bg-emerald-300/[0.08] text-emerald-200"><Check size={23} aria-hidden="true" /></div>
              <p className="mt-4 text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">Wheel result</p>
              <h2 id="wheel-result-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Congratulations!</h2>
              <p className="mt-2 text-sm font-bold text-white/80">You won: <span className="text-emerald-200">{currentSector.label}</span></p>
              <p className="mt-2 text-[10px] leading-5 text-white/45">Your reward is ready. Collect it to add it to your account.</p>
              <button type="button" onClick={() => void claimReward(activeSpin)} disabled={busy || Boolean(activeSpin.claimedAt)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-[11px] font-black text-[#07120d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
                {activeSpin.claimedAt ? 'Reward collected' : busy ? 'Adding reward…' : 'Collect reward'}
              </button>
              {message && <p role="status" aria-live="polite" className="mt-3 text-left text-[10px] leading-5 text-amber-100">{message}</p>}
              <button type="button" onClick={() => setDialogOpen(false)} className="mt-3 min-h-9 w-full rounded-lg px-3 py-2 text-[10px] font-bold text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">Close</button>
            </div>
          )}
        </dialog>
      </main>
    </LocalizedTree>
  )
}
