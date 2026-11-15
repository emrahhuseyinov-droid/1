'use client'

import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Clock3, Coins, Eye, Globe2 } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type OfferwallPtcTask = {
  key: string
  title: string
  description: string
  url: string
  iconUrl: string | null
  durationSeconds: number
  rewardAtomic: string
}

type PtcListResponse = { tasks: OfferwallPtcTask[] }
type FetchError = Error & { status?: number }
type TaskSort = 'reward' | 'duration'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOfferwallTask(value: unknown): value is OfferwallPtcTask {
  if (!isRecord(value)) return false
  return typeof value.key === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.url === 'string'
    && (typeof value.iconUrl === 'string' || value.iconUrl === null)
    && typeof value.durationSeconds === 'number'
    && Number.isSafeInteger(value.durationSeconds)
    && typeof value.rewardAtomic === 'string'
    && /^\d+$/.test(value.rewardAtomic)
}

async function fetchPtcAds(): Promise<PtcListResponse> {
  const response = await fetch('/api/ptc/list', { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  const data = isRecord(payload) ? payload : null

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Could not load PTC ads.'
    throw Object.assign(new Error(message), { status: response.status }) as FetchError
  }

  return { tasks: Array.isArray(data?.tasks) ? data.tasks.filter(isOfferwallTask) : [] }
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error) || typeof error.status !== 'number') return null
  return error.status
}

export function OfferwallPtcList({
  onAvailableCountChange,
  searchQuery = '',
  sortBy = 'reward',
}: {
  onAvailableCountChange?: (count: number) => void
  searchQuery?: string
  sortBy?: TaskSort
}) {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const { data, error, isLoading } = useSWR('/api/ptc/list', fetchPtcAds, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })

  useEffect(() => {
    if (data) onAvailableCountChange?.(data.tasks.length)
  }, [data, onAvailableCountChange])

  const tasks = data?.tasks ?? []
  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return tasks
      .filter((task) => !query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query))
      .sort((first, second) => {
        if (sortBy === 'duration') return first.durationSeconds - second.durationSeconds
        const rewardDifference = BigInt(second.rewardAtomic) - BigInt(first.rewardAtomic)
        return rewardDifference > 0n ? 1 : rewardDifference < 0n ? -1 : 0
      })
  }, [searchQuery, sortBy, tasks])

  if (isLoading && !data) {
    return <li role="status" className="col-span-full rounded-2xl border border-dashboard-outline bg-dashboard-surface px-4 py-8 text-center text-xs text-dashboard-muted">{isRussian ? 'Загружаем PTC-рекламу Offerwall.me…' : 'Loading Offerwall.me PTC ads…'}</li>
  }

  if (getErrorStatus(error) === 401 && !data) {
    return (
      <li className="col-span-full">
        <p role="alert" className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          {isRussian ? 'Войдите, чтобы загрузить рекламу Offerwall.me.' : 'Sign in to load Offerwall.me ads.'}{' '}
          <a className="font-bold underline underline-offset-2" href="/sign-in?next=%2Fview-ads">{isRussian ? 'Войти' : 'Sign in'}</a>
        </p>
      </li>
    )
  }

  if (error && !data) {
    return <li className="col-span-full"><p role="alert" className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-600 dark:text-rose-300">{isRussian ? 'Не удалось загрузить рекламу Offerwall.me. Попробуйте позже.' : 'Could not load Offerwall.me ads. Please try again later.'}</p></li>
  }

  if (tasks.length === 0) return null

  if (visibleTasks.length === 0) {
    return <li role="status" className="col-span-full rounded-2xl border border-dashboard-outline bg-dashboard-surface px-4 py-8 text-center text-xs text-dashboard-muted">{isRussian ? 'По этим условиям заданий не найдено.' : 'No tasks match these filters.'}</li>
  }

  return (
    <>
      {visibleTasks.map((task) => (
        <li key={task.key} className="ptc-task-card group flex min-h-[210px] flex-col border border-dashboard-outline bg-dashboard-surface p-4 transition duration-200 motion-reduce:transition-none motion-reduce:hover:transform-none">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-amber-100/60 bg-[#ffd166] text-[#29204e] shadow-md shadow-amber-950/15">
              <Eye size={18} />
              {task.iconUrl && <img src={task.iconUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={(event) => event.currentTarget.remove()} className="absolute inset-0 size-full rounded-full border-2 border-cyan-200/25 bg-[#26345d] object-contain p-1.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-extrabold tracking-tight">{task.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-dashboard-muted">
                <span className="inline-flex items-center gap-1"><Globe2 size={11} aria-hidden="true" />Offerwall.me</span>
                <span className="inline-flex items-center gap-1 text-dashboard-accent"><Eye size={11} aria-hidden="true" />{isRussian ? 'Партнёр' : 'Partner'}</span>
              </div>
              {task.description && <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-dashboard-muted">{task.description}</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashboard-outline pt-3 text-[10px] font-bold">
            <span className="inline-flex items-center gap-1.5 text-dashboard-gold"><Coins size={13} aria-hidden="true" />{formatTokenAtomic(task.rewardAtomic)} PEPE</span>
            <span className="inline-flex items-center gap-1.5 text-dashboard-muted"><Clock3 size={12} aria-hidden="true" />{task.durationSeconds} {isRussian ? 'сек.' : 'sec'}</span>
          </div>

          <div className="mt-auto pt-3">
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border-2 border-cyan-100/70 bg-dashboard-accent px-4 py-2 text-[11px] font-black text-[#11203e] shadow-md shadow-cyan-950/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isRussian ? 'Смотреть рекламу' : 'View Ad'}<ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
        </li>
      ))}
    </>
  )
}
