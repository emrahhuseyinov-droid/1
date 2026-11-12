'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Check, Coins, Gift, Heart, Sparkles, X } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type RewardNotificationEvent = {
  id: string
  source: string
  kind: 'token' | 'energy' | 'life'
  tokenSymbol?: 'PEPE' | 'HOMERO'
  amountAtomic?: string
  quantity?: string
  createdAt: string
}

type RewardNotificationsResponse = { events: RewardNotificationEvent[] }

const rewardLabels: Record<string, { en: string; ru: string }> = {
  adslab_ptc: { en: 'PTC task', ru: 'Задание PTC' },
  adslab_shortlink: { en: 'Shortlink task', ru: 'Задание по короткой ссылке' },
  adslab_offerwall: { en: 'Offerwall task', ru: 'Задание по предложению' },
  advertiser_task: { en: 'Advertiser task', ru: 'Рекламное задание' },
  youtube_advertiser_task: { en: 'Sponsored video', ru: 'Рекламное видео' },
  view_ads: { en: 'View Ads task', ru: 'Задание просмотра рекламы' },
  shortlink: { en: 'Shortlink task', ru: 'Задание Shortlink' },
  applixir_video: { en: 'Watch & Earn video', ru: 'Видео Watch & Earn' },
  daily_bonus: { en: 'Daily bonus', ru: 'Ежедневный бонус' },
  banner_click_promo: { en: 'Banner click bonus', ru: 'Бонус за клик по баннеру' },
  manual_faucet: { en: 'CAPTCHA reward', ru: 'Награда за CAPTCHA' },
  manual_claim: { en: 'Faucet claim', ru: 'Награда Faucet' },
  manual_mining: { en: 'Manual reward', ru: 'Ручная награда' },
  promo_code: { en: 'Promo code reward', ru: 'Награда за промокод' },
  arcade_homero_coin: { en: 'Arcade HOMERO coin', ru: 'Монета HOMERO в Аркаде' },
  arcade_reward: { en: 'Arcade reward', ru: 'Награда Аркады' },
  wheel_of_fortune: { en: 'Wheel of Fortune', ru: 'Колесо удачи' },
  withdrawal_refund: { en: 'PEPE withdrawal refund', ru: 'Возврат вывода PEPE' },
  admin_adjustment: { en: 'Account credit', ru: 'Зачисление на счёт' },
  referral_commission: { en: 'Referral commission', ru: 'Реферальная комиссия' },
}

const taskSources = new Set([
  'adslab_ptc',
  'adslab_shortlink',
  'adslab_offerwall',
  'advertiser_task',
  'youtube_advertiser_task',
  'view_ads',
  'shortlink',
  'applixir_video',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRewardNotificationEvent(value: unknown): value is RewardNotificationEvent {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.source !== 'string'
    || typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt))) return false

  if (value.kind === 'token') {
    return (value.tokenSymbol === 'PEPE' || value.tokenSymbol === 'HOMERO')
      && typeof value.amountAtomic === 'string'
      && /^\d+$/.test(value.amountAtomic)
  }

  return (value.kind === 'energy' || value.kind === 'life')
    && typeof value.quantity === 'string'
    && /^\d+(?:\.\d+)?$/.test(value.quantity)
}

async function fetchRewardNotifications(url: string): Promise<RewardNotificationsResponse | null> {
  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Could not check reward updates.')

  const payload: unknown = await response.json().catch(() => null)
  if (!isRecord(payload) || !Array.isArray(payload.events)) return { events: [] }

  return { events: payload.events.filter(isRewardNotificationEvent) }
}

