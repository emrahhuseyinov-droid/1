'use client'

import type { FormEvent } from 'react'
import Image from 'next/image'
import { LoaderCircle, Megaphone } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import { getYouTubeCampaignPricing, YOUTUBE_CAMPAIGN_MAX_TASKS } from '@/lib/pepe-amount'

export function YoutubeCampaignForm({
  title,
  targetUrl,
  description,
  taskCount,
  durationSeconds,
  perViewReward,
  perViewCommission,
  perViewTotal,
  totalCost,
  estimatedUsd,
  validTaskCount,
  hasEnoughFunds,
  ready,
  submitting,
  onTitleChange,
  onUrlChange,
  onDescriptionChange,
  onTaskCountChange,
  onDurationChange,
  onSubmit,
}: {
  title: string
  targetUrl: string
  description: string
  taskCount: string
  durationSeconds: 30 | 60
  perViewReward: string
  perViewCommission: string
  perViewTotal: string
  totalCost: string
  estimatedUsd: string | null
  validTaskCount: boolean
  hasEnoughFunds: boolean
  ready: boolean
  submitting: boolean
  onTitleChange: (value: string) => void
  onUrlChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onTaskCountChange: (value: string) => void
  onDurationChange: (value: 30 | 60) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'

  return (
    <section aria-labelledby="youtube-campaign-create-title" className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0b1228] p-4 shadow-[0_24px_60px_rgba(3,8,24,0.34)] sm:p-6 lg:p-7">
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-rose-400/[0.045] blur-3xl" />
      <header className="relative flex flex-col gap-4 overflow-hidden rounded-[24px] border border-rose-100/[0.12] bg-gradient-to-br from-[#171f3d] via-[#141a32] to-[#24182f] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-rose-300/[0.08] blur-3xl" />
        <div className="relative flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-rose-100/15 bg-rose-300/[0.08] shadow-[0_8px_24px_rgba(244,63,94,0.12)]"><Image src="/youtube.svg" alt="YouTube" width={32} height={23} className="h-[22px] w-8 object-contain" /></span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-rose-100/85">{isRussian ? 'YouTube · рекламная студия' : 'YouTube · campaign studio'}</p>
            <h1 id="youtube-campaign-create-title" className="sr-only">{isRussian ? 'Создать YouTube-кампанию' : 'Create a YouTube campaign'}</h1>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#0b1228]/65 px-4 py-3 shadow-inner shadow-black/10">
          <span className="grid size-10 place-items-center rounded-xl border border-rose-100/10 bg-rose-300/[0.07]"><Image src="/youtube.svg" alt="YouTube" width={28} height={20} className="h-5 w-7 object-contain" /></span>
          <span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{isRussian ? 'Награда за просмотр' : 'Reward per view'}</span>
            <span className="mt-0.5 block font-mono text-lg font-black tracking-tight text-white">{perViewReward} <span className="text-sm text-rose-100">PEPE</span></span>
            <span className="mt-0.5 inline-flex rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold text-slate-300">{durationSeconds} {isRussian ? 'секунд' : 'seconds'}</span>
          </span>
        </div>
      </header>

      <form onSubmit={onSubmit} className="relative mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.85fr)]">
        <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-title" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Название' : 'Campaign name'}</label>
            <input id="youtube-campaign-title" required minLength={3} maxLength={80} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={isRussian ? 'Название видео' : 'Video title'} disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-url" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Ссылка YouTube' : 'YouTube link'}</label>
            <input id="youtube-campaign-url" type="url" required maxLength={2048} value={targetUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://youtu.be/…" disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="youtube-campaign-description" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Описание' : 'Description'} <span className="font-normal text-slate-500">({isRussian ? 'необязательно' : 'optional'})</span></label>
          <textarea id="youtube-campaign-description" rows={2} maxLength={500} aria-describedby="youtube-campaign-description-count" value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder={isRussian ? 'Кратко опишите видео' : 'Briefly describe the video'} disabled={submitting || !ready} className="min-h-16 resize-y rounded-xl border border-white/10 bg-[#111a35] px-3 py-2.5 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
          <p id="youtube-campaign-description-count" className="text-right text-[9px] font-medium text-slate-500">{description.length} / 500 {isRussian ? 'символов' : 'characters'}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[10px] font-bold text-slate-200">{isRussian ? 'Обязательное время просмотра' : 'Required watch time'}</legend>
            <div className="grid grid-cols-2 gap-2">
              {([30, 60] as const).map((duration) => {
                const pricing = getYouTubeCampaignPricing(duration)
                const totalAtomic = BigInt(pricing.rewardAtomic) + BigInt(pricing.commissionAtomic)
                const totalPepe = (totalAtomic / 100_000_000n).toLocaleString(isRussian ? 'ru-RU' : 'en-US')
                return (
                  <button key={duration} type="button" aria-pressed={durationSeconds === duration} onClick={() => onDurationChange(duration)} disabled={submitting || !ready} className={`flex min-h-12 flex-col items-center justify-center rounded-xl border px-3 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:opacity-50 ${durationSeconds === duration ? 'border-rose-200/35 bg-rose-300/[0.09] text-rose-100' : 'border-white/10 bg-[#111a35] text-slate-300 hover:border-white/15 hover:bg-white/[0.04]'}`}>
                    <span>{duration} {isRussian ? 'секунд' : 'seconds'}</span>
                    <span className="mt-0.5 text-[9px] font-medium text-slate-400">{totalPepe} PEPE / {isRussian ? 'просмотр' : 'view'}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-count" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Количество просмотров' : 'Number of views'}</label>
            <input id="youtube-campaign-count" type="number" inputMode="numeric" required min={1} max={YOUTUBE_CAMPAIGN_MAX_TASKS} step={1} value={taskCount} onChange={(event) => onTaskCountChange(event.target.value)} disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 font-mono text-xs text-white outline-none transition focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
            {!validTaskCount && <p className="text-[9px] text-rose-300">{isRussian ? `Допустимо от 1 до ${YOUTUBE_CAMPAIGN_MAX_TASKS.toLocaleString('ru-RU')} просмотров.` : `Enter between 1 and ${YOUTUBE_CAMPAIGN_MAX_TASKS.toLocaleString('en-US')} views.`}</p>}
          </div>
        </div>

        </div>

        <aside aria-label={isRussian ? 'Расчёт бюджета кампании' : 'Campaign budget breakdown'} className="relative flex flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#10182f] p-4 sm:p-5">
          <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-rose-300/[0.045] blur-2xl" />
          <div className="relative flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-rose-100"><Megaphone size={17} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">{isRussian ? 'Расчёт бюджета' : 'Budget breakdown'}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">{isRussian ? 'Комиссия 40% начисляется сверх награды.' : 'The 40% commission is added on top of the reward.'}</p>
            </div>
            <p className="ml-auto text-right text-[9px] text-slate-500">{isRussian ? `USD ≈ ${estimatedUsd ?? 'недоступна'}` : `USD ≈ ${estimatedUsd ?? 'unavailable'}`}</p>
          </div>
          <dl className="relative mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[10px] text-slate-300">{isRussian ? 'Награда исполнителю' : 'Viewer reward'}</dt>
              <dd className="font-mono text-xs font-bold text-white">{perViewReward} PEPE</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[10px] text-slate-300">{isRussian ? 'Комиссия платформы' : 'Platform fee'}</dt>
              <dd className="font-mono text-xs font-bold text-rose-200">−40%</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
              <dt className="text-[10px] font-extrabold text-white">{isRussian ? 'Стоимость просмотра' : 'Cost per view'}</dt>
              <dd className="font-mono text-sm font-black text-white">{perViewTotal} PEPE</dd>
            </div>
          </dl>
          <div className="relative mt-5 flex items-end justify-between gap-3 rounded-2xl border border-rose-200/15 bg-rose-300/[0.045] p-4">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRussian ? 'Итого за просмотры' : 'Campaign total'}</p>
              <p className="mt-1 text-[10px] text-slate-400">{isRussian ? `${taskCount || '0'} просмотров` : `${taskCount || '0'} views`}</p>
            </div>
            <p className="shrink-0 text-right font-mono text-lg font-black tracking-tight text-white">{validTaskCount ? totalCost : '—'} PEPE</p>
          </div>
          {ready && validTaskCount && !hasEnoughFunds && <p className="relative mt-3 text-[10px] font-semibold text-rose-300">{isRussian ? 'Недостаточно PEPE в рекламном кошельке. Сначала переведите средства со счёта Исполнителя.' : 'Not enough PEPE in your Advertiser wallet. Transfer funds from your Earner balance first.'}</p>}
          <p className="relative mt-3 text-[9px] leading-4 text-slate-500">{isRussian ? 'При длительности 60 секунд награда и комиссия удваиваются. Неиспользованный бюджет возвращается при отмене.' : 'A 60-second view pays double the reward and adds the same 40% commission. Unused budget is refunded on cancellation.'}</p>
        </aside>

        <button type="submit" disabled={!ready || submitting || !validTaskCount || !hasEnoughFunds || title.trim().length < 3 || !targetUrl.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-[#bd435e] to-[#96364f] px-4 text-xs font-extrabold text-white shadow-lg shadow-rose-950/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2">
          {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Megaphone size={16} aria-hidden="true" />}
          {submitting ? isRussian ? 'Запускаем…' : 'Launching…' : isRussian ? 'Запустить YouTube-кампанию' : 'Launch YouTube campaign'}
        </button>
      </form>
    </section>
  )
}
