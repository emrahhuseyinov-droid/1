'use client'

import { useState } from 'react'
import {
  BarChart3,
  Clock3,
  Coins,
  Filter,
  MousePointer2,
  Search,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import { AdsLabBanner } from '@/components/adslab-banner'
import { AdsLabPtcTaskList, type PtcTaskSummary } from '@/components/adslab-ptc-task-list'
import { YoutubeAdsPage } from '@/components/youtube-ads-page'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'

type TaskSort = 'reward' | 'duration'

function compactAtomic(value: string) {
  const [whole, fraction = ''] = formatTokenAtomic(value).split('.')
  const trimmedFraction = fraction.replace(/0+$/, '')
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}

function formatEarnings(earnings: PtcTaskSummary['todayEarnings'], language: 'en' | 'ru') {
  const populated = (['PEPE', 'HOMERO'] as const)
    .filter((symbol) => BigInt(earnings[symbol]) !== 0n)
    .map((symbol) => {
      const amount = compactAtomic(earnings[symbol])
      return `${language === 'ru' ? amount.replace('.', ',') : amount} ${symbol}`
    })

  return populated.length > 0 ? populated.join(' · ') : '0 PEPE'
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClass,
  cardClass,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  iconClass: string
  cardClass: string
}) {
  return (
    <article className={`cartoon-stat-card flex min-h-[120px] items-start gap-3 rounded-[26px] border-2 p-4 ${cardClass}`}>
      <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-white/10 shadow-md ${iconClass}`}><Icon size={18} /></span>
      <div className="min-w-0">
        <h2 className="text-[11px] font-bold text-dashboard-muted">{label}</h2>
        <p className="mt-1 truncate font-mono text-lg font-black tracking-tight">{value}</p>
        <p className="mt-0.5 truncate text-[10px] text-dashboard-muted">{detail}</p>
      </div>
    </article>
  )
}

export function ViewAdsPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [searchQuery, setSearchQuery] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [sortBy, setSortBy] = useState<TaskSort>('reward')
  const [summary, setSummary] = useState<PtcTaskSummary | null>(null)

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell space-y-4 sm:space-y-5">
        <header className="cartoon-hero relative isolate overflow-hidden rounded-[32px] border-2 border-white/30 px-4 py-5 text-white shadow-xl sm:px-6 sm:py-6 xl:flex xl:items-center xl:justify-between xl:gap-5">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span aria-hidden="true" className="flex size-14 shrink-0 rotate-[-4deg] items-center justify-center rounded-[22px] border-2 border-white/60 bg-[#ffd166] text-[#29204e] shadow-lg shadow-indigo-950/25"><Tv size={25} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100">{isRussian ? 'задания партнёров' : 'publisher tasks'}</p>
              <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">{isRussian ? 'PTC-реклама' : 'PTC Ads'}</h1>
              <p className="mt-1 text-xs leading-5 text-white/85">{isRussian ? 'Выполняйте задания рекламодателей и получайте PEPE.' : 'Complete advertiser tasks and earn PEPE.'}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[9px] font-extrabold text-white shadow-sm backdrop-blur"><Sparkles size={12} />{isRussian ? 'Смотри · выполняй · зарабатывай' : 'Watch · complete · earn'}</span>
            </div>
          </div>
          <div className="relative mt-4 flex w-full justify-center xl:mt-0 xl:w-[320px] xl:flex-none">
            <AdsLabBanner
              id="unit-4x13z1u8z"
              container="adslab-banner-unit-4x13z1u8z"
              alignment="center"
            />
          </div>
        </header>

        <YoutubeAdsPage />

        <section aria-label={isRussian ? 'Статистика PTC-рекламы' : 'PTC Ads overview'} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={MousePointer2}
            label={isRussian ? 'Доступно реклам' : 'Available Ads'}
            value={summary ? String(summary.availableAds) : '—'}
            detail={isRussian ? 'Можно открыть сейчас' : 'Ready to view'}
            iconClass="bg-cyan-300/15 text-cyan-100"
            cardClass="border-cyan-200/30 bg-gradient-to-br from-[#173452] to-[#182146]"
          />
          <MetricCard
            icon={Clock3}
            label={isRussian ? 'Клики сегодня' : 'Today’s Clicks'}
            value={summary ? String(summary.todayClicks) : '—'}
            detail={isRussian ? 'Завершённые рекламные задания' : 'Completed ad tasks'}
            iconClass="bg-rose-300/15 text-rose-100"
            cardClass="border-rose-200/30 bg-gradient-to-br from-[#3a2448] to-[#202044]"
          />
          <MetricCard
            icon={Coins}
            label={isRussian ? 'Заработано сегодня' : 'Today’s Earnings'}
            value={summary ? formatEarnings(summary.todayEarnings, language) : '—'}
            detail={isRussian ? 'Начислено за рекламу' : 'From completed ad views'}
            iconClass="bg-amber-300/15 text-amber-100"
            cardClass="border-amber-200/30 bg-gradient-to-br from-[#3c3542] to-[#252344]"
          />
          <MetricCard
            icon={BarChart3}
            label={isRussian ? 'Всего заработано' : 'Total Earnings'}
            value={summary ? formatEarnings(summary.totalEarnings, language) : '—'}
            detail={isRussian ? 'За всё время' : 'All time'}
            iconClass="bg-violet-300/15 text-violet-100"
            cardClass="border-violet-200/30 bg-gradient-to-br from-[#322653] to-[#202044]"
          />
        </section>

        <section aria-label={isRussian ? 'Доступные PTC-задания' : 'Available PTC tasks'} className="cartoon-panel overflow-hidden rounded-[32px] border-2 border-dashboard-outline bg-[#171f40] shadow-xl shadow-indigo-950/30">
          <header className="border-b-2 border-white/10 bg-gradient-to-r from-[#252f5b] to-[#20294e] px-4 py-4 sm:px-5">
            <h2 className="text-sm font-extrabold">{isRussian ? 'Рекламные задания PTC' : 'PTC ad tasks'}</h2>
            <p className="mt-0.5 text-[10px] text-dashboard-muted">{isRussian ? 'Найдите задание и отсортируйте по награде или времени.' : 'Find a task and sort by reward or duration.'}</p>
          </header>
          <div className="flex flex-col gap-2 border-b-2 border-white/10 bg-[#1c2548] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{isRussian ? 'Поиск рекламных заданий' : 'Search ad tasks'}</span>
              <Search aria-hidden="true" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={isRussian ? 'Поиск рекламных заданий' : 'Search ads'}
                className="min-h-10 w-full rounded-2xl border-2 border-white/10 bg-[#121a39] px-3 pl-9 text-[11px] outline-none transition placeholder:text-dashboard-muted focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={availableOnly}
                onClick={() => setAvailableOnly((current) => !current)}
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent ${availableOnly ? 'border-dashboard-accent/40 bg-dashboard-accent/10 text-dashboard-accent' : 'border-dashboard-outline bg-dashboard-surface text-dashboard-muted hover:text-foreground'}`}
              >
                <Filter size={12} />{isRussian ? 'Доступные' : 'Available'}
              </button>
              <label>
                <span className="sr-only">{isRussian ? 'Сортировка заданий' : 'Sort tasks'}</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as TaskSort)}
                  className="min-h-10 max-w-[158px] rounded-2xl border-2 border-white/10 bg-[#121a39] px-3 text-[10px] font-bold text-foreground outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                >
                  <option value="reward">{isRussian ? 'Сначала награда' : 'Highest reward'}</option>
                  <option value="duration">{isRussian ? 'Сначала быстрее' : 'Shortest duration'}</option>
                </select>
              </label>
            </div>
          </div>
          <div className="p-3 sm:p-4">
            <ul aria-label={isRussian ? 'PTC-задания' : 'PTC tasks'} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AdsLabPtcTaskList
                onSummaryChange={setSummary}
                searchQuery={searchQuery}
                availableOnly={availableOnly}
                sortBy={sortBy}
              />
            </ul>
          </div>
        </section>
      </main>
    </LocalizedTree>
  )
}
