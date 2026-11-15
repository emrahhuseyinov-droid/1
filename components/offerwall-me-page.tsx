'use client'

import { Layers, ShieldCheck, Sparkles } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'

type OfferwallMePageProps = {
  guestProfileId: string
  iframeUrlTemplate: string
}

function buildIframeUrl(template: string, guestProfileId: string) {
  if (!template.trim()) return null

  const hasSubIdPlaceholder = /\{\{?\s*subId\s*\}?\}/i.test(template)
  const urlWithSubId = template.trim().replace(/\{\{?\s*subId\s*\}?\}/gi, encodeURIComponent(guestProfileId))

  try {
    const url = new URL(urlWithSubId)
    const isOfferwallHost = url.hostname === 'offerwall.me' || url.hostname.endsWith('.offerwall.me')
    if (url.protocol !== 'https:' || !isOfferwallHost || url.username || url.password) return null
    if (!hasSubIdPlaceholder) url.searchParams.set('subId', guestProfileId)
    return url.toString()
  } catch {
    return null
  }
}

export function OfferwallMePage({ guestProfileId, iframeUrlTemplate }: OfferwallMePageProps) {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const iframeUrl = buildIframeUrl(iframeUrlTemplate, guestProfileId)

  return (
    <main id="top" className="dashboard-page-shell flex flex-col gap-4 sm:gap-5">
      <header className="cartoon-hero relative isolate overflow-hidden rounded-[32px] border-2 border-white/30 px-4 py-5 text-white shadow-xl sm:px-6 sm:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span aria-hidden="true" className="flex size-14 shrink-0 rotate-[-4deg] items-center justify-center rounded-[22px] border-2 border-white/60 bg-[#ffd166] text-[#29204e] shadow-lg shadow-indigo-950/25"><Layers size={25} /></span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100">{isRussian ? 'партнёрские задания' : 'partner tasks'}</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">Offerwall.me</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/85">{isRussian ? 'Выполняйте предложения, PTC и короткие ссылки. Проверенные задания автоматически начисляют HOMERO.' : 'Complete offers, PTC tasks, and shortlinks. Verified completions are credited automatically in HOMERO.'}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[9px] font-extrabold text-white shadow-sm backdrop-blur"><Sparkles size={12} />{isRussian ? 'Предложения · PTC · короткие ссылки' : 'Offers · PTC · shortlinks'}</span>
          </div>
        </div>
      </header>

      {iframeUrl ? (
        <section aria-label={isRussian ? 'Предложения Offerwall.me' : 'Offerwall.me offers'} className="cartoon-panel overflow-hidden rounded-[28px] border-2 border-dashboard-outline bg-[#171f40] shadow-xl shadow-indigo-950/30">
          <header className="flex items-center gap-2 border-b-2 border-white/10 bg-gradient-to-r from-[#252f5b] to-[#20294e] px-4 py-3.5 sm:px-5">
            <ShieldCheck aria-hidden="true" size={16} className="text-emerald-200" />
            <p className="text-[10px] font-extrabold text-white/90">{isRussian ? 'Вознаграждение зачисляется после проверки провайдером.' : 'Rewards are credited after provider verification.'}</p>
          </header>
          <iframe
            title={isRussian ? 'Offerwall.me — партнёрские задания' : 'Offerwall.me partner tasks'}
            src={iframeUrl}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[72vh] min-h-[620px] w-full border-0 bg-white"
          />
        </section>
      ) : (
        <section role="status" className="cartoon-panel rounded-[28px] border-2 border-dashboard-outline bg-[#171f40] p-5 text-sm text-dashboard-muted shadow-xl shadow-indigo-950/30 sm:p-7">
          <h2 className="font-extrabold text-white">{isRussian ? 'Предложения скоро появятся' : 'Offers are not available yet'}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6">{isRussian ? 'Offerwall.me пока не настроен. Возвращайтесь позже.' : 'Offerwall.me has not been configured yet. Please check back later.'}</p>
        </section>
      )}
    </main>
  )
}
