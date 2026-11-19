'use client'

import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { Crown, Medal, RefreshCw, Trophy, UsersRound } from 'lucide-react'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import type { ReferralLeaderboardEntry } from '@/lib/referral-types'

type ReferralLeaderboardResponse = { leaderboard: ReferralLeaderboardEntry[] }

type ReferralLeaderboardPageProps = {
  initialLeaderboard: ReferralLeaderboardEntry[]
}

const prizeAmounts = [200, 100, 50, 25, 20, 15, 10, 5, 5, 5] as const
const podiumRanks = [1, 2, 3] as const

async function fetchReferralLeaderboard(url: string): Promise<ReferralLeaderboardResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as { leaderboard?: ReferralLeaderboardEntry[]; error?: string } | null

  if (!response.ok || !Array.isArray(payload?.leaderboard)) {
    throw new Error(payload?.error ?? 'Could not load the referral leaderboard.')
  }

  return { leaderboard: payload.leaderboard }
}

function rankColors(rank: number) {
  if (rank === 1) {
    return {
      border: 'border-amber-200/45',
      icon: 'border-amber-100/30 bg-amber-200/10 text-amber-100',
      glow: 'bg-amber-300/15',
      text: 'text-amber-100',
      avatar: 'border-amber-100/35 bg-amber-200/15 text-amber-50',
    }
  }
  if (rank === 2) {
    return {
      border: 'border-slate-200/35',
      icon: 'border-slate-100/25 bg-slate-200/10 text-slate-100',
      glow: 'bg-slate-200/10',
      text: 'text-slate-100',
      avatar: 'border-slate-100/30 bg-slate-200/10 text-slate-50',
    }
  }
  if (rank === 3) {
    return {
      border: 'border-orange-200/35',
      icon: 'border-orange-100/25 bg-orange-200/10 text-orange-100',
      glow: 'bg-orange-300/10',
      text: 'text-orange-100',
      avatar: 'border-orange-100/30 bg-orange-200/10 text-orange-50',
    }
  }
  return {
    border: 'border-slate-200/20',
    icon: 'border-slate-200/20 bg-white/[0.04] text-slate-300',
    glow: 'bg-white/[0.03]',
    text: 'text-slate-300',
    avatar: 'border-slate-200/20 bg-white/[0.04] text-slate-200',
  }
}

function podiumOrder(rank: number) {
  if (rank === 1) return 'order-1 sm:order-2 sm:-translate-y-3'
  if (rank === 2) return 'order-2 sm:order-1'
  return 'order-3 sm:order-3'
}

