'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AlertCircle, Coins, RefreshCw, Search, Trophy } from 'lucide-react'
import { LocalizedTree } from '@/components/site-language-provider'
import { ARCADE_WEEKLY_PRIZE_TIERS } from '@/lib/arcade-gameplay'

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
  onRefresh: () => void
}

function formatRankRange(startRank: number, endRank: number) {
  return startRank === endRank ? `#${startRank}` : `#${startRank}–${endRank}`
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
      <section aria-labelledby="weekly-reset-title" className="relative isolate overflow-hidden rounded-[9px] border-2 border-amber-200/70 bg-gradient-to-br from-[#17243b] via-[#111b30] to-[#10182a] p-1.5 shadow-[0_5px_14px_rgba(0,0,0,0.38)] ring-1 ring-inset ring-amber-100/10 sm:p-2">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/80 to-transparent" />
        <h3 id="weekly-reset-title" className="text-[8px] font-extrabold leading-3 text-amber-50 sm:text-[10px]">Arcade</h3>
        <p id="weekly-reset-label" className="text-[6px] leading-[1.1] text-slate-200/80 sm:text-[7px]">Time until standings reset · Mondays at 17:38 Baku time</p>
        <div role="timer" aria-live="off" aria-labelledby="weekly-reset-label" className="mt-1 grid grid-cols-4 gap-1">
          {countdownValues.map((value, index) => (
            <div key={countdownLabels[index]} className="min-w-0 rounded-[4px] border border-slate-200/25 bg-gradient-to-b from-[#29354c] to-[#111a2a] px-0.5 py-0.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_5px_rgba(0,0,0,0.25)] sm:py-1">
              <span className="block font-mono text-sm font-black leading-5 tabular-nums text-white sm:text-base">{value}</span>
              <span className="mt-0.5 block text-[6px] font-semibold leading-none text-slate-200/80 sm:text-[7px]">{countdownLabels[index]}</span>
            </div>
          ))}
        </div>
      </section>
    </LocalizedTree>
  )
}