function RewardToastCard({
  event,
  isRussian,
  onClose,
}: {
  event: RewardNotificationEvent
  isRussian: boolean
  onClose: () => void
}) {
  const label = rewardLabels[event.source]
  const eventLabel = label ? (isRussian ? label.ru : label.en) : (isRussian ? 'Награда' : 'Reward')
  const title = taskSources.has(event.source)
    ? (isRussian ? 'Задание выполнено!' : 'Task completed!')
    : (isRussian ? 'Награда начислена!' : 'Reward received!')
  const rewardValue = event.kind === 'token'
    ? `+${formatTokenAtomic(event.amountAtomic ?? '0')} ${event.tokenSymbol ?? ''}`
    : event.kind === 'energy'
      ? `+${Number(event.quantity ?? 0).toFixed(2).replace(/\.?0+$/, '')} ${isRussian ? 'энергии для бегуна Pepe' : 'Pepe Runner energy'}`
      : `+${Number(event.quantity ?? 0).toFixed(2).replace(/\.?0+$/, '')} ${isRussian ? 'доп. жизни' : 'extra life'}`

  return (
    <article role="status" aria-live="polite" className="relative w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border-2 border-cyan-200/60 bg-gradient-to-br from-[#283b78] via-[#27235f] to-[#171e45] p-3 text-white shadow-[0_22px_55px_rgba(3,8,32,0.48)] ring-4 ring-cyan-200/10 sm:w-[min(360px,calc(100vw-2rem))] sm:rounded-[26px] sm:p-4">
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full border-[14px] border-white/[0.06]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 left-1/3 size-28 rounded-full bg-cyan-300/[0.08] blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-1 rounded-b-full bg-gradient-to-r from-cyan-200 via-white to-amber-200" />

      <div className="relative flex items-start gap-2.5 sm:gap-3">
        <span aria-hidden="true" className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-cyan-200 via-sky-300 to-indigo-300 text-indigo-950 shadow-lg shadow-sky-950/30 ring-4 ring-white/10 sm:size-12 sm:rounded-[18px]">
          <Gift className="size-[18px] sm:size-[22px]" strokeWidth={2.5} />
          <Sparkles className="absolute -right-1 -top-1 size-[13px] text-amber-200 sm:size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-black leading-4 tracking-tight text-white sm:text-sm sm:leading-5">{title}</p>
              <p className="mt-0.5 truncate text-[10px] font-bold text-cyan-100/80 sm:text-[11px]">{eventLabel}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={isRussian ? 'Закрыть уведомление' : 'Dismiss notification'} className="-mr-0.5 -mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 sm:-mr-1 sm:-mt-1 sm:size-8">
              <X className="size-3.5 sm:size-4" />
            </button>
          </div>

          <div className="mt-2.5 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-amber-200/45 bg-gradient-to-r from-amber-300/20 to-yellow-200/10 px-2.5 text-[11px] font-black text-amber-100 shadow-inner shadow-amber-100/5 sm:mt-3 sm:min-h-9 sm:gap-2 sm:px-3 sm:text-xs">
            {event.kind === 'token' ? <Coins className="size-[13px] shrink-0 text-amber-200 sm:size-[15px]" /> : event.kind === 'energy' ? <Sparkles className="size-[13px] shrink-0 text-cyan-200 sm:size-[15px]" /> : <Heart className="size-[13px] shrink-0 text-rose-200 sm:size-[15px]" />}
            <span className="min-w-0 break-words">{rewardValue}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2 text-[9px] font-semibold text-cyan-100/70 sm:mt-3 sm:pt-2.5 sm:text-[10px]">
        <Check className="size-[11px] shrink-0 text-emerald-300 sm:size-[13px]" />
        {isRussian ? 'Награда уже на вашем балансе' : 'The reward is already in your balance'}
      </div>
    </article>
  )
}

export function RewardNotificationCenter() {
  const router = useRouter()
  const { language } = useSiteLanguage()
  const seenIdsRef = useRef<Set<string> | null>(null)
  const mountedAtRef = useRef(Date.now())
  const { data } = useSWR('/api/reward-notifications', fetchRewardNotifications, {
    refreshInterval: 12_000,
    revalidateOnFocus: true,
    refreshWhenHidden: false,
  })

  useEffect(() => {
    if (!data) return

    if (!seenIdsRef.current) {
      const newEvents = data.events
        .filter((event) => Date.parse(event.createdAt) >= mountedAtRef.current - 1_000)
        .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
      seenIdsRef.current = new Set(data.events.map((event) => event.id))
      for (const event of newEvents) {
        toast.custom((toastId) => (
          <RewardToastCard event={event} isRussian={language === 'ru'} onClose={() => toast.dismiss(toastId)} />
        ), { id: `reward-${event.id}`, duration: 7_200 })
      }
      if (newEvents.length > 0) router.refresh()
      return
    }

    const seenIds = seenIdsRef.current
    const newEvents = data.events
      .filter((event) => !seenIds.has(event.id))
      .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))

    for (const event of newEvents) {
      toast.custom((toastId) => (
        <RewardToastCard
          event={event}
          isRussian={language === 'ru'}
          onClose={() => toast.dismiss(toastId)}
        />
      ), {
        id: `reward-${event.id}`,
        duration: 7_200,
      })
      seenIds.add(event.id)
    }

    for (const event of data.events) seenIds.add(event.id)
    if (newEvents.length > 0) router.refresh()
    while (seenIds.size > 200) {
      const oldestId = seenIds.values().next().value
      if (!oldestId) break
      seenIds.delete(oldestId)
    }
  }, [data, language, router])

  return <Toaster position="top-right" theme="dark" duration={7_200} visibleToasts={3} closeButton={false} gap={14} />
}
