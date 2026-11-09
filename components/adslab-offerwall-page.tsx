'use client'

import { LocalizedTree } from '@/components/site-language-provider'

const ADSLAB_OFFERWALL_TASK_ID = 'task-cTL7EAUq5qkF'

export function AdsLabOfferwallPage({ userId }: { userId: string }) {
  const offerwallUrl = `https://adslab.me/${ADSLAB_OFFERWALL_TASK_ID}/${encodeURIComponent(userId)}`

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell flex flex-col gap-5">
        <header>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Earn PEPE</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">AdsLab Offerwall</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500 dark:text-slate-400 sm:text-sm">
            Browse available offers and follow the instructions shown by AdsLab. Verified rewards are released after the one-day AdsLab hold.
          </p>
        </header>

        <section aria-labelledby="offerwall-open-title" className="rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111a2b]">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-14 text-center sm:py-20">
            <h2 id="offerwall-open-title" className="text-xl font-black tracking-tight">Open AdsLab offers</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              The AdsLab offerwall is not available inside the embedded frame. Open it in a new tab to continue.
            </p>
            <a
              href={offerwallUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open AdsLab in a new tab"
              className="inline-flex min-h-11 items-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              Open AdsLab in a new tab
            </a>
          </div>
        </section>
      </main>
    </LocalizedTree>
  )
}