function podiumCardStyle(rank: number, isCurrentUser: boolean) {
  const base = 'absolute z-10 flex min-w-0 flex-col items-center justify-center rounded-[6px] border px-1 pb-1 text-center text-white shadow-[0_5px_12px_rgba(0,0,0,0.4)] backdrop-blur-[2px]'
  const rankStyle = rank === 1
    ? 'left-1/2 top-[30%] h-[54%] w-[28%] -translate-x-1/2 border-amber-100/65 bg-gradient-to-b from-[#503f27]/90 to-[#101827]/90 pt-3'
    : rank === 2
      ? 'left-[9%] top-[44%] h-[43%] w-[25%] border-sky-100/55 bg-gradient-to-b from-[#29405a]/90 to-[#101827]/90 pt-3'
      : 'right-[9%] top-[44%] h-[43%] w-[25%] border-fuchsia-100/55 bg-gradient-to-b from-[#452d4c]/90 to-[#171627]/90 pt-3'
  const userStyle = isCurrentUser ? 'ring-1 ring-cyan-100/80' : ''

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

function PlayerAvatar({ player, compact = false, tiny = false }: { player: LeaderboardPlayer; compact?: boolean; tiny?: boolean }) {
  const initials = player.displayName.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? '').join('').toUpperCase() || '?'
  const size = tiny ? 'size-3 text-[5px]' : compact ? 'size-6 text-[8px]' : 'size-9 text-xs'
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
  onRefresh,
}: ArcadeWeeklyLeaderboardProps) {
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
      <section aria-label="Weekly leaderboard content" className="relative isolate min-w-0">
        <div className="relative z-10">
          <div className="grid grid-cols-[0.8fr_1fr] gap-2 sm:gap-3">
            <WeeklyResetCountdown periodEnd={data?.periodEnd} />

            <section aria-labelledby="weekly-prizes-title" className="relative isolate overflow-hidden rounded-[9px] border-2 border-sky-100/65 bg-gradient-to-br from-[#172940] via-[#111b31] to-[#111a2a] p-1.5 shadow-[0_5px_14px_rgba(0,0,0,0.36)] ring-1 ring-inset ring-sky-100/10 sm:p-2">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-sky-100/85 to-transparent" />
              <h3 id="weekly-prizes-title" className="text-[8px] font-extrabold leading-3 text-white sm:text-[10px]">Fixed weekly prizes</h3>
              <ul aria-label="Weekly prize tiers" className="mt-1 grid grid-cols-3 gap-px xl:grid-cols-4">
                {ARCADE_WEEKLY_PRIZE_TIERS.map((tier) => (
                  <li key={`${tier.startRank}-${tier.endRank}`} className={`flex min-w-0 items-center justify-between gap-0.5 rounded-[3px] border bg-gradient-to-br px-1 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-1.5 ${prizeTierStyle(tier.startRank)}`}>
                    <span className="truncate text-[6px] font-bold leading-none text-white/90 sm:text-[7px]">{formatRankRange(tier.startRank, tier.endRank)}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[6px] font-extrabold leading-none tabular-nums text-white sm:text-[7px]">
                      {tier.amountPepe.toLocaleString()} PEPE
                      <Coins aria-hidden="true" size={6} className="text-amber-200" />
                    </span>
                  </li>
                ))}
              </ul>
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
              <section aria-labelledby="weekly-podium-title" className="mt-1">
                <h3 id="weekly-podium-title" className="sr-only">Weekly podium</h3>
                <div className="relative isolate mx-auto aspect-[3.2] min-h-[140px] w-full max-w-[980px]">
                  <Image
                    src="/images/weekly-leaderboard-podium-wide.png"
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(max-width: 768px) 100vw, 980px"
                    className="pointer-events-none select-none object-fill drop-shadow-[0_12px_20px_rgba(0,0,0,0.3)]"
                  />
                  <ol aria-label="Top three weekly players" className="absolute inset-0">
                    {leaderboard.slice(0, 3).map((player) => {
                      const placeLabel = player.rank === 1 ? '1st place' : player.rank === 2 ? '2nd place' : '3rd place'
                      return (
                        <li key={`podium-${player.rank}`} className={podiumCardStyle(player.rank, player.isCurrentUser)}>
                          <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
                            <PlayerAvatar player={player} compact />
                            {player.isCurrentUser && <span className="rounded-sm border border-cyan-100/25 bg-cyan-950/85 px-1 text-[6px] font-extrabold text-cyan-50">You</span>}
                          </div>
                          <span className="w-full text-left font-mono text-[6px] font-extrabold text-white/70 sm:text-[8px]">№{player.rank}</span>
                          <span className="mt-0.5 block text-[6px] font-extrabold uppercase tracking-wide text-white/75 sm:text-[8px]">{placeLabel}</span>
                          <p className="max-w-full truncate text-[8px] font-extrabold text-white sm:text-[10px]">{player.displayName}</p>
                          <p className="whitespace-nowrap font-mono text-[8px] font-black tabular-nums text-white sm:text-[10px]">{player.bestDistanceM.toLocaleString()} <span className="text-[6px] font-bold text-white/70 sm:text-[8px]">m</span></p>
                          <span className="inline-flex max-w-full items-center gap-0.5 font-mono text-[7px] font-extrabold tabular-nums text-white sm:text-[9px]">{player.prizePepe.toLocaleString()} PEPE</span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </section>

              <section aria-labelledby="top-100-title" className="mt-1">
                <header className="mb-1 flex items-center justify-between gap-2">
                  <h3 id="top-100-title" className="text-[9px] font-extrabold text-white sm:text-[11px]">Top 100 weekly players</h3>
                  <label className="flex h-[18px] w-28 items-center gap-1 rounded-full border border-slate-300/20 bg-[#111a2c]/80 px-2 text-slate-200/75 focus-within:border-sky-200/50 focus-within:ring-1 focus-within:ring-sky-200/30 sm:w-40">
                    <Search aria-hidden="true" size={8} className="shrink-0" />
                    <span className="sr-only">Search players</span>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search players"
                      className="min-w-0 flex-1 bg-transparent text-[7px] text-white placeholder:text-slate-300/65 focus:outline-none sm:text-[9px]"
                    />
                  </label>
                </header>

                {filteredPlayers.length > 0 ? (
                  <div role="region" aria-label="Top 100 weekly players" tabIndex={0} className="overflow-x-auto rounded-[7px] border border-sky-100/15 bg-[#0a1424]/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200">
                    <table className="w-full min-w-[340px] border-collapse text-left">
                      <caption className="sr-only">Weekly top 100 ranked players and fixed PEPE prizes</caption>
                      <thead className="bg-[#17243a] text-[6px] font-extrabold uppercase tracking-[0.1em] text-slate-200/80 sm:text-[8px]">
                        <tr>
                          <th scope="col" className="px-2 py-1">Rank</th>
                          <th scope="col" className="px-2 py-1">Player</th>
                          <th scope="col" className="px-2 py-1 text-right">Best result</th>
                          <th scope="col" className="px-2 py-1 text-right">Prize</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100/[0.08]">
                        {filteredPlayers.map((player) => (
                          <tr key={`rank-${player.rank}`} className={player.isCurrentUser ? 'bg-cyan-300/[0.1]' : 'bg-white/[0.012]'}>
                            <th scope="row" className="whitespace-nowrap px-2 py-0.5 font-mono text-[7px] font-extrabold sm:text-[9px]"><span className={`inline-flex min-w-5 justify-center rounded-[3px] border px-1 py-0 ${tableRankStyle(player.rank)}`}>#{String(player.rank).padStart(2, '0')}</span></th>
                            <td className="px-2 py-0.5 text-[8px] font-semibold text-white sm:text-[10px]">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <PlayerAvatar player={player} tiny />
                                <span className="min-w-0 truncate">{player.displayName}</span>
                                {player.isCurrentUser && <span className="rounded-sm border border-cyan-100/20 bg-cyan-300/15 px-1 text-[6px] font-extrabold text-cyan-50">You</span>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-right font-mono text-[7px] font-bold tabular-nums text-white sm:text-[9px]">{player.bestDistanceM.toLocaleString()} m</td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-right font-mono text-[7px] font-extrabold tabular-nums text-white sm:text-[9px]">{player.prizePepe.toLocaleString()} PEPE</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p role="status" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[8px] text-white/75">No players match this search.</p>
                )}
                <p className="mt-1 text-center text-[6px] leading-3 text-white/55 sm:text-[8px]">Awards are paid from the platform&apos;s general PEPE capital. If funds are temporarily unavailable, claims remain pending.</p>
              </section>
            </>
          )}
        </div>
      </section>
    </LocalizedTree>
  )
}
