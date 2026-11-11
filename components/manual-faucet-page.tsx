'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Check, Clock3, Gift, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { AdsLabCaptchaModal } from '@/components/adslab-captcha-modal'
import { LocalizedTree } from '@/components/site-language-provider'
import { TokenLogo } from '@/components/token-logo'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type FaucetState = {
  rewardAtomic: string
  dailyLimit: number
  claimsLeft: number
  cooldownUntil: number
  dailyResetAt: string
}

type CaptchaInitResponse = {
  solveUrl: string
  challengeToken: string | null
  captchaSessionId: string
  stateToken: string
}

type ClaimResponse = {
  alreadyClaimed: boolean
  rewardAtomic: string
  state: FaucetState
}

async function getFaucetState(url: string): Promise<FaucetState> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as FaucetState & { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load the Faucet status.')
  return result as FaucetState
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
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ManualFaucetPage() {
  const router = useRouter()
  const { data, error: stateError, isLoading, mutate } = useSWR<FaucetState>('/api/manual-faucet/state', getFaucetState, {
    revalidateOnFocus: true,
  })
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [checkingCaptcha, setCheckingCaptcha] = useState(false)
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [captchaSessionId, setCaptchaSessionId] = useState<string | null>(null)
  const [captchaStateToken, setCaptchaStateToken] = useState<string | null>(null)
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const captchaPollRef = useRef<string | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const cooldownRemainingMs = data ? Math.max(0, data.cooldownUntil - now) : 0
  const canClaim = Boolean(data && data.claimsLeft > 0 && cooldownRemainingMs === 0)
  const reward = data ? formatTokenAtomic(data.rewardAtomic) : '10.00000000'

  async function startVerification() {
    if (!canClaim || busy || captchaVerified) return
    setBusy(true)
    setActionError(null)
    setMessage(null)
    setCaptchaVerified(false)
    setCaptchaStateToken(null)
    setCaptchaSessionId(null)
    setChallengeToken(null)
    setCaptchaUrl(null)
    try {
      const result = await postJson<CaptchaInitResponse>('/api/manual-faucet/captcha/init', {})
      setCaptchaSessionId(result.captchaSessionId)
      setCaptchaStateToken(result.stateToken)
      setChallengeToken(result.challengeToken)
      setCaptchaUrl(result.solveUrl)
      setCaptchaVerified(false)
    } catch (captchaError) {
      setActionError(captchaError instanceof Error ? captchaError.message : 'Could not start CAPTCHA.')
    } finally {
      setBusy(false)
    }
  }

  async function checkCaptcha(stateToken: string) {
    if (captchaPollRef.current === stateToken) return
    captchaPollRef.current = stateToken
    setCheckingCaptcha(true)
    setActionError(null)
    setMessage('Checking the completed CAPTCHA…')

    try {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const query = new URLSearchParams({ state: stateToken })
        const response = await fetch(`/api/manual-faucet/captcha/status?${query.toString()}`, { cache: 'no-store' })
        const result = await response.json().catch(() => null) as { status?: string; error?: string } | null
        if (!response.ok) throw new Error(result?.error ?? 'Could not check CAPTCHA verification.')

        if (result?.status === 'verified') {
          setCaptchaVerified(true)
          setMessage('CAPTCHA verified. Your PEPE claim is unlocked.')
          return
        }
        if (result?.status === 'failed' || result?.status === 'expired') {
          setCaptchaStateToken(null)
          setCaptchaSessionId(null)
          setActionError('CAPTCHA was not confirmed. Start a new verification to try again.')
          return
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500))
      }

      setMessage('The CAPTCHA is still being verified. You can check again in a moment.')
    } catch (captchaError) {
      setActionError(captchaError instanceof Error ? captchaError.message : 'Could not check CAPTCHA verification.')
    } finally {
      setCheckingCaptcha(false)
      if (captchaPollRef.current === stateToken) captchaPollRef.current = null
    }
  }

  function handleCaptchaReturn(returnedSessionId: string) {
    if (!captchaSessionId || returnedSessionId !== captchaSessionId || !captchaStateToken) {
      setActionError('Verification returned an unexpected session. Start again.')
      return
    }

    setCaptchaUrl(null)
    setChallengeToken(null)
    void checkCaptcha(captchaStateToken)
  }

  async function claimReward() {
    if (!canClaim || !captchaVerified || !captchaStateToken || busy) return
    setBusy(true)
    setActionError(null)
    setMessage(null)
    try {
      const result = await postJson<ClaimResponse>('/api/manual-faucet/claim', { stateToken: captchaStateToken })
      setMessage(null)
      setCaptchaVerified(false)
      setCaptchaStateToken(null)
      setCaptchaSessionId(null)
      setCaptchaUrl(null)
      setChallengeToken(null)
      await mutate(result.state, { revalidate: false })
      router.refresh()
    } catch (claimError) {
      setActionError(claimError instanceof Error ? claimError.message : 'Could not claim the PEPE reward.')
      void mutate()
    } finally {
      setBusy(false)
    }
  }

  const cooldownLabel = cooldownRemainingMs > 0 ? formatRemaining(cooldownRemainingMs) : null
  const buttonLabel = data?.claimsLeft === 0
    ? 'Daily claim limit reached'
    : cooldownLabel
      ? `Available in ${cooldownLabel}`
      : captchaVerified
        ? `Claim ${reward} PEPE`
        : 'Solve CAPTCHA to unlock'

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell space-y-5 sm:space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-300">Earning features</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">Manual Faucet</h1>
        <p className="max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">Claim free PEPE after completing a secure CAPTCHA.</p>
      </header>

      <section aria-label="Faucet reward and claim limit" className="grid gap-4 md:grid-cols-2">
        <div className="flex min-h-28 items-center gap-4 rounded-[24px] border border-cyan-200/15 bg-[#1b2148] p-5 shadow-[0_16px_44px_rgba(4,9,32,0.22)]">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Gift aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400">Reward per claim</p>
            <div className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl"><TokenLogo symbol="PEPE" size={24} /><span className="truncate">{reward} PEPE</span></div>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Credited after server verification</p>
          </div>
        </div>

        <div className="flex min-h-28 items-center gap-4 rounded-[24px] border border-amber-200/15 bg-[#1b2148] p-5 shadow-[0_16px_44px_rgba(4,9,32,0.22)]">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-200"><Clock3 aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-bold text-slate-400">Claims left today</p>
            <p className="mt-1 text-2xl font-black tracking-tight">{isLoading ? '—' : `${data?.claimsLeft ?? 0} / ${data?.dailyLimit ?? 1000}`}</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Resets at 00:00 UTC</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faucet-captcha-title" className="mx-auto w-full max-w-3xl rounded-[28px] border border-violet-200/20 bg-[#171e42] p-5 shadow-[0_20px_60px_rgba(4,9,32,0.32)] sm:p-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-violet-400/10 text-violet-200"><ShieldCheck aria-hidden="true" /></span>
          <h2 id="faucet-captcha-title" className="mt-4 text-lg font-black sm:text-xl">Secure human verification</h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-slate-400 sm:text-sm">Start the CAPTCHA challenge in a separate window, solve it, then return here. The claim stays locked until verification is complete.</p>

          <button
            type="button"
            onClick={startVerification}
            disabled={!canClaim || busy || checkingCaptcha || captchaVerified || isLoading}
            aria-label={captchaVerified ? 'CAPTCHA verified' : 'Start CAPTCHA verification'}
            className="mt-6 flex min-h-16 w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-left transition hover:border-cyan-200/40 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-md border ${captchaVerified ? 'border-emerald-300 bg-emerald-300 text-[#09130e]' : 'border-cyan-300/80 bg-transparent text-transparent'}`}>
              {captchaVerified && <Check size={15} strokeWidth={3} />}
            </span>
            <span className="flex-1 text-xs font-extrabold sm:text-sm">{busy ? 'Starting verification…' : captchaVerified ? 'CAPTCHA verified' : 'I am human'}</span>
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">CAPTCHA</span>
          </button>

          {captchaStateToken && !captchaVerified && (
            <button
              type="button"
              onClick={() => void checkCaptcha(captchaStateToken)}
              disabled={checkingCaptcha || busy}
              className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-bold text-cyan-200 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-wait disabled:opacity-60"
            >
              {checkingCaptcha ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}
              {checkingCaptcha ? 'Checking verification…' : 'Check CAPTCHA status'}
            </button>
          )}

          <button
            type="button"
            onClick={claimReward}
            disabled={!canClaim || !captchaVerified || busy || isLoading}
            aria-describedby="claim-note"
            className="mt-6 flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 py-3 text-xs font-black uppercase tracking-wide text-[#07140f] shadow-lg shadow-cyan-950/20 transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171e42] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : null}
            {busy ? 'Verifying and claiming…' : buttonLabel}
          </button>

          <p id="claim-note" className="mt-3 flex items-center justify-center gap-1.5 text-[10px] leading-5 text-slate-500">
            <ShieldCheck aria-hidden="true" size={13} />
            One claim every 7 seconds. Daily limit resets at 00:00 UTC.
          </p>

          {stateError && (
            <div role="alert" className="mt-4 flex flex-col items-center gap-2 text-xs text-rose-200">
              <span>{stateError.message}</span>
              <button type="button" onClick={() => void mutate()} className="rounded-lg px-3 py-2 font-bold text-cyan-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Retry loading</button>
            </div>
          )}
          {actionError && <p role="alert" className="mt-4 text-xs font-semibold text-rose-200">{actionError}</p>}
          {message && <p role="status" aria-live="polite" className="mt-4 text-xs font-semibold text-emerald-200">{message}</p>}
        </div>
      </section>

      <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-center text-[10px] leading-5 text-slate-500">
        <ShieldCheck aria-hidden="true" size={14} className="shrink-0" />
        <p>CAPTCHA results are verified by the server before any PEPE is credited.</p>
      </div>

      <AdsLabCaptchaModal
        purpose="faucet"
        solveUrl={captchaUrl}
        challengeToken={challengeToken}
        captchaSessionId={captchaSessionId}
        onReturned={handleCaptchaReturn}
        onClose={() => setCaptchaUrl(null)}
      />
    </main>
    </LocalizedTree>
  )
}
