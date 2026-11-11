'use client'

import type { FormEvent } from 'react'
import { CircleAlert, LoaderCircle, Megaphone, Play } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'

export function YoutubeCampaignForm({
  title,
  targetUrl,
  description,
  taskCount,
  durationSeconds,
  perViewReward,
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
    <section aria-labelledby="youtube-campaign-create-title" className="rounded-[26px] border border-red-200/15 bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-200"><Play size={18} /></span>
        <div>
          <h2 id="youtube-campaign-create-title" className="text-sm font-extrabold text-white">{isRussian ? 'Создать YouTube-кампанию' : 'Create a YouTube campaign'}</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">{isRussian ? 'Укажите ссылку на видео и число оплачиваемых просмотров. Каждый пользователь может выполнить только одну видеокампанию одного рекламодателя.' : 'Add a video link and the number of paid views. Each user can complete only one video campaign per advertiser.'}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-title" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Название кампании' : 'Campaign name'}</label>
            <input id="youtube-campaign-title" required minLength={3} maxLength={80} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={isRussian ? 'Название видео' : 'Video title'} disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-url" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Ссылка YouTube или embed URL' : 'YouTube link or embed URL'}</label>
            <input id="youtube-campaign-url" type="url" required maxLength={2048} value={targetUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://youtu.be/…" disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="youtube-campaign-description" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Описание' : 'Description'} <span className="font-normal text-slate-500">({isRussian ? 'необязательно' : 'optional'})</span></label>
          <textarea id="youtube-campaign-description" rows={2} maxLength={500} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder={isRussian ? 'Кратко опишите видео' : 'Briefly describe the video'} disabled={submitting || !ready} className="min-h-16 resize-y rounded-xl border border-white/10 bg-[#111a35] px-3 py-2.5 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[10px] font-bold text-slate-200">{isRussian ? 'Обязательное время просмотра' : 'Required watch time'}</legend>
            <div className="grid grid-cols-2 gap-2">
              {([30, 60] as const).map((duration) => (
                <button key={duration} type="button" aria-pressed={durationSeconds === duration} onClick={() => onDurationChange(duration)} disabled={submitting || !ready} className={`min-h-10 rounded-xl border px-3 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:opacity-50 ${durationSeconds === duration ? 'border-red-200/40 bg-red-300/15 text-red-100' : 'border-white/10 bg-[#111a35] text-slate-300 hover:bg-white/[0.05]'}`}>
                  {duration} {isRussian ? 'секунд' : 'seconds'}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="youtube-campaign-count" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Количество просмотров' : 'Number of views'}</label>
            <input id="youtube-campaign-count" type="number" inputMode="numeric" required min={1} max={100_000} step={1} value={taskCount} onChange={(event) => onTaskCountChange(event.target.value)} disabled={submitting || !ready} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 font-mono text-xs text-white outline-none transition focus:border-red-300/50 focus:ring-2 focus:ring-red-300/10 disabled:opacity-50" />
            {!validTaskCount && <p className="text-[9px] text-rose-300">{isRussian ? 'Допустимо от 1 до 100 000 просмотров.' : 'Enter between 1 and 100,000 views.'}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111a35] p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{isRussian ? 'Бюджет кампании' : 'Campaign budget'}</p>
              <p className="mt-1 text-[10px] text-slate-400">{isRussian ? `Награда ${perViewReward} PEPE + комиссия платформы 25 PEPE за просмотр` : `${perViewReward} PEPE reward + 25 PEPE platform commission per view`}</p>
              <p className="mt-1 text-[9px] text-slate-500">{isRussian ? `Котировка PEPE/USD: ${estimatedUsd ?? 'недоступна'}` : `PEPE/USD estimate: ${estimatedUsd ?? 'unavailable'}`}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-black text-white">{validTaskCount ? totalCost : '—'} PEPE</p>
              <p className="text-[9px] text-slate-400">{isRussian ? 'итого к оплате' : 'total charged'}</p>
            </div>
          </div>
          {ready && validTaskCount && !hasEnoughFunds && <p className="mt-2 text-[10px] font-semibold text-rose-300">{isRussian ? 'Недостаточно PEPE в рекламном кошельке. Сначала переведите средства из Publisher.' : 'Not enough PEPE in your Advertiser wallet. Transfer funds from Publisher first.'}</p>}
          <p className="mt-2 text-[9px] leading-4 text-slate-500">{isRussian ? 'После завершения или отмены неиспользованный бюджет возвращается. Один пользователь может получить награду по этой кампании только один раз.' : 'Unused budget is refunded on cancellation. Each user can earn from this campaign only once.'}</p>
        </div>

        <button type="submit" disabled={!ready || submitting || !validTaskCount || !hasEnoughFunds || title.trim().length < 3 || !targetUrl.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 text-xs font-extrabold text-white shadow-lg shadow-red-950/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <Megaphone size={15} />}
          {submitting ? isRussian ? 'Запускаем…' : 'Launching…' : <><Play size={14} />{isRussian ? 'Запустить YouTube-кампанию' : 'Launch YouTube campaign'}</>}
        </button>
      </form>
    </section>
  )
}
