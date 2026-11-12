'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowUpRight, BadgeCheck, BatteryCharging, Clock3, Coins, Eye, Globe2, Timer } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import { ARCADE_PTC_ENERGY_REWARD } from '@/lib/arcade-gameplay'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type AdsLabTask = {
  key: string
  url: string
  title: string
  description: string
  iconUrl: string | null
  rewardAtomic: string
  tokenSymbol: 'PEPE' | 'HOMERO'
  pepeUsdPrice: string
  durationSeconds: number
  visitsRemaining: number
  cooldownRemainingSeconds: number
  isInProgress: boolean
  awaitingConfirmation: boolean
  pendingClickId: string | null
  activeRemainingSeconds: number | null
}

type TokenEarnings = { PEPE: string; HOMERO: string }
type PtcTaskStats = { todayClicks: number; todayEarnings: TokenEarnings; totalEarnings: TokenEarnings }
export type PtcTaskSummary = PtcTaskStats & { availableAds: number }
type TaskListResponse = { tasks: AdsLabTask[]; pepeUsdPrice: string; stats: PtcTaskStats }
type TaskFetchError = Error & { status?: number }
type DeferredClaim = { clickId: string; taskKey: string; taskTitle: string; tokenSymbol: AdsLabTask['tokenSymbol'] }

const advertiserTaskKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getClaimEndpoint(taskKey: string) {
  return advertiserTaskKeyPattern.test(taskKey) ? '/api/view-ads/claim' : '/api/adslab/ptc/claim'
}
type TaskSort = 'reward' | 'duration'

type StartResponse = {
  clickId?: string
  directLink?: string
  timerSeconds?: number
  error?: string
  code?: string
  remainingSeconds?: number
  rewardAtomic?: string
  tokenSymbol?: 'PEPE' | 'HOMERO'
  pepeUsdPrice?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAdsLabTask(value: unknown): value is AdsLabTask {
  if (!isRecord(value)) return false

  return typeof value.key === 'string'
    && typeof value.url === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && (typeof value.iconUrl === 'string' || value.iconUrl === null)
    && typeof value.rewardAtomic === 'string'
    && /^\d+$/.test(value.rewardAtomic)
    && (value.tokenSymbol === 'PEPE' || value.tokenSymbol === 'HOMERO')
    && typeof value.pepeUsdPrice === 'string'
    && typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds)
    && typeof value.visitsRemaining === 'number' && Number.isFinite(value.visitsRemaining)
    && typeof value.cooldownRemainingSeconds === 'number' && Number.isFinite(value.cooldownRemainingSeconds)
    && typeof value.isInProgress === 'boolean'
    && typeof value.awaitingConfirmation === 'boolean'
    && (value.pendingClickId === null || (typeof value.pendingClickId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.pendingClickId)))
    && (value.activeRemainingSeconds === null || (typeof value.activeRemainingSeconds === 'number' && Number.isFinite(value.activeRemainingSeconds)))
}

function getHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null
  return typeof error.status === 'number' ? error.status : null
}

function parseTokenEarnings(value: unknown): TokenEarnings {
  const record = isRecord(value) ? value : {}
  const parseAmount = (amount: unknown) => typeof amount === 'string' && /^-?\d+$/.test(amount) ? amount : '0'
  return { PEPE: parseAmount(record.PEPE), HOMERO: parseAmount(record.HOMERO) }
}

