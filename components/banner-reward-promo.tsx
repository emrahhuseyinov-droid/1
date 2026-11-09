'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { ArrowUpRight, Gift, Sparkles, X } from 'lucide-react'
import { AdsLabBanner } from '@/components/adslab-banner'
import { useSiteLanguage } from '@/components/site-language-provider'

type BannerPromoState =
  | { phase: 'waiting'; nextAt: string }
  | { phase: 'active'; promoId: string }
  | { phase: 'exhausted'; resetAt: string }

type BannerPromoAction = { action: 'click' | 'dismiss'; promoId: string }
type BannerPromoActionResponse = BannerPromoState & { rewardGranted: boolean }

async function fetchPromoState(url: string): Promise<BannerPromoState> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load banner promotion.')
  return response.json()
}

async function sendPromoAction(url: string, { arg }: { arg: BannerPromoAction }): Promise<BannerPromoActionResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  })
  if (!response.ok) throw new Error('Could not update banner promotion.')
  return response.json()
}

export function BannerRewardPromo() {
  const router = useRouter()
  const { language } = useSiteLanguage()
  const copy = language === 'ru'
    ? {
        label: 'Бонус AdsLab',
        title: 'Заберите 15 PEPE',
        schedule: 'До 5 раз в день · каждые 2 часа',
        adLabel: 'Рекламный баннер',
        claim: 'Забрать награду',
        reward: '+15 PEPE сразу',
        destination: 'AdsLab откроется в новой вкладке',
        dismiss: 'Закрыть бонусный баннер',
        ariaLabel: 'Бонус AdsLab: 15 PEPE за нажатие',
      }
    : {
        label: 'AdsLab bonus',
        title: 'Claim 15 PEPE',
        schedule: 'Up to 5 times a day · every 2 hours',
        adLabel: 'Sponsored banner',
        claim: 'Claim reward',
        reward: '+15 PEPE instantly',
        destination: 'AdsLab opens in a new tab',
        dismiss: 'Dismiss reward banner',
        ariaLabel: 'AdsLab bonus: 15 PEPE per click',
      }

  const { data, mutate } = useSWR<BannerPromoState>('/api/banner-promo', fetchPromoState, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    refreshInterval: (state) => {
      if (!state) return 0
      if (state.phase === 'active') return 45_000
      const nextAt = state.phase === 'waiting' ? state.nextAt : state.resetAt
      return Math.max(1_000, new Date(nextAt).getTime() - Date.now())
    },
  })
  const { trigger, isMutating } = useSWRMutation<BannerPromoActionResponse, Error, string, BannerPromoAction>(
    '/api/banner-promo',
    sendPromoAction,
  )

  async function handleAction(action: BannerPromoAction['action'], promoId: string) {
    try {
      const result = await trigger({ action, promoId })
      const { rewardGranted, ...nextState } = result
      await mutate(nextState, { revalidate: false })
      if (action === 'click' && rewardGranted) router.refresh()
    } catch {
      await mutate()
    }
  }

  if (data?.phase !== 'active') return null

  return (
    <aside className="pointer-events-none fixed right-3 top-[74px] z-50 w-[calc(100vw-1.5rem)] max-w-[360px] sm:right-5 sm:top-[78px]">
      <section
        aria-label={copy.ariaLabel}
        aria-live="polite"
        className="banner-reward-enter pointer-events-auto relative isolate overflow-hidden rounded-[26px] border-2 border-amber-300/45 bg-[#151d3e] p-3 text-white shadow-[0_20px_60px_rgba(3,8,30,0.5)] sm:p-4"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-amber-300/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-10 size-32 rounded-full bg-cyan-400/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_8%,rgba(255,255,255,0.11)_0_1.5px,transparent_2px)] bg-[length:24px_24px] opacity-50" />

        <button
          type="button"
          aria-label={copy.dismiss}
          disabled={isMutating}
          onClick={() => void handleAction('dismiss', data.promoId)}
          className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-[#0d1430]/75 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
        >
          <X aria-hidden="true" size={14} />
        </button>

        <div className="relative flex items-start gap-3 pr-8">
          <span className="banner-reward-gift relative mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-[17px] border-2 border-white/30 bg-gradient-to-br from-[#ffe28a] via-[#ffbe47] to-[#ff8f59] text-[#42250b] shadow-[0_10px_24px_rgba(255,173,55,0.28)]">
            <Gift aria-hidden="true" size={23} />
            <Sparkles aria-hidden="true" size={13} className="absolute -right-1 -top-1 text-cyan-200 drop-shadow" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100">
              {copy.label}
            </span>
            <h2 className="mt-2 text-[16px] font-black leading-tight tracking-[-0.02em] text-white">
              {copy.title}
            </h2>
            <p className="mt-1 text-[10px] font-bold text-slate-300">
              {copy.schedule}
            </p>
          </div>
        </div>

        <div className="relative mt-3 rounded-[18px] border border-white/10 bg-[#0c1430]/65 p-2">
          <p className="mb-1.5 text-center text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
            {copy.adLabel}
          </p>
          <AdsLabBanner
            id="unit-rvjn935d7"
            container="adslab-banner-unit-rvjn935d7"
            alignment="center"
            format="compact"
            onClick={() => void handleAction('click', data.promoId)}
          />
        </div>

        <a
          href="/offerwall"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${copy.claim} — ${copy.reward}`}
          aria-busy={isMutating}
          onClick={() => void handleAction('click', data.promoId)}
          className="group relative mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-[17px] border-2 border-amber-100/70 bg-gradient-to-r from-[#ffe17e] via-[#ffc35a] to-[#ff9a70] px-3.5 py-2.5 text-left text-[#39220b] shadow-[0_8px_22px_rgba(255,174,63,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(255,174,63,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#151d3e] motion-reduce:transform-none motion-reduce:transition-none"
        >
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-black">
            <Gift aria-hidden="true" size={16} className="shrink-0" />
            <span className="truncate">{copy.claim}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#432d14]/10 px-2 py-1 text-[10px] font-black">
            {copy.reward}
            <ArrowUpRight aria-hidden="true" size={13} />
          </span>
        </a>
        <p className="relative mt-2 text-center text-[9px] font-medium text-slate-400">
          {copy.destination}
        </p>
      </section>
    </aside>
  )
}
