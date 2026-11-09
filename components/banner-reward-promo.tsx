'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { ArrowUpRight, Gift, Sparkles, X } from 'lucide-react'

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
    <aside
      aria-label="Reward banner"
      aria-live="polite"
      className="fixed right-3 top-[74px] z-50 w-[calc(100vw-1.5rem)] max-w-[340px] sm:right-5 sm:top-[78px]"
    >
      <div className="relative overflow-hidden rounded-[25px] border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-cyan-50 p-1 shadow-[0_18px_52px_rgba(15,23,42,0.22)] dark:border-amber-300/30 dark:from-[#31251b] dark:via-[#142034] dark:to-[#0d3940]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-7 -top-7 size-24 rounded-full bg-amber-300/25 blur-2xl" />
        <button
          type="button"
          aria-label="Dismiss reward banner"
          disabled={isMutating}
          onClick={() => void handleAction('dismiss', data.promoId)}
          className="absolute right-3 top-3 z-10 rounded-full border border-slate-200/80 bg-white/80 p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X aria-hidden="true" size={14} />
        </button>
        <a
          href="/offerwall"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open AdsLab offerwall and receive 15 PEPE"
          onClick={() => void handleAction('click', data.promoId)}
          className="group relative flex min-h-[132px] items-start gap-3 rounded-[21px] p-4 pr-12 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span className="relative mt-1 flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-gradient-to-br from-amber-300 to-orange-400 text-amber-950 shadow-[0_8px_18px_rgba(251,146,60,0.32)] transition-transform group-hover:-rotate-6 group-hover:scale-105 motion-reduce:transition-none">
            <Gift aria-hidden="true" size={22} />
            <Sparkles aria-hidden="true" size={12} className="absolute -right-1 -top-1 text-cyan-600" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-cyan-800 dark:bg-cyan-300/15 dark:text-cyan-200">
              Surprise bonus
            </span>
            <span className="mt-2 block text-[15px] font-black leading-tight text-slate-900 dark:text-white">
              Click a banner, get 15 PEPE
            </span>
            <span className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
              Open AdsLab offers <ArrowUpRight aria-hidden="true" size={12} />
            </span>
          </span>
        </a>
      </div>
    </aside>
  )
}
