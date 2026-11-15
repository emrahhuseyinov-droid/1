'use client'

import { useState } from 'react'
import { ChartNoAxesColumnIncreasing, CircleCheck, Coins, Link2, Sparkles } from 'lucide-react'
import { AdsLabShortlinksTaskList, type ShortlinkTaskSummary } from '@/components/adslab-shortlinks-task-list'
import { useSiteLanguage } from '@/components/site-language-provider'
import { formatTokenAtomic } from '@/lib/pepe-amount'

const initialSummary: ShortlinkTaskSummary = {
  availableLinks: 0,
  todayClicks: 0,
  todayEarningsAtomic: '0',
  totalEarningsAtomic: '0',
}

export function ShortlinksPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [summary, setSummary] = useState(initialSummary)

  return (
    <main id="top" className="dashboard-page-shell space-y-4 sm:space-y-5">
      <header className="cartoon-hero relative isolate overflow-hidden rounded-[32px] border-2 border-white/30 px-4 py-5 text-white shadow-xl sm:px-6 sm:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span aria-hidden="true" className="flex size-14 shrink-0 rotate-[-4deg] items-center justify-center rounded-[22px] border-2 border-white/60 bg-[#8de8ff] text-[#19244a] shadow-lg shadow-indigo-950/25"><Link2 size={25} /></span>
          <div className="min-w-0">
            <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">Shortlinks</h1>
            <p className="mt-1 text-xs leading-5 text-white/85">{isRussian ? 'Переходите по ссылкам и получайте PEPE за подтверждённые задания.' : 'Visit short links and earn PEPE for verified tasks.'}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[9px] font-extrabold text-white shadow-sm backdrop-blur"><Sparkles size={12} />{isRussian ? 'Открывай · Выполняй · Зарабатывай' : 'Open · complete · earn'}</span>
          </div>
        </div>
      </header>

      <section aria-label={isRussian ? 'Статистика коротких ссылок' : 'Shortlink statistics'} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[26px] border-2 border-cyan-300/25 bg-gradient-to-br from-[#1c3155] to-[#17213e] p-4 shadow-lg shadow-indigo-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-200"><Link2 size={19} /></span>
            <div className="min-w-0"><h2 className="text-[11px] font-bold text-white/75">{isRussian ? 'Доступно ссылок' : 'Available links'}</h2><p className="mt-1 text-2xl font-black tracking-tight text-white">{summary.availableLinks.toLocaleString(isRussian ? 'ru-RU' : 'en-US')}</p></div>
          </div>
          <p className="mt-3 text-[10px] text-white/60">{isRussian ? 'Можно открыть сейчас' : 'Ready to open now'}</p>
        </article>

        <article className="rounded-[26px] border-2 border-violet-300/25 bg-gradient-to-br from-[#30294f] to-[#201d3b] p-4 shadow-lg shadow-indigo-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200/20 bg-violet-300/10 text-violet-200"><CircleCheck size={19} /></span>
            <div className="min-w-0"><h2 className="text-[11px] font-bold text-white/75">{isRussian ? 'Завершено сегодня' : 'Completed today'}</h2><p className="mt-1 text-2xl font-black tracking-tight text-white">{summary.todayClicks.toLocaleString(isRussian ? 'ru-RU' : 'en-US')}</p></div>
          </div>
          <p className="mt-3 text-[10px] text-white/60">{isRussian ? 'Подтверждённые задания' : 'Verified tasks'}</p>
        </article>

        <article className="rounded-[26px] border-2 border-amber-200/25 bg-gradient-to-br from-[#3b3348] to-[#25213a] p-4 shadow-lg shadow-indigo-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-amber-100"><Coins size={19} /></span>
            <div className="min-w-0"><h2 className="text-[11px] font-bold text-white/75">{isRussian ? 'Заработано сегодня' : 'Earned today'}</h2><p className="mt-1 truncate font-mono text-lg font-black tracking-tight text-white">{formatTokenAtomic(summary.todayEarningsAtomic)} <span className="text-xs">PEPE</span></p></div>
          </div>
          <p className="mt-3 text-[10px] text-white/60">{isRussian ? 'За подтверждённые короткие ссылки' : 'From verified shortlinks'}</p>
        </article>

        <article className="rounded-[26px] border-2 border-indigo-200/25 bg-gradient-to-br from-[#302b55] to-[#201d3d] p-4 shadow-lg shadow-indigo-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-200/20 bg-indigo-300/10 text-indigo-100"><ChartNoAxesColumnIncreasing size={19} /></span>
            <div className="min-w-0"><h2 className="text-[11px] font-bold text-white/75">{isRussian ? 'Всего заработано' : 'Total earned'}</h2><p className="mt-1 truncate font-mono text-lg font-black tracking-tight text-white">{formatTokenAtomic(summary.totalEarningsAtomic)} <span className="text-xs">PEPE</span></p></div>
          </div>
          <p className="mt-3 text-[10px] text-white/60">{isRussian ? 'За всё время' : 'All time'}</p>
        </article>
      </section>

      <section aria-label={isRussian ? 'Доступные Shortlinks' : 'Available Shortlinks'} className="cartoon-panel overflow-hidden rounded-[32px] border-2 border-dashboard-outline bg-[#171f40] shadow-xl shadow-indigo-950/30">
        <header className="border-b-2 border-white/10 bg-gradient-to-r from-[#252f5b] to-[#20294e] px-4 py-4 sm:px-5">
          <h2 className="text-sm font-extrabold">{isRussian ? 'Доступные ссылки' : 'Available links'}</h2>
          <p className="mt-0.5 text-[10px] text-dashboard-muted">{isRussian ? 'Выберите ссылку и выполните задание.' : 'Choose a link and complete the task.'}</p>
        </header>
        <div className="p-3 sm:p-4">
          <ul aria-label="Shortlinks" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AdsLabShortlinksTaskList onSummaryChange={setSummary} />
          </ul>
        </div>
      </section>
    </main>
  )
}
