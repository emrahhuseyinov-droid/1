'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from 'react'
import useSWR from 'swr'
import { Check, Clock3, Coins, Heart, Volume2, VolumeX, Zap } from 'lucide-react'
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
  return <section className={`rounded-[28px] border-2 border-violet-200/20 bg-[#1b2148] p-4 shadow-[0_18px_48px_rgba(4,9,32,0.28)] sm:p-5 ${className}`}>{children}</section>
}

export function WheelOfFortunePage() {
  const { data: state, error, isLoading, mutate } = useSWR<WheelState>('/api/wheel/state', getWheelState, { revalidateOnFocus: true })
  const [now, setNow] = useState(() => Date.now())
  const [rotation, setRotation] = useState(0)
  const [spinDurationMs, setSpinDurationMs] = useState(6200)
  const [spinning, setSpinning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeSpin, setActiveSpin] = useState<SpinResult | WheelSpin | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null)
  const [captchaChallengeToken, setCaptchaChallengeToken] = useState<string | null>(null)
  const [captchaSessionId, setCaptchaSessionId] = useState<string | null>(null)
  const [captchaWaiting, setCaptchaWaiting] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const tickIntervalRef = useRef<ReturnType<Window['setInterval']> | null>(null)
  const captchaPollRef = useRef<string | null>(null)

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
  const canSpin = cooldownRemainingMs === 0 && !busy && !spinning && !captchaUrl && !captchaWaiting
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
      const result = await postJson<{ solveUrl: string; challengeToken: string | null; captchaSessionId: string }>('/api/wheel/captcha/init', {})
      setCaptchaSessionId(result.captchaSessionId)
      setCaptchaChallengeToken(result.challengeToken)
      setCaptchaUrl(result.solveUrl)
    } catch (captchaError) {
      setMessage(captchaError instanceof Error ? captchaError.message : 'Could not start CAPTCHA verification.')
    } finally {
      setBusy(false)
    }
  }

  async function startSpin(verifiedCaptchaSessionId: string) {
    if (busy || spinning) return
    setBusy(true)
    setMessage(null)
    playTone(740, 0.06)

    try {
      const result = await postJson<SpinResult>('/api/wheel/spin', { captchaSessionId: verifiedCaptchaSessionId })
      setActiveSpin(result)
      const currentMod = ((rotation % 360) + 360) % 360
      const sectorAngle = 360 / wheelSectors.length
      const targetAngle = ((wheelSectors.length - result.sectorIndex) % wheelSectors.length) * sectorAngle
      const deltaToSector = (targetAngle - currentMod + 360) % 360
      const nextRotation = rotation + 360 * 7 + deltaToSector
      const nextSpinDurationMs = 4000 + Math.floor(Math.random() * 3001)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setSpinDurationMs(nextSpinDurationMs)
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

  async function waitForCaptchaVerification(verifiedCaptchaSessionId: string) {
    if (captchaPollRef.current === verifiedCaptchaSessionId) return
    captchaPollRef.current = verifiedCaptchaSessionId
    setCaptchaWaiting(true)
    setMessage('Checking the completed CAPTCHA session…')

    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`/api/wheel/captcha/status?state=${encodeURIComponent(verifiedCaptchaSessionId)}`, { cache: 'no-store' })
        const result = await response.json().catch(() => null) as { status?: string; error?: string } | null
        if (!response.ok) throw new Error(result?.error ?? 'Could not check CAPTCHA verification.')

        if (result?.status === 'verified') {
          setMessage(null)
          void startSpin(verifiedCaptchaSessionId)
          return
        }
        if (result?.status === 'failed' || result?.status === 'expired') {
          setMessage('The CAPTCHA was not confirmed. Please try again.')
          return
        }
        if (result?.status === 'consumed') {
          await mutate()
          setMessage('This verified spin has already started. Check for a reward waiting to be collected.')
          return
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500))
      }

      setMessage('The CAPTCHA is still being verified. Please try again in a moment.')
    } catch (captchaError) {
      setMessage(captchaError instanceof Error ? captchaError.message : 'Could not check CAPTCHA verification.')
    } finally {
      setCaptchaWaiting(false)
      setCaptchaUrl(null)
      setCaptchaChallengeToken(null)
      setCaptchaSessionId(null)
      if (captchaPollRef.current === verifiedCaptchaSessionId) captchaPollRef.current = null
    }
  }

  function handleCaptchaReturn(returnedSessionId: string) {
    if (!captchaSessionId || returnedSessionId !== captchaSessionId) {
      setMessage('Verification returned an unexpected session. Please start again.')
      return
    }
    setCaptchaUrl(null)
    void waitForCaptchaVerification(returnedSessionId)
  }

  async function claimReward(spin: WheelSpin) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await postJson<{ claimed: boolean; alreadyClaimed: boolean; spin: WheelSpin }>('/api/wheel/claim', { spinId: spin.id })
      setActiveSpin(result.spin)
      setDialogOpen(false)
      setMessage(null)
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

  const segmentBackground = `radial-gradient(ellipse at 34% 20%, rgba(255,255,255,0.22), transparent 38%), radial-gradient(circle, transparent 48%, rgba(0,0,0,0.32) 100%), repeating-conic-gradient(from -22.5deg, rgba(17,20,28,0.92) 0deg 1.2deg, transparent 1.2deg 45deg), conic-gradient(from -22.5deg, ${wheelSectors.map((sector, index) => `${sector.color} ${index * 45}deg ${(index + 1) * 45}deg`).join(', ')})`

  if (error) {
    return <LocalizedTree><main id="top" className="dashboard-page-shell"><section role="alert" className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-sm text-rose-200">{error.message}</section></main></LocalizedTree>
  }

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell cartoon-wheel-page min-w-0 space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 max-w-2xl space-y-1.5">
              <h1 className="text-3xl font-black tracking-tight sm:text-[36px]">Wheel of Fortune</h1>
              <p className="max-w-2xl text-xs leading-5 text-white/65 sm:text-sm">One free spin every 2 hours. The server selects each result using the published odds.</p>
          </div>
          <div className="flex w-full justify-center lg:w-auto lg:justify-end">
            <button type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} aria-pressed={soundEnabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-violet-200/25 bg-[#202951] px-3 text-[10px] font-extrabold text-white/85 shadow-[0_6px_16px_rgba(4,9,32,0.2)] transition hover:border-cyan-200/45 hover:bg-[#29345f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              {soundEnabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
              {soundEnabled ? 'Sound on' : 'Sound off'}
            </button>
          </div>
        </header>

        <WheelCard className="wheel-cartoon-card flex min-w-0 flex-1 flex-col items-center justify-center px-4 pb-6 pt-5 sm:p-6">
            <div className="wheel-stage relative z-10 mx-auto">
              <div className="wheel-metal-rim">
                <div className="wheel-gold-rim">
                  <div
                    role="img"
                    aria-label={`Eight-segment prize wheel with ${wheelSectors.map((sector) => sector.label).join(', ')}. The wheel rotates to the server-selected reward while the marker stays fixed.`}
                    className="relative aspect-square rounded-full"
                  >
                    <div
                      aria-hidden="true"
                      onTransitionEnd={handleWheelTransition}
                      className="absolute inset-0 rounded-full transition-transform [transition-timing-function:cubic-bezier(0.08,0.82,0.15,1)] motion-reduce:transition-none"
                      style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${spinDurationMs}ms` }}
                    >
                      <div className="wheel-spin-face absolute inset-0 rounded-full" style={{ background: segmentBackground }} />
                      {wheelSectors.map((sector, index) => {
                        const angle = index * 45
                        const radians = angle * Math.PI / 180
                        const isEnergyReward = sector.rewardType === 'energy'
                        const isLifeReward = sector.rewardType === 'life'
                        const labelRadius = 39
                        const labelStyle: CSSProperties = {
                          left: `${50 + Math.sin(radians) * labelRadius}%`,
                          top: `${50 - Math.cos(radians) * labelRadius}%`,
                          transform: 'translate(-50%, -50%)',
                        }
                        const prizeVariant = isEnergyReward
                          ? sector.key === 'arcade-energy' ? 'wheel-prize-cell--green' : 'wheel-prize-cell--blue'
                          : isLifeReward ? 'wheel-prize-cell--life' : 'wheel-prize-cell--gold'
                        const PrizeIcon = isEnergyReward ? Zap : isLifeReward ? Heart : Coins
                        const prizeAmount = sector.rewardType === 'homero' ? sector.shortLabel : `+${sector.rewardQuantity}`
                        const prizeUnit = isEnergyReward ? 'energy' : isLifeReward ? 'life' : 'HOMERO'

                        return (
                          <span key={sector.key} style={labelStyle} className={`wheel-sector-label wheel-prize-cell absolute z-10 ${prizeVariant}`}>
                            <span className="wheel-reward-copy">
                              <span className="wheel-reward-icon"><PrizeIcon size={10} strokeWidth={2.8} aria-hidden="true" /></span>
                              <span className="wheel-reward-amount">{prizeAmount}</span>
                            </span>
                            <span className="wheel-reward-unit">{prizeUnit}</span>
                          </span>
                        )
                      })}
                    </div>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full">
                      <div className="wheel-center-ring">
                        {Array.from({ length: 8 }, (_, index) => {
                          const radians = index * 45 * Math.PI / 180
                          const bulbStyle: CSSProperties = {
                            left: `${50 + Math.sin(radians) * 42}%`,
                            top: `${50 - Math.cos(radians) * 42}%`,
                          }
                          return <span key={`bulb-${index}`} className="wheel-center-bulb absolute size-3 -translate-x-1/2 -translate-y-1/2 sm:size-4" style={bulbStyle} />
                        })}
                        <div className="wheel-blue-hub flex flex-col items-center justify-center text-center">
                          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.65)] sm:text-[11px]">PEPE</span>
                          <span className="mt-0.5 text-[6px] font-extrabold uppercase tracking-[0.12em] text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.75)] sm:text-[8px]">Spin & win</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div aria-hidden="true" className="wheel-pointer-orbit pointer-events-none absolute inset-0 z-30">
                <div className="wheel-pin-shell"><span className="wheel-pin-bolt" /></div>
              </div>
            </div>

            <div className="relative z-10 mt-1 w-full max-w-sm px-1 text-center">
              <button type="button" onClick={() => void openCaptcha()} disabled={!canSpin || isLoading} className="wheel-spin-button inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black text-[#2f2242] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-55">
                {spinning ? 'Spinning…' : captchaWaiting ? 'Waiting for verification…' : busy ? 'Please wait…' : cooldownRemainingMs > 0 ? <>Next free spin in <span className="font-mono tabular-nums">{formatRemaining(cooldownRemainingMs)}</span></> : 'SPIN THE WHEEL · FREE'}
              </button>
              <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-[10px] font-semibold text-white/60"><Clock3 size={12} aria-hidden="true" /> One spin every 2 hours</p>
            </div>

            {pendingSpin && !spinning && (
              <div className="relative z-10 mt-4 flex w-full max-w-sm flex-col gap-2 rounded-2xl border-2 border-amber-200/35 bg-amber-200/10 p-3 text-left shadow-[0_8px_22px_rgba(9,12,34,0.2)]">
                <p className="text-[10px] font-extrabold text-amber-100">A reward is waiting to be collected.</p>
                <button type="button" onClick={openPendingReward} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-[10px] font-black text-[#34244a] shadow-[0_4px_0_rgba(126,83,48,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"><Check size={13} aria-hidden="true" /> Show my reward</button>
              </div>
            )}

            {message && <p role="status" aria-live="polite" className="relative z-10 mt-4 w-full max-w-sm rounded-2xl border-2 border-white/10 bg-[#131a3a]/80 px-3 py-2.5 text-left text-[10px] font-semibold leading-5 text-white/80">{message}</p>}
          </WheelCard>


        <AdsLabCaptchaModal
          solveUrl={captchaUrl}
          challengeToken={captchaChallengeToken}
          captchaSessionId={captchaSessionId}
          onReturned={handleCaptchaReturn}
          onClose={() => { setCaptchaUrl(null); setCaptchaSessionId(null); setCaptchaChallengeToken(null) }}
        />

        <dialog ref={dialogRef} onClose={() => setDialogOpen(false)} aria-labelledby="wheel-result-title" className="w-[min(92vw,420px)] rounded-[30px] border-2 border-amber-200/35 bg-[linear-gradient(145deg,#252b59_0%,#1b2148_58%,#17284a_100%)] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.7)] backdrop:bg-black/75">
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
