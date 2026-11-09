'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock3, Crown, Medal, RefreshCw, Search, Sparkles, Trophy } from 'lucide-react'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import { ARCADE_WEEKLY_PRIZE_BUDGET_PEPE, ARCADE_WEEKLY_PRIZE_TIERS } from '@/lib/arcade-gameplay'

type LeaderboardPlayer = {
  rank: number
  displayName: string
  bestDistanceM: number
  prizePepe: number
  isCurrentUser: boolean
}

type WeeklyLeaderboardData = {
  periodStart: string
  periodEnd: string
  leaderboard: LeaderboardPlayer[]
}

type ArcadeWeeklyLeaderboardProps = {
  data?: WeeklyLeaderboardData
  error?: unknown
  isLoading: boolean
  isRefreshing: boolean
  onRefresh: () => void
}

function formatRankRange(startRank: number, endRank: number) {
  return startRank === endRank ? `#${startRank}` : `#${startRank}–${endRank}`
}

function formatWeekStart(periodStart?: string, language: 'en' | 'ru' = 'en') {
  if (!periodStart) return '—'

  const weekStart = new Date(`${periodStart}T00:00:00.000Z`)
  if (Number.isNaN(weekStart.getTime())) return periodStart

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Baku',
  }).format(weekStart)
}

