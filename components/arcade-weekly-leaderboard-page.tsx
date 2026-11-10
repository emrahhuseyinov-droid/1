'use client'

import useSWR from 'swr'
import { ArcadeWeeklyLeaderboard } from '@/components/arcade-weekly-leaderboard'
import { LocalizedTree } from '@/components/site-language-provider'

type WeeklyLeaderboardData = {
  periodStart: string
  periodEnd: string
  leaderboard: Array<{ rank: number; displayName: string; bestDistanceM: number; prizePepe: number; isCurrentUser: boolean }>
}

async function getWeeklyLeaderboard(url: string): Promise<WeeklyLeaderboardData> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as WeeklyLeaderboardData & { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load the weekly leaderboard.')
  return result as WeeklyLeaderboardData
}

export function ArcadeWeeklyLeaderboardPage() {
  const { data, error, isLoading, mutate } = useSWR<WeeklyLeaderboardData>(
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
      <main id="top" className="dashboard-page-shell weekly-leaderboard-page space-y-1 text-white">
        <header className="px-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="text-base font-black leading-[18px] tracking-tight text-white sm:text-lg sm:leading-6">Weekly leaderboard</h1>
            <span className="rounded-sm border border-emerald-300/45 bg-emerald-300/10 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-emerald-200">FREE</span>
          </div>
          <p className="max-w-3xl text-[8px] leading-[10px] text-slate-200/75 sm:text-[9px] sm:leading-3">
            Your best server-verified ranked run earns the spot. Casual and boosted runs stay off the board.
          </p>
        </header>

        <ArcadeWeeklyLeaderboard
          data={data}
          error={error}
          isLoading={isLoading}
          onRefresh={() => void mutate()}
        />
      </main>
    </LocalizedTree>
  )
}