async function fetchTasks(_url: string): Promise<TaskListResponse> {
  const response = await fetch('/api/adslab/ptc/tasks', { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  const data = isRecord(payload) ? payload : null

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Could not load partner tasks.'
    throw Object.assign(new Error(message), { status: response.status }) as TaskFetchError
  }

  const tasksList = Array.isArray(data?.tasks) ? data.tasks.filter(isAdsLabTask) : []
  const pepeUsdPrice = typeof data?.pepeUsdPrice === 'string' ? data.pepeUsdPrice : ''
  const rawStats = isRecord(data?.stats) ? data.stats : {}
  const stats: PtcTaskStats = {
    todayClicks: typeof rawStats.todayClicks === 'number' && Number.isSafeInteger(rawStats.todayClicks) && rawStats.todayClicks >= 0 ? rawStats.todayClicks : 0,
    todayEarnings: parseTokenEarnings(rawStats.todayEarnings),
    totalEarnings: parseTokenEarnings(rawStats.totalEarnings),
  }

  return { tasks: tasksList, pepeUsdPrice, stats }
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function AdsLabPtcTaskList({
  onTaskBusyChange,
  onSummaryChange,
  searchQuery = '',
  availableOnly = false,
  sortBy = 'reward',
}: {
  onTaskBusyChange?: (busy: boolean) => void
  onSummaryChange?: (summary: PtcTaskSummary) => void
  searchQuery?: string
  availableOnly?: boolean
  sortBy?: TaskSort
}) {
  const router = useRouter()
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const { data, error, isLoading, mutate } = useSWR('/api/adslab/ptc/tasks', fetchTasks, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const [activeTask, setActiveTask] = useState<AdsLabTask | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [isDocumentVisible, setIsDocumentVisible] = useState(true)
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [awaitingPostback, setAwaitingPostback] = useState(false)
  const [deferredClaims, setDeferredClaims] = useState<DeferredClaim[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const targetWindowRef = useRef<Window | null>(null)
  const originalPageTitleRef = useRef<string | null>(null)
  const claimingRef = useRef(false)
  const claimAttemptedRef = useRef(false)
  const deferredPollingRef = useRef(false)
  const postbackWaitStartedAtRef = useRef<number | null>(null)
  const pausedAtRef = useRef<number | null>(null)
  const nowRef = useRef(now)
  nowRef.current = now
  const activeIsAdvertiserCampaign = Boolean(activeTask && advertiserTaskKeyPattern.test(activeTask.key))
  const secondsRemaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))

  useEffect(() => {
    onTaskBusyChange?.(Boolean(activeTask || startingKey))
  }, [activeTask, onTaskBusyChange, startingKey])

  useEffect(() => {
    if (!data) return
    onSummaryChange?.({ availableAds: data.tasks.length, ...data.stats })
  }, [data, onSummaryChange])

  useEffect(() => {
    const pendingTasks = data?.tasks.filter((task) => task.awaitingConfirmation
      && task.pendingClickId
      && task.pendingClickId !== clickId) ?? []
    if (pendingTasks.length === 0) return

    setDeferredClaims((current) => {
      const knownClickIds = new Set(current.map((claim) => claim.clickId))
      const recoveredClaims = pendingTasks
        .filter((task) => task.pendingClickId && !knownClickIds.has(task.pendingClickId))
        .map((task) => ({ clickId: task.pendingClickId as string, taskKey: task.key, taskTitle: task.title, tokenSymbol: task.tokenSymbol }))
      return recoveredClaims.length > 0 ? [...current, ...recoveredClaims] : current
    })
  }, [clickId, data])

  useEffect(() => {
    const updateVisibility = () => setIsDocumentVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (deadline === null) {
      pausedAtRef.current = null
      return
    }

    const shouldPauseCountdown = isDocumentVisible && Boolean(activeTask) && !awaitingPostback
    if (shouldPauseCountdown) {
      if (pausedAtRef.current === null) {
        pausedAtRef.current = Date.now()
        setNow(pausedAtRef.current)
      }
      return
    }

    if (pausedAtRef.current !== null) {
      const pausedDuration = Date.now() - pausedAtRef.current
      pausedAtRef.current = null
      setDeadline((current) => current === null ? null : current + pausedDuration)
    }

    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [activeIsAdvertiserCampaign, activeTask, awaitingPostback, deadline, isDocumentVisible])

  useEffect(() => {
    if (originalPageTitleRef.current === null) originalPageTitleRef.current = document.title

    if (activeIsAdvertiserCampaign && activeTask && deadline !== null) {
      document.title = `${formatCountdown(secondsRemaining)} | ${activeTask.title} | ${originalPageTitleRef.current}`
    } else {
      document.title = originalPageTitleRef.current
    }
  }, [activeIsAdvertiserCampaign, activeTask, deadline, secondsRemaining])

  useEffect(() => () => {
    if (originalPageTitleRef.current !== null) document.title = originalPageTitleRef.current
  }, [])

  useEffect(() => {
    if (!clickId || deadline === null) return
    const activeClickId = clickId
    const timer = window.setInterval(() => {
      const taskWindow = targetWindowRef.current
      if (!taskWindow?.closed || awaitingPostback || nowRef.current >= deadline) return

      void fetch('/api/adslab/ptc/start', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickId: activeClickId }),
        keepalive: true,
      }).catch(() => undefined)

      targetWindowRef.current = null
      setActiveTask(null)
      setClickId(null)
      setDeadline(null)
      claimAttemptedRef.current = false
      setAwaitingPostback(false)
      setErrorMessage(isRussian ? 'Задание было закрыто до окончания таймера. Начните его заново.' : 'The task window closed before the timer finished. Start again.')
    }, 750)
    return () => window.clearInterval(timer)
  }, [awaitingPostback, clickId, deadline, isRussian])

  const deferCurrentClaim = useCallback((task: AdsLabTask, pendingClickId: string) => {
    setDeferredClaims((current) => current.some((claim) => claim.clickId === pendingClickId)
      ? current
      : [...current, { clickId: pendingClickId, taskKey: task.key, taskTitle: task.title, tokenSymbol: task.tokenSymbol }])
    targetWindowRef.current?.close()
    targetWindowRef.current = null
    setActiveTask(null)
    setClickId(null)
    setDeadline(null)
    setAwaitingPostback(false)
    claimAttemptedRef.current = false
    postbackWaitStartedAtRef.current = null
    setMessage(isRussian
      ? `Задание ещё проверяется. Можно выполнять другие задания; ${task.tokenSymbol} будет зачислен автоматически после подтверждения.`
      : `This task is still being verified. You can continue with other tasks; ${task.tokenSymbol} will be credited automatically when confirmed.`)
  }, [isRussian])

  const claimTask = useCallback(async () => {
    if (!clickId || !activeTask || claimingRef.current || claimAttemptedRef.current) return
    claimingRef.current = true
    claimAttemptedRef.current = true
    postbackWaitStartedAtRef.current ??= Date.now()
    setClaiming(true)
    setErrorMessage(null)

    try {
      const response = await fetch(getClaimEndpoint(activeTask.key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickId }),
      })
      const result = await response.json().catch(() => null) as {
        credited?: boolean
        awaitingPostback?: boolean
        alreadyCredited?: boolean
        rewardAtomic?: string
        energyGranted?: boolean
        energy?: number
        dailyEnergyEarned?: number
        dailyEnergyCap?: number
        tokenSymbol?: 'PEPE' | 'HOMERO'
        remainingSeconds?: number
        code?: string
        error?: string
      } | null

      if (result?.code === 'too_early') {
        setAwaitingPostback(false)
        postbackWaitStartedAtRef.current = null
        claimAttemptedRef.current = false
        const retrySeconds = Math.max(1, result.remainingSeconds ?? 1)
        setDeadline(Date.now() + retrySeconds * 1000)
        setNow(Date.now())
        return
      }
      if (response.status === 202 && result?.awaitingPostback) {
        const waitStartedAt = postbackWaitStartedAtRef.current ?? Date.now()
        postbackWaitStartedAtRef.current = waitStartedAt
        targetWindowRef.current?.close()
        targetWindowRef.current = null
        if (Date.now() - waitStartedAt >= 30_000) {
          deferCurrentClaim(activeTask, clickId)
          await mutate()
          return
        }
        setAwaitingPostback(true)
        claimAttemptedRef.current = false
        setDeadline(Date.now() + 5_000)
        setNow(Date.now())
        return
      }
      if (!response.ok || !result?.credited) throw new Error(result?.error ?? (isRussian ? 'Не удалось начислить награду.' : 'Could not credit the reward.'))

      setAwaitingPostback(false)
      postbackWaitStartedAtRef.current = null
      setMessage(null)
      targetWindowRef.current?.close()
      targetWindowRef.current = null
      setActiveTask(null)
      setClickId(null)
      setDeadline(null)
      claimAttemptedRef.current = false
      setAwaitingPostback(false)
      await mutate()
      router.refresh()
    } catch (error) {
      claimAttemptedRef.current = false
      if (postbackWaitStartedAtRef.current !== null && Date.now() - postbackWaitStartedAtRef.current >= 30_000) {
        deferCurrentClaim(activeTask, clickId)
        await mutate()
      } else {
        setDeadline(Date.now() + 3_000)
        setNow(Date.now())
        setErrorMessage(error instanceof Error ? error.message : (isRussian ? 'Не удалось начислить награду.' : 'Could not credit the reward.'))
      }
    } finally {
      claimingRef.current = false
      setClaiming(false)
    }
  }, [activeTask, clickId, deferCurrentClaim, isRussian, mutate, router])

  useEffect(() => {
    if (deferredClaims.length === 0) return

    const timer = window.setInterval(() => {
      if (deferredPollingRef.current) return
      deferredPollingRef.current = true

      void (async () => {
        try {
          const results = await Promise.all(deferredClaims.map(async (claim) => {
            try {
              const response = await fetch(getClaimEndpoint(claim.taskKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clickId: claim.clickId }),
              })
              const result = await response.json().catch(() => null) as { credited?: boolean; rewardAtomic?: string; tokenSymbol?: 'PEPE' | 'HOMERO'; code?: string } | null
              if (response.ok && result?.credited) return { clickId: claim.clickId, taskTitle: claim.taskTitle, rewardAtomic: result.rewardAtomic, tokenSymbol: result.tokenSymbol ?? claim.tokenSymbol, state: 'credited' as const }
              if (response.status === 409 && result?.code === 'rejected') return { clickId: claim.clickId, taskTitle: claim.taskTitle, state: 'expired' as const }
            } catch {
              return null
            }
            return null
          }))
          const resolved = results.filter((result): result is NonNullable<typeof result> => result !== null)
          if (resolved.length === 0) return

          const resolvedIds = new Set(resolved.map((result) => result.clickId))
          setDeferredClaims((current) => current.filter((claim) => !resolvedIds.has(claim.clickId)))
          const credited = resolved.find((result) => result.state === 'credited')
          if (credited) {
            setMessage(null)
          } else {
            setMessage(isRussian ? 'Истёкшая сессия задания удалена; другие задания доступны.' : 'An expired task session was cleared; other tasks are available.')
          }
          await mutate()
          router.refresh()
        } finally {
          deferredPollingRef.current = false
        }
      })()
    }, 5_000)

    return () => window.clearInterval(timer)
  }, [deferredClaims, isRussian, mutate, router])

  useEffect(() => {
    if (!activeTask || !clickId || deadline === null || deadline > now || claiming) return
    void claimTask()
  }, [activeTask, claimTask, claiming, clickId, deadline, now])

  async function startTask(task: AdsLabTask) {
    if (activeTask || startingKey) return
    const taskWindow = window.open('about:blank', '_blank')
    if (!taskWindow || taskWindow.closed) {
      setErrorMessage(isRussian ? 'Раз��ешите всплывающие окна, чтобы открыть задание.' : 'Allow pop-ups to open the task.')
      return
    }

    taskWindow.opener = null
    targetWindowRef.current = taskWindow
    postbackWaitStartedAtRef.current = null
    setStartingKey(task.key)
    setErrorMessage(null)
    setMessage(null)

    try {
      const response = await fetch('/api/adslab/ptc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey: task.key }),
      })
      const result = await response.json().catch(() => null) as StartResponse | null

      if (result?.code === 'already_completed') {
        taskWindow.close()
        targetWindowRef.current = null
        await mutate()
        setMessage(isRussian ? 'Все посещения этого задания уже выполнены.' : 'All visits for this task are already complete.')
        return
      }
      if (result?.code === 'cooldown') {
        taskWindow.close()
        targetWindowRef.current = null
        await mutate()
        setMessage(isRussian ? 'Для этого задания ещё действует пауза.' : 'This task is still in its cooldown period.')
        return
      }
      if (
        !response.ok
        || !result?.clickId
        || !result.directLink
        || typeof result.timerSeconds !== 'number'
        || !Number.isInteger(result.timerSeconds)
        || result.timerSeconds < 0
      ) {
        throw new Error(result?.error ?? (isRussian ? 'Не удалось открыть задание.' : 'Could not start the task.'))
      }

      taskWindow.location.replace(result.directLink)
      claimAttemptedRef.current = false
      setAwaitingPostback(false)
      const startedAt = Date.now()
      const startedTask: AdsLabTask = {
        ...task,
        rewardAtomic: result.rewardAtomic ?? task.rewardAtomic,
        tokenSymbol: result.tokenSymbol ?? task.tokenSymbol,
        pepeUsdPrice: result.pepeUsdPrice ?? task.pepeUsdPrice,
      }
      setActiveTask(startedTask)
      void mutate((current) => current ? {
        ...current,
        pepeUsdPrice: startedTask.pepeUsdPrice,
        tasks: current.tasks.map((item) => item.key === startedTask.key ? startedTask : item),
      } : current).catch(() => undefined)
      setClickId(result.clickId)
      setDeadline(startedAt + result.timerSeconds * 1000)
      setNow(startedAt)
    } catch (error) {
      if (!taskWindow.closed) taskWindow.close()
      targetWindowRef.current = null
      setErrorMessage(error instanceof Error ? error.message : (isRussian ? 'Не удалось открыть задание.' : 'Could not start the task.'))
    } finally {
      setStartingKey(null)
    }
  }

  const tasks = Array.isArray(data?.tasks) ? data.tasks : []
  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return tasks
      .filter((task) => {
        const matchesSearch = !query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query)
        const isAvailable = task.cooldownRemainingSeconds === 0 && !task.awaitingConfirmation
        return matchesSearch && (!availableOnly || isAvailable)
      })
      .sort((first, second) => {
        if (sortBy === 'duration') return first.durationSeconds - second.durationSeconds
        const rewardDifference = BigInt(second.rewardAtomic) - BigInt(first.rewardAtomic)
        return rewardDifference > 0n ? 1 : rewardDifference < 0n ? -1 : 0
      })
  }, [availableOnly, searchQuery, sortBy, tasks])
  const loadingLabel = isRussian ? 'Загружаем задания…' : 'Loading tasks…'

  if (isLoading && !data) {
    return <li role="status" className="col-span-full rounded-2xl border border-slate-200/70 px-4 py-8 text-center text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400">{loadingLabel}</li>
  }

  if (getHttpStatus(error) === 401 && !data) {
    return (
      <li className="col-span-full">
        <p role="alert" className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          {isRussian ? 'Ваша сессия завершилась. Войдите, чтобы загрузить задания.' : 'Your session has expired. Sign in to load tasks.'}{' '}
          <a className="font-bold underline underline-offset-2" href="/sign-in?next=%2Fview-ads">{isRussian ? 'Войти' : 'Sign in'}</a>
        </p>
      </li>
    )
  }

  if (error && !data) {
    return <li className="col-span-full"><p role="alert" className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-600 dark:text-rose-300">{isRussian ? 'Не удалось загрузить задания. Попробуйте позже.' : 'Could not load tasks. Please try again later.'}</p></li>
  }

  return (
    <>
      {message && <li className="col-span-full"><p role="status" aria-live="polite" className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</p></li>}
      {errorMessage && <li className="col-span-full"><p role="alert" className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-700 dark:text-amber-300">{errorMessage}</p></li>}
      {tasks.length === 0 ? (
        <li role="status" className="col-span-full rounded-2xl border border-dashboard-outline bg-dashboard-surface px-4 py-10 text-center">
          <span aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-xl bg-dashboard-accent/10 text-dashboard-accent"><Coins size={22} /></span>
          <h3 className="mt-3 text-sm font-bold">{isRussian ? 'Сейчас нет доступных PTC-заданий' : 'No PTC tasks available right now'}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-dashboard-muted">{isRussian ? 'Проверьте позже — список заданий обновляется автоматически.' : 'Check back later. Tasks refresh automatically.'}</p>
        </li>
      ) : visibleTasks.length === 0 ? (
        <li role="status" className="col-span-full rounded-2xl border border-dashboard-outline bg-dashboard-surface px-4 py-8 text-center text-xs text-dashboard-muted">
          {isRussian ? 'По этим условиям заданий не найдено.' : 'No tasks match these filters.'}
        </li>
      ) : visibleTasks.map((task) => {
        const isActive = activeTask?.key === task.key
        const onCooldown = task.cooldownRemainingSeconds > 0 && !task.isInProgress
        const isStarting = startingKey === task.key
        const disabled = Boolean(activeTask || startingKey || onCooldown || task.awaitingConfirmation)
        const domain = (() => {
          try {
            return new URL(task.url).hostname.replace(/^www\./, '')
          } catch {
            return 'Partner'
          }
        })()

        return (
          <li key={task.key} className="ptc-task-card group flex min-h-[210px] flex-col border border-dashboard-outline bg-dashboard-surface p-4 transition duration-200 motion-reduce:transition-none motion-reduce:hover:transform-none">
            <div className="flex min-w-0 items-start gap-3">
              {task.iconUrl ? (
                <img src={task.iconUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-2xl border-2 border-cyan-200/25 bg-[#26345d] object-contain p-1.5 shadow-sm" />
              ) : (
                <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-100/60 bg-[#ffd166] text-[#29204e] shadow-md shadow-amber-950/15"><Eye size={18} /></span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-extrabold tracking-tight">{task.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-dashboard-muted">
                  <span className="inline-flex items-center gap-1"><Globe2 size={11} />{domain}</span>
                  <span className="inline-flex items-center gap-1 text-dashboard-accent"><BadgeCheck size={11} />Partner</span>
                </div>
                {task.description && <p className="mt-1.5 line-clamp-1 text-[10px] leading-4 text-dashboard-muted">{task.description}</p>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashboard-outline pt-3 text-[10px] font-bold">
              <span className="inline-flex items-center gap-1.5 text-dashboard-gold"><Coins size={13} />{formatTokenAtomic(task.rewardAtomic)} {task.tokenSymbol}</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300" title={isRussian ? 'Фактическое начисление зависит от дневного лимита и свободного места в запасе.' : 'Actual credit depends on the daily energy limit and available storage.'}><BatteryCharging size={12} aria-hidden="true" />{isRussian ? `+${ARCADE_PTC_ENERGY_REWARD.toFixed(2)} энергии для бегуна Pepe` : `+${ARCADE_PTC_ENERGY_REWARD.toFixed(2)} Pepe Runner energy`}</span>
              <span className="inline-flex items-center gap-1.5 text-dashboard-muted"><Clock3 size={12} />{task.durationSeconds} {isRussian ? 'сек.' : 'sec'}</span>
              <span className="text-dashboard-muted">{isRussian ? `Осталось: ${task.visitsRemaining}` : `Visits left: ${task.visitsRemaining}`}</span>
            </div>

            <div className="mt-auto pt-3">
              {isActive ? (
                <div role="status" aria-live="polite" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashboard-gold/30 bg-dashboard-gold/10 px-3 py-2 text-[11px] font-bold text-dashboard-gold">
                  <Timer size={14} />
                  {claiming
                    ? (isRussian ? 'Начисляем подтверждённую награду…' : 'Crediting your confirmed reward…')
                    : awaitingPostback
                      ? (isRussian ? 'Ожидаем подтверждения…' : 'Waiting for confirmation…')
                      : secondsRemaining > 0
                        ? (isRussian ? `Автопроверка через ${secondsRemaining} сек.` : `Automatic check in ${secondsRemaining}s`)
                        : (isRussian ? 'Автоматически проверяем выполнение…' : 'Automatically verifying completion…')}
                </div>
              ) : onCooldown ? (
                <span role="status" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashboard-outline bg-dashboard-surface-raised px-3 py-2 text-center text-[10px] font-bold text-dashboard-muted">
                  <Clock3 size={13} />{isRussian ? `Доступно через ${formatCountdown(task.cooldownRemainingSeconds)}` : `Available in ${formatCountdown(task.cooldownRemainingSeconds)}`}
                </span>
              ) : task.awaitingConfirmation ? (
                <span role="status" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashboard-gold/30 bg-dashboard-gold/10 px-3 py-2 text-center text-[10px] font-bold text-dashboard-gold">{isRussian ? 'Ожидаем подтверждения этой награды' : 'Waiting for confirmation of this reward'}</span>
              ) : isStarting ? (
                <span role="status" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashboard-outline bg-dashboard-surface-raised px-3 py-2 text-[10px] font-bold text-dashboard-muted">{isRussian ? 'Открываем задание…' : 'Opening task…'}</span>
              ) : task.isInProgress ? (
                <button type="button" onClick={() => void startTask(task)} disabled={disabled} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-dashboard-gold px-3 py-2 text-[11px] font-extrabold text-slate-950 shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">{isRussian ? 'Продолжить задание' : 'Resume task'}<ArrowUpRight size={13} /></button>
              ) : (
                <button type="button" onClick={() => void startTask(task)} disabled={disabled} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border-2 border-cyan-100/70 bg-dashboard-accent px-4 py-2 text-[11px] font-black text-[#11203e] shadow-md shadow-cyan-950/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">{isRussian ? 'Смотреть рекламу' : 'View Ad'}<ArrowUpRight size={13} /></button>
              )}
            </div>
            {task.isInProgress && !isActive && <p className="mt-2 text-center text-[10px] text-dashboard-muted">{isRussian ? `Осталось ${task.activeRemainingSeconds ?? 0} сек.` : `${task.activeRemainingSeconds ?? 0}s left`}</p>}
          </li>
        )
      })}
    </>
  )
}
