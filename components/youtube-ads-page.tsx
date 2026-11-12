'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { BadgeCheck, CircleAlert, Clock3, LoaderCircle, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { AdsLabCaptchaModal } from '@/components/adslab-captcha-modal'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type YoutubeTask = {
  campaignId: string
  title: string
  description: string
  videoId: string
  rewardAtomic: string
  durationSeconds: number
  remainingTasks: number
  viewId: string | null
  timerRemainingSeconds: number
}

type YoutubeTaskResponse = { tasks: YoutubeTask[] }
type ApiResult = { error?: string; code?: string; status?: string }
type CaptchaChallenge = { solveUrl: string; challengeToken: string | null; captchaSessionId: string }

async function getTasks(url: string): Promise<YoutubeTaskResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as YoutubeTaskResponse | ApiResult | null
  if (!response.ok) throw new Error((result as ApiResult | null)?.error ?? 'Could not load YouTube tasks.')
  return result as YoutubeTaskResponse
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null) as T & ApiResult | null
  if (!response.ok) throw new Error(result?.error ?? 'The request could not be completed.')
  return result as T
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function YoutubeAdsPage() {
  const router = useRouter()
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/youtube-ads/tasks', getTasks, { refreshInterval: 30_000, revalidateOnFocus: true })
  const [selectedTask, setSelectedTask] = useState<YoutubeTask | null>(null)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [startingCampaignId, setStartingCampaignId] = useState<string | null>(null)
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null)
  const [captchaModalOpen, setCaptchaModalOpen] = useState(false)
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [captchaChecking, setCaptchaChecking] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const remainingSeconds = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (selectedTask && !dialog.open) dialog.showModal()
    if (!selectedTask && dialog.open) dialog.close()
  }, [selectedTask])

  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])

  async function startTask(task: YoutubeTask) {
    setErrorMessage(null)
    setMessage(null)
    setStartingCampaignId(task.campaignId)
    try {
      const result = await postJson<{ viewId: string; timerRemainingSeconds: number }>('/api/youtube-ads/start', { campaignId: task.campaignId })
      setSelectedTask({ ...task, viewId: result.viewId })
      setActiveViewId(result.viewId)
      setDeadline(Date.now() + result.timerRemainingSeconds * 1000)
      setCaptchaChallenge(null)
      setCaptchaModalOpen(false)
      setCaptchaVerified(false)
      void mutate()
    } catch (startError) {
      setErrorMessage(startError instanceof Error ? startError.message : 'Could not start this video.')
      void mutate()
    } finally {
      setStartingCampaignId(null)
    }
  }

  async function startCaptcha() {
    setErrorMessage(null)
    setMessage(null)
    setCaptchaVerified(false)
    try {
      const challenge = await postJson<CaptchaChallenge>('/api/wheel/captcha/init', {})
      setCaptchaChallenge(challenge)
      setCaptchaModalOpen(true)
    } catch (captchaError) {
      setErrorMessage(captchaError instanceof Error ? captchaError.message : 'Could not start CAPTCHA verification.')
    }
  }

  async function checkCaptcha(captchaSessionId: string) {
    setCaptchaChecking(true)
    setErrorMessage(null)
    try {
      const response = await fetch(`/api/wheel/captcha/status?state=${encodeURIComponent(captchaSessionId)}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null) as ApiResult | null
      if (!response.ok) throw new Error(result?.error ?? 'Could not verify the CAPTCHA.')
      if (result?.status === 'verified') {
        setCaptchaVerified(true)
        setCaptchaModalOpen(false)
        setMessage(isRussian ? 'CAPTCHA подтверждена. Теперь заберите награду.' : 'CAPTCHA verified. You can now claim the reward.')
      } else {
        setCaptchaVerified(false)
        setMessage(isRussian ? 'Результат ещё проверяется. Проверьте статус ещё раз.' : 'Verification is still pending. Check the status again shortly.')
      }
    } catch (captchaError) {
      setErrorMessage(captchaError instanceof Error ? captchaError.message : 'Could not verify the CAPTCHA.')
    } finally {
      setCaptchaChecking(false)
    }
  }

  async function claimReward() {
    if (!activeViewId || !captchaChallenge || !captchaVerified || remainingSeconds > 0 || claiming) return
    setClaiming(true)
    setErrorMessage(null)
    try {
      const result = await postJson<{ credited: boolean; rewardAtomic: string }>('/api/youtube-ads/claim', {
        viewId: activeViewId,
        captchaSessionId: captchaChallenge.captchaSessionId,
      })
      setMessage(isRussian
        ? `Начислено ${formatTokenAtomic(result.rewardAtomic)} PEPE. Эту кампанию нельзя пройти повторно, но другие YouTube-кампании доступны отдельно.`
        : `${formatTokenAtomic(result.rewardAtomic)} PEPE credited. This campaign cannot be repeated, but other YouTube campaigns remain available.`)
      setSelectedTask(null)
      setActiveViewId(null)
      setDeadline(null)
      setCaptchaChallenge(null)
      setCaptchaModalOpen(false)
      setCaptchaVerified(false)
      void mutate()
      router.refresh()
    } catch (claimError) {
      setErrorMessage(claimError instanceof Error ? claimError.message : 'Could not claim the reward.')
    } finally {
      setClaiming(false)
    }
  }

  function closeViewer() {
    setSelectedTask(null)
    setCaptchaChallenge(null)
    setCaptchaModalOpen(false)
    setCaptchaVerified(false)
  }

  const tasks = data?.tasks ?? []

  return (
    <LocalizedTree>
      <section aria-labelledby="youtube-ads-title" className="flex flex-col gap-5 sm:gap-6">
        <header className="relative isolate overflow-hidden rounded-[32px] border-2 border-white/20 bg-gradient-to-br from-[#401c36] via-[#24234b] to-[#17244a] p-5 text-white shadow-xl shadow-indigo-950/25 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full bg-red-400/10 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[22px] border-2 border-white/20 bg-red-400/15 text-red-100 shadow-lg"><Play size={25} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-100/75">{isRussian ? 'видеозадания рекламодателей' : 'sponsored video tasks'}</p>
              <h2 id="youtube-ads-title" className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{isRussian ? 'Смотри и зарабатывай' : 'Watch and Earn'}</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-white/75">{isRussian ? 'Смотрите YouTube-видео в плеере сайта, дождитесь таймера и пройдите AdsLab CAPTCHA. Каждую кампанию можно выполнить один раз.' : 'Watch a YouTube video in the embedded player, let the timer finish, and pass the AdsLab CAPTCHA. Each campaign can be completed once.'}</p>
            </div>
          </div>
        </header>

        {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs font-semibold text-rose-200"><CircleAlert size={15} className="mt-0.5 shrink-0" />{errorMessage}</div>}
        {message && <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs font-semibold text-emerald-200"><BadgeCheck size={15} className="mt-0.5 shrink-0" />{message}</div>}

        <section aria-label={isRussian ? 'Доступные YouTube-видео' : 'Available YouTube videos'} className="rounded-[30px] border-2 border-dashboard-outline bg-[#171f40] p-4 shadow-xl shadow-indigo-950/25 sm:p-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-white">{isRussian ? 'Доступные видео' : 'Available videos'}</h2>
              <p className="mt-1 text-[10px] text-slate-400">{isRussian ? 'Награда начисляется в PEPE после серверной проверки времени и CAPTCHA.' : 'PEPE is credited after the server verifies the watch time and CAPTCHA.'}</p>
            </div>
            <button type="button" onClick={() => void mutate()} disabled={isLoading || isValidating} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[10px] font-bold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50"><RefreshCw size={12} className={isLoading || isValidating ? 'animate-spin' : ''} />{isRussian ? 'Обновить' : 'Refresh'}</button>
          </header>

          {error && !data ? <div role="alert" className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-rose-300/15 bg-rose-400/[0.04] px-4 text-center">
            <CircleAlert size={18} className="text-rose-200" /><p className="mt-2 text-xs font-bold text-white">{isRussian ? 'Не удалось загрузить видео' : 'Could not load videos'}</p><p className="mt-1 text-[10px] text-slate-400">{error.message}</p>
          </div> : isLoading ? <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-xs text-slate-400"><LoaderCircle size={16} className="animate-spin" />{isRussian ? 'Загружаем видео…' : 'Loading videos…'}</div>
            : tasks.length > 0 ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => <li key={task.campaignId} className="mx-auto w-full max-w-[420px]">
                <article className="flex h-full flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#111a35] shadow-lg shadow-black/10">
                  <img src={`https://i.ytimg.com/vi/${task.videoId}/hqdefault.jpg`} alt={isRussian ? `Обложка видео: ${task.title}` : `Video thumbnail: ${task.title}`} className="aspect-video w-full bg-black object-cover" loading="lazy" />
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-sm font-extrabold text-white">{task.title}</h3>
                    {task.description && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{task.description}</p>}
                    <dl className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5"><dt className="text-[9px] text-slate-400">{isRussian ? 'Награда' : 'Reward'}</dt><dd className="mt-1 font-mono text-xs font-extrabold text-emerald-200">{formatTokenAtomic(task.rewardAtomic)} PEPE</dd></div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5"><dt className="text-[9px] text-slate-400">{isRussian ? 'Время' : 'Watch time'}</dt><dd className="mt-1 flex items-center gap-1 font-mono text-xs font-extrabold text-white"><Clock3 size={12} />{task.durationSeconds} {isRussian ? 'сек' : 'sec'}</dd></div>
                    </dl>
                    <button type="button" disabled={startingCampaignId !== null} onClick={() => void startTask(task)} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-3 text-[10px] font-extrabold text-white transition hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50">
                      {startingCampaignId === task.campaignId ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={13} />}
                      {task.viewId ? isRussian ? 'Продолжить просмотр' : 'Resume video' : isRussian ? 'Смотреть видео' : 'Watch video'}
                    </button>
                  </div>
                </article>
              </li>)}
            </ul> : <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-400"><ShieldCheck size={19} /></span>
              <p className="mt-3 text-xs font-extrabold text-white">{isRussian ? 'Новых видео пока нет' : 'No new videos right now'}</p>
              <p className="mt-1 max-w-sm text-[10px] leading-5 text-slate-400">{isRussian ? 'Вы уже выполнили доступные кампании или рекламодатели ещё не добавили видео.' : 'You have completed the available campaigns, or advertisers have not added videos yet.'}</p>
            </div>}
        </section>

        <dialog ref={dialogRef} onClose={closeViewer} aria-labelledby="youtube-view-title" className="w-[min(94vw,760px)] max-h-[92dvh] overflow-y-auto rounded-[26px] border border-white/10 bg-[#0b1124] p-0 text-white shadow-2xl backdrop:bg-slate-950/80">
          {selectedTask && <div className="p-4 sm:p-5">
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-red-200">{isRussian ? 'YouTube-задание' : 'YouTube task'}</p><h2 id="youtube-view-title" className="mt-1 text-lg font-black">{selectedTask.title}</h2></div>
              <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-9 shrink-0 rounded-xl border border-white/10 px-3 text-[10px] font-bold text-slate-300 hover:bg-white/5">{isRussian ? 'Закрыть' : 'Close'}</button>
            </header>
            <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${selectedTask.videoId}?rel=0&playsinline=1`}
                title={isRussian ? `Видео YouTube: ${selectedTask.title}` : `YouTube video: ${selectedTask.title}`}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div><p className="text-[9px] font-bold text-slate-400">{isRussian ? 'Награда после проверки' : 'Reward after verification'}</p><p className="mt-1 font-mono text-sm font-black text-emerald-200">{formatTokenAtomic(selectedTask.rewardAtomic)} PEPE</p></div>
              <p role="timer" aria-live="off" className="flex items-center gap-2 font-mono text-lg font-black text-white"><Clock3 size={17} className="text-cyan-200" />{formatTimer(remainingSeconds)}</p>
            </div>
            {remainingSeconds > 0 ? <p className="mt-3 text-center text-[10px] leading-5 text-slate-400">{isRussian ? 'Кнопка получения награды станет доступна, когда серверный таймер завершится.' : 'The reward button unlocks when the server-verified timer has finished.'}</p> : <div className="mt-4 flex flex-col gap-2">
              {!captchaChallenge ? <button type="button" onClick={() => void startCaptcha()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-xs font-black text-[#07120d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"><ShieldCheck size={15} />{isRussian ? 'Получить награду · пройти CAPTCHA' : 'Get reward · verify with CAPTCHA'}</button>
                : !captchaVerified ? <button type="button" disabled={captchaChecking} onClick={() => void checkCaptcha(captchaChallenge.captchaSessionId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-4 text-xs font-extrabold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50">{captchaChecking ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{captchaChecking ? isRussian ? 'Проверяем…' : 'Checking…' : isRussian ? 'Проверить CAPTCHA' : 'Check CAPTCHA'}</button>
                  : <button type="button" disabled={claiming} onClick={() => void claimReward()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 text-xs font-black text-[#07120d] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{claiming ? <LoaderCircle size={15} className="animate-spin" /> : <BadgeCheck size={15} />}{claiming ? isRussian ? 'Начисляем…' : 'Claiming…' : isRussian ? 'Забрать награду' : 'Claim reward'}</button>}
            </div>}
          </div>}
        </dialog>

        <AdsLabCaptchaModal
          solveUrl={captchaModalOpen ? captchaChallenge?.solveUrl ?? null : null}
          challengeToken={captchaChallenge?.challengeToken ?? null}
          captchaSessionId={captchaChallenge?.captchaSessionId ?? null}
          onReturned={(captchaSessionId) => void checkCaptcha(captchaSessionId)}
          onClose={() => {
            setCaptchaModalOpen(false)
            if (!captchaVerified) setCaptchaChallenge(null)
          }}
          purpose="youtube"
        />
      </section>
    </LocalizedTree>
  )
}
