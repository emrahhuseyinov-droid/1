'use client'

import { LocalizedTree } from '@/components/site-language-provider'

export function AdsLabOfferwallPage({ userId, placementId }: { userId: string; placementId: string }) {
  const offerwallUrl = placementId
    ? `https://adslab.me/${encodeURIComponent(placementId)}/${encodeURIComponent(userId)}`
    : null

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell flex flex-col gap-5">
        <header>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Earn PEPE</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">Offerwall</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500 dark:text-slate-400 sm:text-sm">
            Browse available offers and follow the instructions shown. Verified rewards are released after a one-day review period.
          </p>
        </header>

        <section aria-labelledby="offerwall-open-title" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111a2b]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
            <div>
              <h2 id="offerwall-open-title" className="text-lg font-black tracking-tight">Available offers</h2>
              {offerwallUrl && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Offers are shown below. If they do not load, try opening them in a new tab.</p>}
            </div>
            {offerwallUrl && (
              <a
                href={offerwallUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open offers in a new tab"
                className="inline-flex min-h-10 items-center rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Open offers in a new tab
              </a>
            )}
          </div>
          {offerwallUrl ? (
            <iframe
              title="Offerwall"
              src={offerwallUrl}
              loading="eager"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="block h-[76vh] min-h-[600px] max-h-[900px] w-full border-0 bg-white"
            />
          ) : (
            <p role="alert" className="px-6 py-10 text-center text-sm font-semibold text-rose-700 dark:text-rose-300">
              Offerwall is not configured. Please contact support.
            </p>
          )}
        </section>
      </main>
    </LocalizedTree>
  )
}
