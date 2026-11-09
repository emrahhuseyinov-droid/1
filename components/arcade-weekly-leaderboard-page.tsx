'use client'

import useSWR from 'swr'
import { Radio, Trophy } from 'lucide-react'
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
    <main id="top" className="dashboard-page-shell space-y-5 text-white">
      <header className="relative isolate flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-[30px] border border-violet-200/20 bg-gradient-to-br from-[#17356b] via-[#29205e] to-[#4a1b55] p-5 shadow-[0_22px_65px_rgba(22,16,65,0.42)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-cyan-300/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-1/3 size-36 rounded-full bg-fuchsia-400/15 blur-3xl" />
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-[22px] border border-white/30 bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] ring-4 ring-white/10">
            <Trophy aria-hidden="true" size={25} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-[30px]">Weekly leaderboard</h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-white/80">
              Your best server-verified ranked run earns the spot. Casual and boosted runs stay off the board.
            </p>
          </div>
        </div>
        <div className="relative z-10 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-cyan-100/25 bg-gradient-to-r from-cyan-300/15 to-violet-300/15 px-4 py-2.5 text-sm font-bold text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.14)] backdrop-blur-sm">
          <span className="size-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
          <Radio aria-hidden="true" size={16} /> Live · refreshes every 30 seconds
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
