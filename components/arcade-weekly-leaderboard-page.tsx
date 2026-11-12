'use client'

import useSWR from 'swr'
import { Radio, Trophy } from 'lucide-react'
import { ArcadeWeeklyLeaderboard } from '@/components/arcade-weekly-leaderboard'
import { LocalizedTree } from '@/components/site-language-provider'

type WeeklyLeaderboardData = {
  periodStart: string
  periodEnd: string
  leaderboard: Array<{ rank: number; displayName: string; bestDistanceM: number; prizeAmount: number; prizeTokenSymbol: 'HOMERO' | 'PEPE'; isCurrentUser: boolean }>
}

async function getWeeklyLeaderboard(url: string): Promise<WeeklyLeaderboardData> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as WeeklyLeaderboardData & { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load the weekly leaderboard.')
  return result as WeeklyLeaderboardData
}

export function ArcadeWeeklyLeaderboardPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<WeeklyLeaderboardData>(
    '/api/arcade/leaderboard',
    getWeeklyLeaderboard,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateOnMount: true,
      refreshInterval: 30_000,
    },
  )

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell weekly-leaderboard-page space-y-4 text-white">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Trophy aria-hidden="true" className="text-amber-200" size={24} />
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Weekly leaderboard</h1>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-white/75">
            Your best server-verified ranked run earns the spot. Casual and boosted runs stay off the board.
          </p>
        </div>
        <div className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.12)]">
          <span className="size-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)] motion-reduce:animate-none" />
          <Radio aria-hidden="true" size={14} /> Live
        </div>
      </header>

      <ArcadeWeeklyLeaderboard
        data={data}
        error={error}
        isLoading={isLoading}
        isRefreshing={isValidating}
        onRefresh={() => void mutate()}
      />
    </main>
    </LocalizedTree>
  )
}
