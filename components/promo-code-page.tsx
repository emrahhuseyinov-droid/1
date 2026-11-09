'use client'

import { Gift, ShieldCheck } from 'lucide-react'
import type { PromoActivityEligibility, PromoClaim } from '@/lib/promo-types'
import { LocalizedTree } from '@/components/site-language-provider'

export function PromoCodePage({ initialClaims, activity }: { initialClaims: PromoClaim[]; activity: PromoActivityEligibility }) {
  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Account rewards</p>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[28px]"><Gift size={21} className="text-blue-500" />Promo codes</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">New promo-code credits are disabled until funded campaigns are configured.</p>
      </header>

      <section aria-labelledby="promo-eligibility-title" className={`rounded-[26px] border p-5 sm:p-7 ${activity.eligible ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-amber-500/20 bg-amber-500/[0.05]'}`}>
        <span className={`flex size-11 items-center justify-center rounded-2xl ${activity.eligible ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}><ShieldCheck size={21} /></span>
        <h2 id="promo-eligibility-title" className="mt-4 text-sm font-extrabold">{activity.eligible ? 'Verified activity requirement met' : 'Verified activity required'}</h2>
        <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500 dark:text-slate-400">
          {activity.eligible
            ? `A completed View Ads claim was recorded within the last ${activity.windowDays} days${activity.lastActivityAt ? ` (latest ${new Date(activity.lastActivityAt).toLocaleDateString()})` : ''}. Promo redemptions remain paused until funded campaigns are configured.`
            : `Complete at least one verified View Ads task in the previous ${activity.windowDays} days to meet the promo-code activity requirement. Promo redemptions remain paused until funded campaigns are configured.`}
        </p>
      </section>

      {initialClaims.length > 0 && (
        <section aria-labelledby="promo-history-title" className="rounded-[26px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111a2b]">
          <h2 id="promo-history-title" className="text-sm font-extrabold">Previously recorded codes</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {initialClaims.map((claim) => (
              <li key={`${claim.code}-${claim.createdAt}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <span className="font-mono font-bold">{claim.code}</span>
                <span className="text-slate-500 dark:text-slate-400">{new Date(claim.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
    </LocalizedTree>
  )
}
