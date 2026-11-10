'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock3, Crown, Medal, RefreshCw, Search, Trophy } from 'lucide-react'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import { ARCADE_WEEKLY_PRIZE_BUDGET_HOMERO, ARCADE_WEEKLY_PRIZE_BUDGET_PEPE, ARCADE_WEEKLY_PRIZE_TIERS } from '@/lib/arcade-gameplay'

type LeaderboardPlayer = {
  rank: number
  displayName: string
  bestDistanceM: number
  prizeAmount: number
  prizeTokenSymbol: 'HOMERO' | 'PEPE'
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

  return (
    <LocalizedTree>
      <section aria-labelledby="weekly-reset-title" className="relative isolate overflow-hidden rounded-[24px] border-2 border-amber-100/25 bg-gradient-to-br from-[#172641] via-[#18203a] to-[#251e3e] p-4 shadow-[0_12px_32px_rgba(6,12,30,0.28)] sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-amber-300/10 blur-2xl" />
        <div className="relative z-10 flex items-center gap-2 text-amber-100">
          <Clock3 aria-hidden="true" size={18} />
          <h3 id="weekly-reset-title" className="text-base font-extrabold">Weekly reset countdown</h3>
        </div>
        <p id="weekly-reset-label" className="mt-2 text-sm text-white/75">Time until standings reset · Mondays at 17:38 Baku time</p>
        <div role="timer" aria-live="off" aria-labelledby="weekly-reset-label" className="relative z-10 mt-4 grid grid-cols-4 gap-2">
          {countdownValues.map((value, index) => (
            <div key={countdownLabels[index]} className="min-w-0 rounded-[17px] border border-white/15 bg-gradient-to-b from-[#293756] to-[#11192d] px-1.5 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_5px_12px_rgba(0,0,0,0.18)] sm:px-2">
              <span className="block font-mono text-2xl font-black tabular-nums text-white drop-shadow sm:text-3xl">{value}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-white/75 sm:text-xs">{countdownLabels[index]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-white/75">The leaderboard refreshes every 30 seconds.</p>
      </section>
    </LocalizedTree>
  )
}

function podiumCardStyle(rank: number, isCurrentUser: boolean) {
  const base = 'relative isolate flex min-h-[216px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[26px] border p-5 text-center text-white shadow-[0_16px_38px_rgba(0,0,0,0.28)] transition duration-300 motion-safe:hover:-translate-y-1 motion-reduce:transition-none sm:rounded-[30px]'
  const rankStyle = rank === 1
    ? 'border-amber-200/50 bg-gradient-to-br from-[#3b321e] via-[#1b2134] to-[#10182a] shadow-[0_18px_42px_rgba(230,177,72,0.15)] sm:col-start-2 sm:row-start-1 sm:min-h-[244px]'
    : rank === 2
      ? 'border-slate-200/25 bg-gradient-to-br from-[#243653] via-[#172238] to-[#10182a] sm:col-start-1 sm:row-start-1'
      : 'border-violet-200/25 bg-gradient-to-br from-[#332746] via-[#201d36] to-[#13162a] sm:col-start-3 sm:row-start-1'
  const userStyle = isCurrentUser ? 'ring-2 ring-cyan-200/80 ring-offset-2 ring-offset-[#0c1425]' : ''

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

function PlayerAvatar({ player, compact = false }: { player: LeaderboardPlayer; compact?: boolean }) {
  const initials = player.displayName.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? '').join('').toUpperCase() || '?'
  const size = compact ? 'size-7 text-[9px]' : 'size-9 text-xs'
  const tone = player.rank === 1
    ? 'border-amber-200/40 bg-amber-300/20 text-amber-50'
    : player.rank === 2
      ? 'border-sky-200/40 bg-sky-300/20 text-sky-50'
      : player.rank === 3
        ? 'border-fuchsia-200/40 bg-fuchsia-300/20 text-fuchsia-50'
        : 'border-white/20 bg-white/10 text-white/90'

  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full border font-black tracking-wide shadow-inner shadow-black/20 ${size} ${tone}`}>{initials}</span>
}

export function ArcadeWeeklyLeaderboard({
  data,
  error,
  isLoading,
  isRefreshing,
  onRefresh,
}: ArcadeWeeklyLeaderboardProps) {
  const { language } = useSiteLanguage()
  const leaderboard = (data?.leaderboard ?? []).slice(0, 100)
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
        aria-label="Weekly leaderboard content"
        className="weekly-leaderboard-panel relative isolate overflow-hidden rounded-[30px] border border-sky-100/20 p-4 shadow-[0_26px_78px_rgba(7,12,30,0.52)] ring-1 ring-inset ring-white/[0.05] sm:p-6"
      >
        <div aria-hidden="true" className="weekly-leaderboard-stars pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-violet-300/[0.12] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[28%] size-56 rounded-full bg-cyan-300/[0.08] blur-3xl" />

        <div className="relative z-10">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-[#111a2e]/80 px-3 font-mono text-xs font-bold text-white/80">
              {language === 'ru' ? 'Баку' : 'Baku'} · {formatWeekStart(data?.periodStart, language)}
            </span>
            <button
              type="button"
              aria-label="Refresh weekly leaderboard"
              title="Refresh leaderboard"
              onClick={onRefresh}
              disabled={isLoading || isRefreshing}
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-[#111a2e]/80 text-white/80 transition hover:border-cyan-100/40 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCw aria-hidden="true" size={15} className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <WeeklyResetCountdown periodEnd={data?.periodEnd} />

            <section aria-labelledby="weekly-prizes-title" className="relative isolate overflow-hidden rounded-[24px] border-2 border-sky-100/35 bg-gradient-to-br from-[#172944] via-[#17223d] to-[#202044] p-4 shadow-[0_12px_32px_rgba(6,12,30,0.25)] sm:p-5">
              <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-sky-300/10 blur-2xl" />
              <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 id="weekly-prizes-title" className="text-base font-extrabold text-white">Fixed weekly prizes</h3>
                  <p className="mt-1 text-sm text-white/75">Reward by final rank</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-sky-50">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100/20 bg-[#101a2e]/70 px-3 py-1.5"><span className="font-semibold">PEPE budget</span><span className="font-mono font-extrabold tabular-nums">{ARCADE_WEEKLY_PRIZE_BUDGET_PEPE.toLocaleString()} PEPE</span></span>
                </div>
              </div>
              <ul aria-label="Weekly prize tiers" className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {ARCADE_WEEKLY_PRIZE_TIERS.map((tier) => (
                  <li key={`${tier.startRank}-${tier.endRank}`} className={`flex min-h-10 items-center justify-between gap-1.5 rounded-xl border bg-gradient-to-br px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-colors hover:brightness-110 sm:px-3 ${prizeTierStyle(tier.startRank)}`}>
                    <span className="text-xs font-bold text-white/90 sm:text-sm">{formatRankRange(tier.startRank, tier.endRank)}</span>
                    <span className="whitespace-nowrap font-mono text-xs font-extrabold tabular-nums text-white sm:text-sm">{tier.amount.toLocaleString()} {tier.tokenSymbol}</span>
                  </li>
                ))}
              </ul>
              <p className="relative z-10 mt-4 text-sm leading-6 text-white/75">All weekly prizes, from 1st to 100th place, are paid in PEPE; claims remain pending if reserve funds are temporarily unavailable.</p>
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
              <section aria-labelledby="weekly-podium-title" className="mt-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
                  <div>
                    <h3 id="weekly-podium-title" className="text-lg font-black tracking-tight text-white sm:text-xl">Weekly podium</h3>
                    <p className="mt-1 text-sm text-white/65">Top three weekly players</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/[0.08] px-3 py-1.5 text-xs font-bold text-emerald-100"><span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-300" />Live standings</span>
                </div>
                <div className="relative isolate overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-[#111e34] via-[#10192d] to-[#19182f] p-3 shadow-[0_20px_55px_rgba(4,9,24,0.35)] sm:p-5">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-violet-400/[0.08] blur-3xl" />
                  <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-[32%] size-56 rounded-full bg-cyan-300/[0.07] blur-3xl" />
                  <ol aria-label="Top three weekly players" className="relative grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end sm:gap-4">
                    {leaderboard.slice(0, 3).map((player) => {
                      const placeLabel = player.rank === 1 ? '1st place' : player.rank === 2 ? '2nd place' : '3rd place'
                      const RankIcon = player.rank === 1 ? Crown : Medal
                      const medalTone = player.rank === 1 ? 'text-amber-100' : player.rank === 2 ? 'text-sky-100' : 'text-violet-100'
                      return (
                        <li key={`podium-${player.rank}`} className={podiumCardStyle(player.rank, player.isCurrentUser)}>
                          <div aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-12 size-36 rounded-full blur-3xl ${player.rank === 1 ? 'bg-amber-300/10' : player.rank === 2 ? 'bg-sky-300/[0.08]' : 'bg-violet-300/[0.08]'}`} />
                          <div className="relative z-10 flex w-full flex-col items-center">
                            <div className="flex items-center gap-2">
                              <span className={`grid size-10 place-items-center rounded-2xl border font-mono text-sm font-black ${player.rank === 1 ? 'border-amber-100/30 bg-amber-200/10 text-amber-100' : player.rank === 2 ? 'border-sky-100/25 bg-sky-200/[0.08] text-sky-100' : 'border-violet-100/25 bg-violet-200/[0.08] text-violet-100'}`}>#{player.rank}</span>
                              <RankIcon aria-hidden="true" className={medalTone} size={19} />
                              {player.isCurrentUser && <span className="rounded-full border border-cyan-100/25 bg-cyan-300/15 px-2 py-1 text-[10px] font-extrabold text-cyan-50">You</span>}
                            </div>
                            <div className="mt-4 flex max-w-full items-center gap-3">
                              <PlayerAvatar player={player} />
                              <div className="min-w-0 text-left">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{placeLabel}</p>
                                <p className="mt-1 max-w-full truncate text-base font-extrabold text-white sm:text-lg">{player.displayName}</p>
                              </div>
                            </div>
                            <p className="mt-4 flex items-baseline gap-1 font-mono text-2xl font-black tracking-tight tabular-nums text-white sm:text-3xl">{player.bestDistanceM.toLocaleString()} <span className="text-xs font-bold text-white/60 sm:text-sm">m</span></p>
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
                              <span className="text-xs font-semibold text-white/60">Prize</span>
                              <span className="font-mono text-xs font-extrabold tabular-nums text-cyan-100">{player.prizeAmount.toLocaleString()} {player.prizeTokenSymbol}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </section>

              <section aria-labelledby="top-100-title" className="mt-7">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 id="top-100-title" className="text-base font-extrabold text-white">Top 100 weekly players</h3>
                    <p className="mt-1 text-sm text-white/75">
                      {'Showing'} <span className="font-bold text-white">{filteredPlayers.length}</span> {'of'} <span className="font-bold text-white">{leaderboard.length}</span> {'players'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/55">{'Up to'} <span>100</span> {'players'}</p>
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
                  <div role="region" aria-label="Top 100 weekly players" tabIndex={0} className="mt-3 max-h-[70vh] overflow-auto rounded-[20px] border border-sky-100/15 bg-[#0d1729]/90 shadow-[0_14px_35px_rgba(7,12,38,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                    <table className="w-full min-w-[600px] border-collapse text-left">
                      <caption className="sr-only">Weekly top 100 ranked players and token prizes</caption>
                      <thead className="sticky top-0 z-10 bg-[#1b2944] text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-100/80 sm:text-xs">
                        <tr>
                          <th scope="col" className="px-4 py-3">Rank</th>
                          <th scope="col" className="px-4 py-3">Player</th>
                          <th scope="col" className="px-4 py-3 text-right">Best result</th>
                          <th scope="col" className="px-4 py-3 text-right">Prize</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100/[0.08]">
                        {filteredPlayers.map((player) => (
                          <tr key={`rank-${player.rank}`} className={player.isCurrentUser ? 'bg-gradient-to-r from-cyan-300/[0.13] via-violet-300/[0.08] to-transparent' : 'bg-white/[0.012] transition-colors hover:bg-white/[0.035]'}>
                            <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-mono text-sm font-extrabold"><span className={`inline-flex min-w-10 justify-center rounded-lg border px-2 py-1 ${tableRankStyle(player.rank)}`}>#{String(player.rank).padStart(2, '0')}</span></th>
                            <td className="px-4 py-2.5 text-sm font-semibold text-white">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <PlayerAvatar player={player} compact />
                                <span className="min-w-0 truncate">{player.displayName}</span>
                                {player.isCurrentUser && <span className="rounded-full border border-cyan-100/20 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-extrabold text-cyan-50">You</span>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums text-white">{player.bestDistanceM.toLocaleString()} m</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm font-extrabold tabular-nums text-cyan-100">{player.prizeAmount.toLocaleString()} {player.prizeTokenSymbol}</td>
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
