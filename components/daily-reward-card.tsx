'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Gift, LoaderCircle, Sparkles } from 'lucide-react'
import { atomicUnitsPerDoge, dailyBonusRewardsAtomic, getDailyBonusRewardAtomic } from '@/lib/daily-bonus'
import type { DashboardOverview } from '@/lib/dashboard-types'
import { LocalizedTree } from '@/components/site-language-provider'
import { AdsLabCaptchaModal } from '@/components/adslab-captcha-modal'

type DailyBonusStatus = DashboardOverview['dailyBonus']

type ClaimResponse = {
  error?: string
  code?: string
  claimed?: boolean
  alreadyClaimed?: boolean
  rewardAtomic?: number
  streak?: number
  energy?: number | null
  energyAdded?: number
  energyGranted?: boolean
  energyCap?: number
}

type CaptchaChallenge = {
  solveUrl: string
  challengeToken: string | null
  captchaSessionId: string
}

type CaptchaStatusResponse = {
  error?: string
  status?: string
}

function formatRewardAtomic(amountAtomic: number) {
  return (amountAtomic / atomicUnitsPerDoge).toFixed(8).replace(/\.?0+$/, '')
}

function formatCompactRewardAtomic(amountAtomic: number) {
  return formatRewardAtomic(amountAtomic)
}

