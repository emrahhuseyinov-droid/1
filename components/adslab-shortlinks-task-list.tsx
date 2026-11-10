'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Clock3, Coins, ExternalLink, Link2 } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'
import { getAdsLabTaskCardPalette } from '@/lib/adslab-task-card-theme'

type ShortlinkTask = {
  key: string
  url: string
  title: string
  description: string
  iconUrl: string | null
  rewardAtomic: string
  tokenSymbol: 'HOMERO'
  cooldownMinutes: number
  visitsRemaining: number
  cooldownRemainingSeconds: number
  awaitingConfirmation: boolean
}

type ShortlinksResponse = { tasks: ShortlinkTask[]; pepeUsdPrice: string; awaitingConfirmation: boolean }

async function fetchShortlinks(url: string): Promise<ShortlinksResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as { error?: string; code?: string; providerStatus?: number } | null
  if (!response.ok) {
    const diagnostic = [
      result?.code,
      result?.providerStatus ? `HTTP ${result.providerStatus}` : null,
    ].filter(Boolean).join(' · ')
    throw new Error(diagnostic || result?.error || 'Could not load Shortlinks.')
  }
  return result as ShortlinksResponse
}

function formatCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function isAdsLabTrackingUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'adslab.me' || url.hostname.endsWith('.adslab.me')) && !url.username && !url.password
  } catch {
    return false
  }
}

