'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Radio, Trophy } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import { ArcadeWeeklyLeaderboard } from '@/components/arcade-weekly-leaderboard'
import { LocalizedTree } from '@/components/site-language-provider'
import type { ProfileAvatarSrc } from '@/lib/profile-avatars'

type WeeklyLeaderboardData = {
  periodStart: string
  periodEnd: string
  leaderboard: Array<{ rank: number; displayName: string; avatarSrc: ProfileAvatarSrc; bestDistanceM: number; prizeAmount: number; prizeTokenSymbol: 'HOMERO' | 'PEPE'; isCurrentUser: boolean }>
}

async function getWeeklyLeaderboard(url: string): Promise<WeeklyLeaderboardData> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as WeeklyLeaderboardData & { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load the weekly leaderboard.')
  return result as WeeklyLeaderboardData
}

export function ArcadeWeeklyLeaderboardPage() {
  const [boardMode, setBoardMode] = useState<'live' | 'demo'>('live')
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
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
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={isRussian ? 'Режим рейтинга' : 'Leaderboard mode'} className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
            <button type="button" aria-pressed={boardMode === 'live'} onClick={() => setBoardMode('live')} className={`min-h-8 rounded-full px-3 text-xs font-bold transition ${boardMode === 'live' ? 'bg-emerald-400/15 text-emerald-50' : 'text-white/65 hover:text-white'}`}>
              {isRussian ? 'Реальный' : 'Live'}
            </button>
            <button type="button" aria-pressed={boardMode === 'demo'} onClick={() => setBoardMode('demo')} className={`min-h-8 rounded-full px-3 text-xs font-bold transition ${boardMode === 'demo' ? 'bg-amber-300/15 text-amber-100' : 'text-white/65 hover:text-white'}`}>
              {isRussian ? 'Демо' : 'Demo'}
            </button>
          </div>
          <div className={`inline-flex min-h-9 w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-[0_0_22px_rgba(16,185,129,0.12)] ${boardMode === 'live' ? 'border-emerald-200/25 bg-emerald-400/10 text-emerald-50' : 'border-amber-200/25 bg-amber-300/10 text-amber-50'}`}>
            <span className={`size-2 rounded-full ${boardMode === 'live' ? 'animate-pulse bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)] motion-reduce:animate-none' : 'bg-amber-200'}`} />
            {boardMode === 'live' ? <><Radio aria-hidden="true" size={14} /> Live</> : (isRussian ? 'Демо · без наград' : 'Demo · no prizes')}
          </div>
        </div>
      </header>

      <ArcadeWeeklyLeaderboard
        data={data}
        boardMode={boardMode}
        error={error}
        isLoading={isLoading}
        isRefreshing={isValidating}
        onRefresh={() => void mutate()}
      />
    </main>
    </LocalizedTree>
  )
}