export function DailyRewardCard({ dailyBonus }: { dailyBonus: DailyBonusStatus }) {
  const router = useRouter()
  const [isClaiming, setIsClaiming] = useState(false)
  const [claim, setClaim] = useState<{ rewardAtomic: number; streak: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null)
  const [captchaStatusMessage, setCaptchaStatusMessage] = useState<string | null>(null)

  const claimedToday = dailyBonus.claimedToday || claim !== null
  const streak = claim?.streak ?? dailyBonus.streak
  const dayNumber = claimedToday
    ? Math.min(Math.max(streak, 1), dailyBonusRewardsAtomic.length)
    : Math.min(dailyBonus.streak + 1, dailyBonusRewardsAtomic.length)
  const daysCompleted = claimedToday ? streak : dailyBonus.streak
  const rewardAtomic = claim?.rewardAtomic ?? getDailyBonusRewardAtomic(
    claimedToday ? Math.max(0, dailyBonus.streak - 1) : dailyBonus.streak,
  )

  async function creditDailyBonus(captchaSessionId: string) {
    const response = await fetch('/api/referrals/daily-bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captchaSessionId }),
    })
    const data = await response.json().catch(() => null) as ClaimResponse | null

    if (
      !response.ok ||
      !data ||
      (!data.claimed && !data.alreadyClaimed) ||
      !Number.isSafeInteger(data.rewardAtomic) ||
      !Number.isSafeInteger(data.streak)
    ) {
      if (data?.code === 'captcha_required') {
        setCaptchaChallenge(null)
        setCaptchaStatusMessage(null)
      }
      throw new Error(data?.error ?? 'Could not claim your Daily Bonus. Please try again.')
    }

    setClaim({ rewardAtomic: data.rewardAtomic as number, streak: data.streak as number })
    setCaptchaChallenge(null)
    setCaptchaStatusMessage(null)
    router.refresh()
  }

  async function checkCaptcha(captchaSessionId: string) {
    if (isClaiming) return
    setIsClaiming(true)
    setError(null)
    setCaptchaStatusMessage('Checking verification…')

    try {
      const response = await fetch(
        `/api/wheel/captcha/status?state=${encodeURIComponent(captchaSessionId)}&purpose=daily_bonus`,
        { cache: 'no-store' },
      )
      const data = await response.json().catch(() => null) as CaptchaStatusResponse | null

      if (!response.ok || !data || typeof data.status !== 'string') {
        throw new Error(data?.error ?? 'Could not check CAPTCHA verification.')
      }

      if (data.status === 'verified') {
        await creditDailyBonus(captchaSessionId)
        return
      }

      if (data.status === 'pending') {
        setCaptchaStatusMessage('The CAPTCHA is still being verified. You can check again in a moment.')
        return
      }

      setCaptchaChallenge(null)
      setCaptchaStatusMessage(null)
      setError('CAPTCHA was not confirmed. Start a new verification to try again.')
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : 'Could not check CAPTCHA verification.'
      setError(message)
      if (captchaChallenge) setCaptchaStatusMessage(message)
    } finally {
      setIsClaiming(false)
    }
  }

  async function startCaptcha() {
    if (isClaiming || claimedToday) return
    setIsClaiming(true)
    setError(null)

    try {
      const response = await fetch('/api/wheel/captcha/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'daily_bonus' }),
      })
      const data = await response.json().catch(() => null) as {
        error?: string
        solveUrl?: string
        challengeToken?: string | null
        captchaSessionId?: string
      } | null

      if (!response.ok || !data || typeof data.solveUrl !== 'string' || typeof data.captchaSessionId !== 'string') {
        throw new Error(data?.error ?? 'Could not start CAPTCHA verification. Please try again.')
      }

      setCaptchaChallenge({
        solveUrl: data.solveUrl,
        challengeToken: typeof data.challengeToken === 'string' ? data.challengeToken : null,
        captchaSessionId: data.captchaSessionId,
      })
      setCaptchaStatusMessage(null)
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Could not start CAPTCHA verification.')
    } finally {
      setIsClaiming(false)
    }
  }

  async function handleClaim() {
    if (isClaiming || claimedToday) return
    if (captchaChallenge) {
      await checkCaptcha(captchaChallenge.captchaSessionId)
      return
    }
    await startCaptcha()
  }

  return (
    <LocalizedTree>
    <>
    <section aria-labelledby="daily-bonus-title" className="relative isolate flex min-h-[340px] flex-col justify-between overflow-hidden rounded-[26px] border border-amber-300/20 bg-gradient-to-br from-[#211c19] via-[#171a25] to-[#0d1422] p-5 shadow-xl shadow-amber-950/10 sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-amber-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-10 -z-10 size-48 rounded-full bg-orange-400/[0.07] blur-3xl" />

      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-300/20 to-orange-500/10 text-amber-300 shadow-inner shadow-amber-200/5">
              <Gift size={20} />
            </span>
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-200/70">Daily Bonus</p>
              <h2 id="daily-bonus-title" className="mt-0.5 text-sm font-extrabold text-white">Your Daily HOMERO Bonus</h2>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-wide ${claimedToday ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>
            <span className={`size-1.5 rounded-full ${claimedToday ? 'bg-emerald-400' : 'animate-pulse bg-amber-300'}`} />
            {claimedToday ? 'Claimed today' : 'Ready to claim'}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-400">{claimedToday ? 'Collected today' : 'Today\'s Daily Bonus'}</p>
            <p className="mt-1 font-mono text-2xl font-black tracking-tight text-white sm:text-[30px]">
              {formatRewardAtomic(rewardAtomic)} <span className="text-xs font-extrabold tracking-normal text-amber-200">HOMERO</span>
            </p>
          </div>
          <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-200/80"><Sparkles size={13} />Day {dayNumber} of 7</span>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">7-day streak</p>
            <p className="text-[9px] font-bold text-slate-500">{Math.min(daysCompleted, dailyBonusRewardsAtomic.length)} / 7 collected</p>
          </div>
          <ol aria-label="Seven-day Daily Bonus streak" className="grid grid-cols-7 gap-1.5">
            {dailyBonusRewardsAtomic.map((amount, index) => {
              const step = index + 1
              const completed = step <= daysCompleted
              const current = step === dayNumber
              return (
                <li
                  key={step}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Day ${step}: ${formatCompactRewardAtomic(amount)} HOMERO${completed ? ', collected' : current ? ', ready' : ''}`}
                  className={`flex min-w-0 flex-col items-center rounded-xl border px-1 py-2 text-center transition-colors ${completed ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : current ? 'border-amber-200/40 bg-amber-200/[0.12] text-white shadow-[0_0_18px_rgba(251,191,36,0.1)]' : 'border-white/[0.07] bg-white/[0.025] text-slate-500'}`}
                >
                  <span className="text-[8px] font-extrabold uppercase tracking-wide">{completed ? <Check size={11} aria-hidden="true" /> : `Day ${step}`}</span>
                  <span className="mt-1 max-w-full truncate font-mono text-[8px] font-bold sm:text-[9px]">{formatCompactRewardAtomic(amount)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleClaim}
          disabled={claimedToday || isClaiming}
          className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 px-4 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171a25] disabled:cursor-not-allowed disabled:from-emerald-400/15 disabled:via-emerald-400/15 disabled:to-emerald-400/15 disabled:text-emerald-200 disabled:shadow-none"
        >
          {isClaiming ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : claimedToday ? <Check size={15} aria-hidden="true" /> : <Gift size={15} aria-hidden="true" />}
          {isClaiming ? captchaChallenge ? 'Checking verification…' : 'Starting verification…' : claimedToday ? 'Collected today' : captchaChallenge ? 'Check CAPTCHA status' : 'Claim Daily Bonus'}
          {!claimedToday && !isClaiming && <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
        </button>
        {error && <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-300">{error}</p>}
      </div>
    </section>
    <AdsLabCaptchaModal
      solveUrl={captchaChallenge?.solveUrl ?? null}
      challengeToken={captchaChallenge?.challengeToken ?? null}
      captchaSessionId={captchaChallenge?.captchaSessionId ?? null}
      purpose="daily_bonus"
      statusMessage={captchaStatusMessage}
      checking={isClaiming}
      onReturned={(sessionId) => void checkCaptcha(sessionId)}
      onCheckStatus={() => {
        if (captchaChallenge) void checkCaptcha(captchaChallenge.captchaSessionId)
      }}
      onClose={() => {
        setCaptchaChallenge(null)
        setCaptchaStatusMessage(null)
      }}
    />
    </>
    </LocalizedTree>
  )
}