function WeeklyResetCountdown({ periodEnd }: { periodEnd?: string }) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!periodEnd) return
    const endsAt = Date.parse(periodEnd)
    if (!Number.isFinite(endsAt)) return

    const updateCountdown = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [periodEnd])

  const countdownValues = secondsRemaining === null
    ? ['--', '--', '--', '--']
    : [
      String(Math.floor(secondsRemaining / 86_400)).padStart(2, '0'),
      String(Math.floor((secondsRemaining % 86_400) / 3_600)).padStart(2, '0'),
      String(Math.floor((secondsRemaining % 3_600) / 60)).padStart(2, '0'),
      String(secondsRemaining % 60).padStart(2, '0'),
    ]
  const countdownLabels = ['Days', 'Hours', 'Minutes', 'Seconds']
  const countdownTileStyles = [
    'border-sky-200/25 from-sky-400/20 to-blue-500/10',
    'border-violet-200/25 from-violet-400/20 to-fuchsia-500/10',
    'border-pink-200/25 from-pink-400/20 to-rose-500/10',
    'border-amber-200/25 from-amber-300/20 to-orange-500/10',
  ]

  return (
    <section aria-labelledby="weekly-reset-title" className="relative isolate overflow-hidden rounded-[26px] border border-sky-200/20 bg-gradient-to-br from-[#172c50] via-[#1d214a] to-[#351e4e] p-4 shadow-[0_16px_38px_rgba(8,15,45,0.28)] sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-cyan-300/15 blur-2xl" />
      <div className="relative z-10 flex items-center gap-2 text-sky-100">
        <Clock3 aria-hidden="true" size={18} />
        <h3 id="weekly-reset-title" className="text-base font-extrabold">Weekly reset countdown</h3>
      </div>
      <p id="weekly-reset-label" className="mt-2 text-sm text-white/75">Time until standings reset · Mondays at 17:38 Baku time</p>
      <div role="timer" aria-live="off" aria-labelledby="weekly-reset-label" className="relative z-10 mt-4 grid grid-cols-4 gap-2">
        {countdownValues.map((value, index) => (
          <div key={countdownLabels[index]} className={`min-w-0 rounded-2xl border bg-gradient-to-b px-2 py-3 text-center shadow-inner shadow-black/20 ${countdownTileStyles[index]}`}>
            <span className="block font-mono text-2xl font-black tabular-nums text-white drop-shadow sm:text-3xl">{value}</span>
            <span className="mt-1 block text-xs font-bold text-white/80">{countdownLabels[index]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm leading-6 text-white/75">The leaderboard refreshes every 30 seconds.</p>
    </section>
  )
}

function podiumCardStyle(rank: number, isCurrentUser: boolean) {
  const base = 'group relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[28px] border-2 px-3 py-5 text-center shadow-[0_18px_42px_rgba(0,0,0,0.3)] backdrop-blur-sm transition duration-300 motion-safe:hover:-translate-y-1 motion-reduce:transition-none'
  const rankStyle = rank === 1
    ? 'col-start-2 min-h-[220px] border-amber-200/60 bg-gradient-to-b from-amber-300/35 via-orange-500/20 to-[#21183b] shadow-[0_22px_58px_rgba(249,115,22,0.24)]'
    : rank === 2
      ? 'col-start-1 min-h-[190px] border-sky-200/45 bg-gradient-to-b from-sky-300/25 via-blue-500/15 to-[#172243] shadow-[0_18px_44px_rgba(56,189,248,0.16)]'
      : 'col-start-3 min-h-[190px] border-rose-200/45 bg-gradient-to-b from-rose-300/25 via-fuchsia-500/15 to-[#241a3f] shadow-[0_18px_44px_rgba(244,63,94,0.16)]'
  const userStyle = isCurrentUser ? 'ring-2 ring-cyan-200/80 shadow-[0_0_34px_rgba(34,211,238,0.24)]' : ''

  return `${base} ${rankStyle} ${userStyle}`
}

function prizeTierStyle(startRank: number) {
  if (startRank === 1) return 'border-amber-200/35 from-amber-300/20 to-orange-500/10 hover:border-amber-200/60'
  if (startRank === 2) return 'border-sky-200/30 from-sky-300/15 to-blue-500/10 hover:border-sky-200/55'
  if (startRank === 3) return 'border-rose-200/30 from-rose-300/15 to-fuchsia-500/10 hover:border-rose-200/55'
  if (startRank <= 10) return 'border-emerald-200/25 from-emerald-300/[0.12] to-teal-500/[0.08] hover:border-emerald-200/50'
  return 'border-violet-200/20 from-violet-300/10 to-indigo-500/[0.08] hover:border-violet-200/45'
}

function tableRankStyle(rank: number) {
  if (rank === 1) return 'border-amber-200/35 bg-amber-300/15 text-amber-50'
  if (rank === 2) return 'border-sky-200/30 bg-sky-300/10 text-sky-50'
  if (rank === 3) return 'border-rose-200/30 bg-rose-300/10 text-rose-50'
  return 'border-violet-200/15 bg-violet-300/[0.07] text-violet-100'
}

export function ArcadeWeeklyLeaderboard({
  data,
  error,
  isLoading,
  isRefreshing,
  onRefresh,
}: ArcadeWeeklyLeaderboardProps) {
  const { language } = useSiteLanguage()
  const leaderboard = data?.leaderboard ?? []
  const [searchQuery, setSearchQuery] = useState('')
  const showError = Boolean(error) && !data
  const showLoading = isLoading && !data && !showError

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return leaderboard
    return leaderboard.filter((player) => player.displayName.toLowerCase().includes(normalizedQuery))
  }, [leaderboard, searchQuery])

  return (
    <LocalizedTree>
      <section
        aria-labelledby="arcade-weekly-leaderboard-title"
        className="relative isolate overflow-hidden rounded-[30px] border border-violet-200/20 bg-gradient-to-br from-[#142953] via-[#1c2045] to-[#311a43] p-4 shadow-[0_26px_78px_rgba(14,12,50,0.5)] ring-1 ring-inset ring-white/[0.05] sm:p-6"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-300/[0.07] via-transparent to-fuchsia-300/[0.055]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-violet-300/[0.12] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[28%] size-56 rounded-full bg-cyan-300/[0.08] blur-3xl" />

        <div className="relative z-10">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-[20px] border border-cyan-100/25 bg-gradient-to-br from-cyan-300/25 via-blue-400/20 to-violet-400/25 text-cyan-100 shadow-[0_0_32px_rgba(34,211,238,0.17)] ring-1 ring-inset ring-white/10">
                <Trophy aria-hidden="true" size={20} />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-200">
                  <span aria-hidden="true" className="size-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.75)]" />
                  This week · ranked runs
                </p>
                <h2 id="arcade-weekly-leaderboard-title" className="mt-1 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
                  Arcade Weekly Leaderboard
                </h2>
                <p className="mt-1 text-sm leading-5 text-white/75">Fixed PEPE rewards for the top 100 players.</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex min-h-10 items-center rounded-full border border-violet-200/25 bg-gradient-to-r from-violet-300/15 to-sky-300/10 px-3 font-mono text-xs font-bold text-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {language === 'ru' ? 'Баку' : 'Baku'} · {formatWeekStart(data?.periodStart, language)}
              </span>
              <button
                type="button"
                aria-label="Refresh weekly leaderboard"
                title="Refresh leaderboard"
                onClick={onRefresh}
                disabled={isLoading || isRefreshing}
                className="inline-flex size-10 items-center justify-center rounded-2xl border border-cyan-100/20 bg-gradient-to-br from-cyan-300/15 to-violet-300/15 text-cyan-50 transition hover:border-cyan-100/45 hover:from-cyan-300/25 hover:to-violet-300/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] disabled:cursor-wait disabled:opacity-55"
              >
                <RefreshCw aria-hidden="true" size={16} className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
              </button>
            </div>
          </header>

          <div aria-hidden="true" className="mt-5 h-px bg-gradient-to-r from-cyan-300/35 via-violet-300/25 to-transparent" />

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <WeeklyResetCountdown periodEnd={data?.periodEnd} />

            <section aria-labelledby="weekly-prizes-title" className="relative isolate overflow-hidden rounded-[26px] border border-violet-200/20 bg-gradient-to-br from-[#19284b] via-[#202044] to-[#351f4d] p-4 shadow-[0_16px_38px_rgba(8,15,45,0.24)] sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 id="weekly-prizes-title" className="text-base font-extrabold text-white">Fixed weekly prizes</h3>
                  <p className="mt-1 text-sm text-white/75">Reward by final rank</p>
                </div>
                <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-cyan-100/20 bg-gradient-to-r from-cyan-300/10 to-violet-300/10 px-3 py-1.5 text-xs text-cyan-50"><span className="font-semibold">Max weekly budget</span><span className="font-mono font-extrabold tabular-nums">{ARCADE_WEEKLY_PRIZE_BUDGET_PEPE.toLocaleString()} PEPE</span></span>
              </div>
              <ul aria-label="Weekly prize tiers" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {ARCADE_WEEKLY_PRIZE_TIERS.map((tier) => (
                  <li key={`${tier.startRank}-${tier.endRank}`} className={`flex min-h-11 items-center justify-between gap-2 rounded-2xl border bg-gradient-to-br px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-all hover:-translate-y-0.5 ${prizeTierStyle(tier.startRank)}`}>
                    <span className="text-sm font-bold text-white/90">{formatRankRange(tier.startRank, tier.endRank)}</span>
                    <span className="whitespace-nowrap font-mono text-sm font-extrabold tabular-nums text-white">{tier.amountPepe.toLocaleString()} PEPE</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-white/75">Awards are paid from the platform&apos;s general PEPE capital. If funds are temporarily unavailable, claims remain pending.</p>
            </section>
          </div>

          {showLoading && (
            <div role="status" aria-live="polite" className="mt-5 flex min-h-36 flex-col items-center justify-center rounded-[26px] border border-cyan-100/15 bg-gradient-to-br from-[#192848] to-[#241b43] px-4 text-center shadow-inner shadow-white/[0.03]">
              <RefreshCw aria-hidden="true" size={20} className="mb-3 animate-spin text-cyan-200 motion-reduce:animate-none" />
              <p className="text-sm font-bold text-white">Loading live standings</p>
              <p className="mt-1 text-sm text-white/75">Syncing this week&apos;s ranked runs.</p>
            </div>
          )}

          {showError && (
            <div role="alert" className="mt-5 flex min-h-36 flex-col items-center justify-center rounded-2xl border border-rose-300/25 bg-rose-300/[0.045] px-4 text-center">
              <AlertCircle aria-hidden="true" size={20} className="mb-3 text-rose-200" />
              <p className="text-sm font-bold text-white">Weekly standings are unavailable</p>
              <p className="mt-1 text-sm text-white/75">Try refreshing to reconnect to the live board.</p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-3 min-h-10 rounded-full border border-rose-200/25 bg-rose-200/[0.08] px-4 text-sm font-bold text-rose-100 transition hover:bg-rose-200/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]"
              >
                Try again
              </button>
            </div>
          )}

          {!showLoading && !showError && leaderboard.length === 0 && (
            <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-[26px] border border-dashed border-violet-200/25 bg-gradient-to-br from-[#192848] to-[#251c43] px-5 py-6 text-center">
              <div aria-hidden="true" className="mb-3 grid size-12 place-items-center rounded-[20px] border border-amber-200/25 bg-gradient-to-br from-amber-300/20 to-orange-400/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.13)]">
                <Trophy size={20} />
              </div>
              <p className="text-base font-extrabold text-white">Own the first spot</p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-white/75">No ranked runs yet this week. Complete a verified run to take the top of the board.</p>
            </div>
          )}

          {leaderboard.length > 0 && (
            <>
              <section aria-labelledby="weekly-podium-title" className="mt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 id="weekly-podium-title" className="text-sm font-extrabold uppercase tracking-[0.12em] text-white/85">Weekly podium</h3>
                  <span className="rounded-full border border-cyan-100/20 bg-gradient-to-r from-cyan-300/10 to-violet-300/10 px-3 py-1.5 text-xs font-bold text-cyan-50">Live standings</span>
                </div>
                <ol aria-label="Top three weekly players" className="grid grid-cols-3 items-end gap-2 sm:gap-3">
                    {leaderboard.slice(0, 3).map((player) => {
                      const placeLabel = player.rank === 1 ? '1st place' : player.rank === 2 ? '2nd place' : '3rd place'
                      const RankIcon = player.rank === 1 ? Crown : Medal
                      const medalTone = player.rank === 1 ? 'text-amber-100' : player.rank === 2 ? 'text-sky-100' : 'text-rose-100'
                      return (
                        <li key={`podium-${player.rank}`} className={podiumCardStyle(player.rank, player.isCurrentUser)}>
                          <Sparkles aria-hidden="true" className="absolute left-3 top-3 text-white/45" size={16} />
                          {player.isCurrentUser && <span className="absolute right-2 top-2 rounded-full border border-cyan-100/25 bg-cyan-300/20 px-2 py-1 text-xs font-extrabold text-cyan-50">You</span>}
                          <div className={`mb-2 grid size-14 place-items-center rounded-[22px] border border-white/25 bg-white/10 shadow-lg ring-1 ring-inset ring-white/10 ${medalTone}`}>
                            <RankIcon aria-hidden="true" size={30} />
                          </div>
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/75">{placeLabel}</span>
                          <p className="mt-2 max-w-full truncate text-sm font-extrabold text-white">{player.displayName}</p>
                          <p className="mt-1 whitespace-nowrap font-mono text-lg font-black tabular-nums text-white sm:text-xl">{player.bestDistanceM.toLocaleString()} <span className="text-xs font-bold text-white/75">m</span></p>
                          <span className="mt-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">{player.prizePepe.toLocaleString()} PEPE</span>
                        </li>
                      )
                    })}

                </ol>
              </section>

              <section aria-labelledby="top-100-title" className="mt-7">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 id="top-100-title" className="text-base font-extrabold text-white">Top 100 weekly players</h3>
                    <p className="mt-1 text-sm text-white/75">
                      {'Showing'} <span className="font-bold text-white">{filteredPlayers.length}</span> {'of'} <span className="font-bold text-white">{leaderboard.length}</span> {'players'}
                    </p>
                  </div>
                  <label className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-violet-200/20 bg-gradient-to-r from-[#1c2543] to-[#221d3e] px-3 text-white/75 shadow-inner focus-within:border-cyan-200/50 focus-within:ring-2 focus-within:ring-cyan-200/30 sm:max-w-xs">
                    <Search aria-hidden="true" size={17} className="shrink-0" />
                    <span className="sr-only">Search players</span>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search players"
                      className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white placeholder:text-white/65 focus:outline-none"
                    />
                  </label>
                </header>

                {filteredPlayers.length > 0 ? (
                  <div role="region" aria-label="Top 100 weekly players" tabIndex={0} className="mt-3 overflow-x-auto rounded-[24px] border border-cyan-100/15 bg-[#121b34]/70 shadow-[0_14px_35px_rgba(7,12,38,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                    <table className="w-full min-w-[620px] border-collapse text-left">
                      <caption className="sr-only">Weekly top 100 ranked players and fixed PEPE prizes</caption>
                      <thead className="bg-gradient-to-r from-[#26335b] via-[#292348] to-[#312046] text-xs font-extrabold uppercase tracking-wide text-cyan-50">
                        <tr>
                          <th scope="col" className="px-4 py-3">Rank</th>
                          <th scope="col" className="px-4 py-3">Player</th>
                          <th scope="col" className="px-4 py-3 text-right">Best distance</th>
                          <th scope="col" className="px-4 py-3 text-right">Prize</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-100/10">
                        {filteredPlayers.map((player) => (
                          <tr key={`rank-${player.rank}`} className={player.isCurrentUser ? 'bg-gradient-to-r from-cyan-300/[0.13] via-violet-300/[0.08] to-transparent' : 'bg-white/[0.012] transition-colors hover:bg-violet-300/[0.045]'}>
                            <th scope="row" className="whitespace-nowrap px-4 py-3 font-mono text-sm font-extrabold"><span className={`inline-flex min-w-10 justify-center rounded-xl border px-2 py-1 ${tableRankStyle(player.rank)}`}>#{String(player.rank).padStart(2, '0')}</span></th>
                            <td className="px-4 py-3 text-sm font-semibold text-white">
                              <span>{player.displayName}</span>
                              {player.isCurrentUser && <span className="ml-2 rounded-full border border-cyan-100/20 bg-cyan-300/15 px-2 py-1 text-xs font-extrabold text-cyan-50">You</span>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-bold tabular-nums text-white">{player.bestDistanceM.toLocaleString()} m</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-extrabold tabular-nums text-cyan-100">{player.prizePepe.toLocaleString()} PEPE</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/75">No players match this search.</p>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </LocalizedTree>
  )
}
