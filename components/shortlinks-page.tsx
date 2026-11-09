'use client'

import { Link2, Sparkles } from 'lucide-react'
import { AdsLabShortlinksTaskList } from '@/components/adslab-shortlinks-task-list'
import { useSiteLanguage } from '@/components/site-language-provider'

export function ShortlinksPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'

  return (
    <main id="top" className="dashboard-page-shell space-y-4 sm:space-y-5">
      <header className="cartoon-hero relative isolate overflow-hidden rounded-[32px] border-2 border-white/30 px-4 py-5 text-white shadow-xl sm:px-6 sm:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span aria-hidden="true" className="flex size-14 shrink-0 rotate-[-4deg] items-center justify-center rounded-[22px] border-2 border-white/60 bg-[#8de8ff] text-[#19244a] shadow-lg shadow-indigo-950/25"><Link2 size={25} /></span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100">AdsLab · {isRussian ? 'короткие ссылки' : 'short links'}</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">Shortlinks</h1>
            <p className="mt-1 text-xs leading-5 text-white/85">{isRussian ? 'Переходите по ссылкам AdsLab и получайте PEPE за подтверждённые задания.' : 'Visit AdsLab links and earn PEPE for verified tasks.'}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[9px] font-extrabold text-white shadow-sm backdrop-blur"><Sparkles size={12} />{isRussian ? 'Открывай · выполняй · зарабатывай' : 'Open · complete · earn'}</span>
          </div>
        </div>
      </header>

      <section aria-label={isRussian ? 'Доступные Shortlinks' : 'Available Shortlinks'} className="cartoon-panel overflow-hidden rounded-[32px] border-2 border-dashboard-outline bg-[#171f40] shadow-xl shadow-indigo-950/30">
        <header className="border-b-2 border-white/10 bg-gradient-to-r from-[#252f5b] to-[#20294e] px-4 py-4 sm:px-5">
          <h2 className="text-sm font-extrabold">{isRussian ? 'Доступные ссылки' : 'Available links'}</h2>
          <p className="mt-0.5 text-[10px] text-dashboard-muted">{isRussian ? 'Выберите ссылку и выполните задание AdsLab.' : 'Choose a link and complete the AdsLab task.'}</p>
        </header>
        <div className="p-3 sm:p-4">
          <ul aria-label="AdsLab Shortlinks" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AdsLabShortlinksTaskList />
          </ul>
        </div>
      </section>
    </main>
  )
}