export function AdsLabShortlinksTaskList() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const { data, error, isLoading, mutate } = useSWR('/api/adslab/shortlinks/tasks', fetchShortlinks, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function openShortlink(task: ShortlinkTask) {
    if (openingKey || data?.awaitingConfirmation) return
    const taskWindow = window.open('about:blank', '_blank')
    if (!taskWindow || taskWindow.closed) {
      setErrorMessage(isRussian ? 'Разрешите всплывающие окна, чтобы открыть ссылку.' : 'Allow pop-ups to open the shortlink.')
      return
    }

    taskWindow.opener = null
    setOpeningKey(task.key)
    setErrorMessage(null)
    setMessage(null)

    try {
      const response = await fetch('/api/adslab/shortlinks/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey: task.key }),
      })
      const result = await response.json().catch(() => null) as { directLink?: string; error?: string } | null
      if (!response.ok || !result?.directLink || !isAdsLabTrackingUrl(result.directLink)) {
        throw new Error(result?.error ?? (isRussian ? 'Не удалось открыть ссылку.' : 'Could not open this shortlink.'))
      }

      taskWindow.location.replace(result.directLink)
      setMessage(isRussian
        ? 'Ссылка открыта. Награда будет начислена автоматически после подтверждения AdsLab.'
        : 'Shortlink opened. The reward is credited automatically after AdsLab confirms completion.')
      await mutate()
    } catch (error) {
      if (!taskWindow.closed) taskWindow.close()
      setErrorMessage(error instanceof Error ? error.message : (isRussian ? 'Не удалось открыть ссылку.' : 'Could not open this shortlink.'))
      void mutate()
    } finally {
      setOpeningKey(null)
    }
  }

  if (isLoading && !data) {
    return <li role="status" className="col-span-full rounded-2xl border border-slate-200/70 px-4 py-8 text-center text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400">{isRussian ? 'Загружаем Shortlinks…' : 'Loading Shortlinks…'}</li>
  }

  if (error && !data) {
    return <li className="col-span-full"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/15 bg-rose-500/[0.06] px-4 py-3"><div><p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{isRussian ? 'Не удалось загрузить Shortlinks. Попробуйте позже.' : 'Could not load Shortlinks. Please try again later.'}</p>{error instanceof Error && error.message && <p className="mt-1 text-[10px] text-rose-500/80 dark:text-rose-300/75">{error.message}</p>}</div><button type="button" onClick={() => void mutate()} className="min-h-9 rounded-lg border border-rose-500/20 px-3 text-[10px] font-bold text-rose-700 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-200">{isRussian ? 'Повторить' : 'Retry'}</button></div></li>
  }

  const tasks = data?.tasks ?? []

  return (
    <>
      {message && <li className="col-span-full"><p role="status" aria-live="polite" className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</p></li>}
      {data?.awaitingConfirmation && !message && <li className="col-span-full"><p role="status" aria-live="polite" className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{isRussian ? 'AdsLab подтверждает предыдущий Short-Link. Дождитесь подтверждения перед запуском следующего.' : 'AdsLab is still confirming a shortlink. Please wait before starting another.'}</p></li>}
      {errorMessage && !data?.awaitingConfirmation && <li className="col-span-full"><p role="alert" className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-700 dark:text-amber-300">{errorMessage}</p></li>}

      {tasks.length === 0 ? (
        <li role="status" className="col-span-full rounded-2xl border border-slate-200/70 px-4 py-10 text-center dark:border-white/[0.06]">
          <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.06] text-cyan-600 dark:text-cyan-300"><Link2 size={24} /></span>
          <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{isRussian ? 'Сейчас нет доступных Shortlinks' : 'No Shortlinks available right now'}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">{isRussian ? 'Проверьте позже — список AdsLab обновляется автоматически.' : 'Check back later. AdsLab tasks refresh automatically.'}</p>
        </li>
      ) : tasks.map((task) => {
        const onCooldown = task.cooldownRemainingSeconds > 0
        const disabled = Boolean(openingKey || onCooldown || task.awaitingConfirmation || data?.awaitingConfirmation)
        const palette = getAdsLabTaskCardPalette(task.key)
        const metadataBaseClass = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold shadow-sm'
        const rewardClass = `${metadataBaseClass} ${palette.reward}`
        const cooldownClass = `${metadataBaseClass} ${palette.duration}`

        return (
          <li key={task.key} className={`group relative isolate flex min-h-[260px] flex-col overflow-hidden rounded-[28px] border-2 p-5 transition duration-300 motion-reduce:transition-none hover:-translate-y-1 ${palette.card}`}>
            <div aria-hidden="true" className={`pointer-events-none absolute -right-8 -top-10 z-0 size-32 rounded-full blur-2xl transition duration-500 group-hover:scale-125 motion-reduce:transition-none ${palette.glow}`} />
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-7 top-0 z-0 h-1 rounded-b-full bg-gradient-to-r ${palette.stripe}`} />
            <div className="relative z-10 flex items-start gap-3">
              {task.iconUrl ? (
                <img src={task.iconUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" className={`size-12 shrink-0 rounded-2xl border-2 object-contain p-1.5 ${palette.icon}`} />
              ) : (
                <span aria-hidden="true" className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 ${palette.icon}`}><Link2 size={19} /></span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black leading-5 tracking-tight text-slate-900 dark:text-white">{task.title}</h3>
                {task.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{task.description}</p>}
              </div>
            </div>

            <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className={rewardClass}><Coins size={12} />+{formatTokenAtomic(task.rewardAtomic)} {task.tokenSymbol}</span>
              {task.cooldownMinutes > 0 && <span className={cooldownClass}><Clock3 size={12} />{isRussian ? `Пауза ${task.cooldownMinutes} мин.` : `${task.cooldownMinutes} min cooldown`}</span>}
            </div>

            <div className="relative z-10 mt-auto pt-4">
              <div className="mb-3 h-px bg-gradient-to-r from-white/70 via-slate-300/70 to-transparent dark:from-white/20 dark:via-white/10 dark:to-transparent" />
              {task.awaitingConfirmation ? (
                <span role="status" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-center text-[10px] font-bold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/[0.06] dark:text-amber-200"><Clock3 size={13} />{isRussian ? 'Ожидаем подтверждение AdsLab' : 'Waiting for AdsLab confirmation'}</span>
              ) : onCooldown ? (
                <span role="status" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"><Clock3 size={13} />{isRussian ? `Доступно через ${formatCountdown(task.cooldownRemainingSeconds)}` : `Available in ${formatCountdown(task.cooldownRemainingSeconds)}`}</span>
              ) : openingKey === task.key ? (
                <span role="status" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">{isRussian ? 'Открываем shortlink…' : 'Opening Shortlink…'}</span>
              ) : (
                <button type="button" onClick={() => void openShortlink(task)} disabled={disabled} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-gradient-to-r px-4 py-3 text-[11px] font-black text-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:saturate-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${palette.button}`}>{isRussian ? 'Открыть Shortlink' : 'Open Shortlink'}<ExternalLink size={13} /><ArrowUpRight size={13} /></button>
              )}
            </div>
          </li>
        )
      })}
    </>
  )
}