function LeaderboardAvatar({ player, rank, compact = false }: { player: ReferralLeaderboardEntry; rank: number; compact?: boolean }) {
  const colors = rankColors(rank)
  const initials = player.displayName.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? '').join('').toUpperCase() || '?'
  const imageSize = compact ? 36 : 58

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border font-black tracking-wide shadow-inner shadow-black/20 ${compact ? 'size-9 text-[10px]' : 'size-[58px] text-sm'} ${colors.avatar}`}>
      <span aria-hidden="true">{initials}</span>
      <Image
        src={player.avatarSrc}
        alt=""
        aria-hidden="true"
        width={imageSize}
        height={imageSize}
        onError={(event) => event.currentTarget.remove()}
        className="absolute inset-0 size-full rounded-full object-cover"
      />
    </span>
  )
}

export function ReferralLeaderboardPage({ initialLeaderboard }: ReferralLeaderboardPageProps) {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const { data, error, isValidating, mutate } = useSWR<ReferralLeaderboardResponse>(
    '/api/referral-leaderboard',
    fetchReferralLeaderboard,
    {
      fallbackData: { leaderboard: initialLeaderboard },
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 60 * 60 * 1000,
    },
  )
  const leaderboard = (data?.leaderboard ?? initialLeaderboard).slice(0, 10)
  const winners = new Map(leaderboard.map((entry) => [entry.rank, entry]))

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Trophy aria-hidden="true" className="text-amber-300" size={25} />
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                {isRussian ? 'Рейтинг рефералов' : 'Referral leaderboard'}
              </h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-300">
              {isRussian
                ? 'В рейтинге учитываются только подтверждённые участники с успешным начислением реферальной награды.'
                : 'Only verified participants with a successful referral reward credit count toward the ranking.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-800 dark:text-emerald-100">
              <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.8)] dark:bg-emerald-300" />
              {isRussian ? 'Общий рейтинг' : 'All-time ranking'}
            </span>
            <button
              type="button"
              aria-label={isRussian ? 'Обновить рейтинг' : 'Refresh referral leaderboard'}
              title={isRussian ? 'Обновить рейтинг' : 'Refresh leaderboard'}
              onClick={() => void mutate()}
              disabled={isValidating}
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-wait disabled:opacity-60 dark:border-white/15 dark:bg-[#111a2e] dark:text-white/80 dark:hover:border-cyan-100/40 dark:hover:text-cyan-50"
            >
              <RefreshCw aria-hidden="true" size={15} className={isValidating ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </div>
        </header>

        {error && (
          <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-100/70 px-4 py-3 text-xs font-semibold text-amber-900 dark:bg-amber-300/[0.08] dark:text-amber-100">
            {isRussian ? 'Не удалось обновить рейтинг. Показаны последние доступные данные.' : 'Could not refresh the ranking. Showing the latest available standings.'}
          </p>
        )}

        <section aria-label={isRussian ? 'Победители и призы' : 'Winners and prizes'} className="relative isolate overflow-hidden rounded-[30px] border border-violet-200/20 bg-gradient-to-br from-[#151f39] via-[#111a2f] to-[#1e1737] p-4 text-white shadow-[0_26px_78px_rgba(7,12,30,0.38)] sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-violet-300/[0.12] blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[24%] size-64 rounded-full bg-cyan-300/[0.08] blur-3xl" />
          <div className="relative z-10 mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-100/70">{isRussian ? 'Призы за результат' : 'Rewards for the top referrers'}</p>
              <h2 className="mt-1 text-lg font-black tracking-tight sm:text-xl">{isRussian ? 'Тройка лидеров' : 'Top three winners'}</h2>
            </div>
            <span className="text-xs font-medium text-white/55">{isRussian ? 'Места распределяются по числу успешных рефералов' : 'Ranked by successful referrals'}</span>
          </div>

          <ol aria-label={isRussian ? 'Три лучших участника' : 'Top three participants'} className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end sm:gap-4">
            {podiumRanks.map((rank) => {
              const player = winners.get(rank)
              const colors = rankColors(rank)
              const RankIcon = rank === 1 ? Crown : Medal
              const placeLabel = isRussian ? `${rank}-е место` : rank === 1 ? '1st place' : rank === 2 ? '2nd place' : '3rd place'

              return (
                <li key={rank} className={`relative isolate flex min-h-[232px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[26px] border bg-gradient-to-br from-white/[0.08] via-[#151d32] to-[#101729] p-5 text-center shadow-[0_16px_38px_rgba(0,0,0,0.28)] transition duration-300 motion-safe:hover:-translate-y-1 motion-reduce:transition-none sm:rounded-[30px] ${colors.border} ${podiumOrder(rank)} ${rank === 1 ? 'sm:min-h-[252px]' : ''}`}>
                  <div aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-12 size-36 rounded-full blur-3xl ${colors.glow}`} />
                  <div className="relative z-10 flex w-full flex-col items-center">
                    <div className="flex items-center gap-2">
                      <span className={`grid size-10 place-items-center rounded-2xl border font-mono text-sm font-black ${colors.icon}`}>#{rank}</span>
                      <RankIcon aria-hidden="true" className={colors.text} size={19} />
                    </div>
                    <div className="mt-4 flex max-w-full items-center gap-3">
                      {player
                        ? <LeaderboardAvatar player={player} rank={rank} />
                        : <span aria-hidden="true" className={`grid size-[58px] shrink-0 place-items-center rounded-full border ${colors.avatar}`}><UsersRound size={21} /></span>}
                      <div className="min-w-0 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{placeLabel}</p>
                        <p className="mt-1 max-w-full truncate text-base font-extrabold text-white sm:text-lg">
                          {player?.displayName ?? (isRussian ? 'Ожидаем участника' : 'Awaiting a participant')}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 font-mono text-3xl font-black tracking-tight tabular-nums text-white">{player ? player.successfulReferrals.toLocaleString(isRussian ? 'ru-RU' : 'en-US') : '—'}</p>
                    <p className="mt-0.5 text-xs font-semibold text-white/60">{isRussian ? 'успешных рефералов' : 'successful referrals'}</p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-4 py-2">
                      <span className="text-xs font-semibold text-white/60">{isRussian ? 'Приз' : 'Prize'}</span>
                      <span className={`font-mono text-lg font-black tabular-nums ${colors.text}`}>${prizeAmounts[rank - 1]}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <section aria-labelledby="referral-ranking-title" className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111a2b]">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
            <div>
              <h2 id="referral-ranking-title" className="text-base font-black tracking-tight sm:text-lg">{isRussian ? 'Топ-10 участников' : 'Top 10 referral ranking'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isRussian ? 'Список обновляется автоматически каждый час.' : 'Standings refresh automatically every hour.'}
              </p>
            </div>
            <span className="rounded-full border border-violet-200/60 bg-violet-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700 dark:border-violet-300/20 dark:bg-violet-300/[0.08] dark:text-violet-100">
              {leaderboard.length} / 10 {isRussian ? 'мест' : 'places'}
            </span>
          </header>

          {leaderboard.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:bg-slate-950/25 dark:text-slate-500">
                    <th scope="col" className="px-4 py-3.5 sm:px-6">{isRussian ? 'Место' : 'Rank'}</th>
                    <th scope="col" className="px-3 py-3.5">{isRussian ? 'Участник' : 'Participant'}</th>
                    <th scope="col" className="px-3 py-3.5 text-right">{isRussian ? 'Рефералы' : 'Successful referrals'}</th>
                    <th scope="col" className="px-4 py-3.5 text-right sm:px-6">{isRussian ? 'Приз' : 'Prize'}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player) => {
                    const colors = rankColors(player.rank)
                    return (
                      <tr key={player.rank} className="border-t border-slate-100 transition-colors hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-white/[0.025]">
                        <th scope="row" className="px-4 py-3.5 sm:px-6">
                          <span className={`inline-flex min-w-10 items-center justify-center rounded-xl border px-2.5 py-1.5 font-mono text-xs font-black tabular-nums ${colors.icon}`}>#{player.rank}</span>
                        </th>
                        <td className="px-3 py-3.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <LeaderboardAvatar player={player} rank={player.rank} compact />
                            <span className="max-w-[240px] truncate text-sm font-bold text-slate-800 dark:text-slate-100">{player.displayName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-sm font-black tabular-nums text-slate-800 dark:text-white">{player.successfulReferrals.toLocaleString(isRussian ? 'ru-RU' : 'en-US')}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm font-black tabular-nums text-amber-700 dark:text-amber-200 sm:px-6">${prizeAmounts[player.rank - 1]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
              <span aria-hidden="true" className="mb-3 grid size-12 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-500 dark:text-amber-200"><Trophy size={21} /></span>
              <h3 className="text-sm font-black">{isRussian ? 'Рейтинг пока пуст' : 'The leaderboard is ready for its first entry'}</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isRussian ? 'Приглашайте друзей. В рейтинг попадут подтверждённые аккаунты после первого успешного начисления.' : 'Invite friends. Verified accounts appear after their first successful referral reward credit.'}
              </p>
              <Link href="/referrals" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 text-xs font-extrabold text-white shadow-lg shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none motion-reduce:hover:transform-none">
                {isRussian ? 'Открыть рефералов' : 'Open referrals'}
                <Trophy aria-hidden="true" size={14} />
              </Link>
            </div>
          )}
        </section>
      </main>
    </LocalizedTree>
  )
}
