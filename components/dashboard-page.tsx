'use client'

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import type { DashboardOverview } from '@/lib/dashboard-types'
import { DailyRewardCard } from '@/components/daily-reward-card'
import { TokenLogo } from '@/components/token-logo'
import type { WalletCoinSymbol } from '@/lib/wallet-assets'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'

type Props = {
  overview: DashboardOverview
  balance: number
  onNavigate: (section: string) => void
  coin: WalletCoinSymbol
}

function formatRelativeTime(value: string, language: 'en' | 'ru') {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000))
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  if (elapsedSeconds < 60) return formatter.format(-elapsedSeconds, 'second')
  if (elapsedSeconds < 3600) return formatter.format(-Math.floor(elapsedSeconds / 60), 'minute')
  if (elapsedSeconds < 86_400) return formatter.format(-Math.floor(elapsedSeconds / 3600), 'hour')
  return formatter.format(-Math.floor(elapsedSeconds / 86_400), 'day')
}

function formatToken(atomic: number) {
  return (atomic / 100_000_000).toFixed(8)
}

export function DashboardPage({ overview, balance, onNavigate, coin }: Props) {
  const { language } = useSiteLanguage()

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Account overview</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">Welcome back</h1>
        <p className="mt-1 text-xs text-dashboard-muted sm:text-sm">Your signed-in account and retained reward-ledger records.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
        <section aria-label="Off-chain ledger balance" className="relative flex min-h-[340px] flex-col overflow-hidden rounded-[26px] border border-blue-300/20 bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 p-5 text-white shadow-xl shadow-blue-950/20 ring-1 ring-inset ring-white/10 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 size-48 rounded-full border-[26px] border-white/[0.06]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-16 size-52 rounded-full border-[34px] border-blue-300/[0.08]" />
          <div className="relative flex flex-1 flex-col justify-between gap-5">
            <div className="space-y-4">
              <p className="whitespace-nowrap font-mono text-2xl font-black tracking-tight sm:text-4xl">{balance.toFixed(8)} <span className="inline-flex items-center gap-1 text-sm font-bold text-blue-100/70"><TokenLogo symbol={coin} size={16} />{coin}</span></p>
              <p className="max-w-lg border-t border-white/10 pt-3 text-xs leading-5 text-blue-100/75">These are off-chain ledger credits. Valid PEPE withdrawal requests are sent automatically through FaucetPay.</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-blue-100/55">Record type</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-white/90"><Coins size={12} className="text-blue-200" />Internal balance</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-blue-100/55">PEPE payouts</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-100"><Check size={12} />Enabled</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => onNavigate('Withdraw')} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-2 py-2.5 text-[10px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:text-xs"><ArrowDownToLine size={14} />Payout status</button>
                <button type="button" onClick={() => onNavigate('Swap')} className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-2 py-2.5 text-[10px] font-extrabold text-blue-800 transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:text-xs"><ArrowLeftRight size={14} />TOKEN EXCHANGE</button>
              </div>
            </div>
          </div>
        </section>

        <DailyRewardCard dailyBonus={overview.dailyBonus} />
      </div>

      <section aria-label="Account shortcuts" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onNavigate('View Ads')} className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-dashboard-outline bg-dashboard-surface p-4 text-left shadow-sm shadow-black/5 transition duration-200 hover:-translate-y-0.5 hover:border-dashboard-accent/35 hover:bg-dashboard-surface-raised hover:shadow-lg hover:shadow-blue-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><ArrowUpRight size={17} /></span><span><span className="block text-xs font-extrabold">PTC Ads</span><span className="mt-0.5 block text-[10px] text-dashboard-muted">Publisher ad inventory</span></span></span><ArrowRight size={15} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
        </button>
        <button type="button" onClick={() => onNavigate('Referrals')} className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-dashboard-outline bg-dashboard-surface p-4 text-left shadow-sm shadow-black/5 transition duration-200 hover:-translate-y-0.5 hover:border-dashboard-accent/35 hover:bg-dashboard-surface-raised hover:shadow-lg hover:shadow-blue-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Wallet size={17} /></span><span><span className="block text-xs font-extrabold">Referral program</span><span className="mt-0.5 block text-[10px] text-dashboard-muted">Review retained records</span></span></span><ArrowRight size={15} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
        </button>
      </section>

      <section aria-labelledby="activity-title" className="overflow-hidden rounded-[26px] border border-dashboard-outline bg-dashboard-surface shadow-lg shadow-black/5">
        <header className="flex items-center justify-between border-b border-dashboard-outline bg-dashboard-surface-raised/70 px-4 py-4 sm:px-5">
          <div><h2 id="activity-title" className="text-sm font-extrabold">Ledger activity</h2><p className="mt-0.5 text-[10px] text-dashboard-muted">Existing entries remain attached to this account</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><CalendarDays size={11} />Recent activity</span>
        </header>
        {overview.recentActivity.length > 0 ? <ul className="divide-y divide-slate-100 px-4 dark:divide-slate-800 sm:px-5">
          {overview.recentActivity.map((activity) => {
            const isDebit = activity.amountAtomic < 0
            return <li key={`${activity.kind}-${activity.id}`} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3"><span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${activity.kind === 'commission' ? 'bg-violet-500/10 text-violet-500' : activity.kind === 'swap' ? 'bg-blue-500/10 text-blue-500' : 'bg-cyan-500/10 text-cyan-500'}`}>{activity.kind === 'commission' ? <Coins size={14} /> : activity.kind === 'swap' ? <ArrowLeftRight size={14} /> : <Check size={14} />}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{activity.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{formatRelativeTime(activity.createdAt, language)}</p></div></div>
              <p className={`shrink-0 text-right font-mono text-xs font-extrabold ${isDebit ? 'text-rose-500' : 'text-blue-500'}`}><span>{isDebit ? '−' : '+'}{formatToken(Math.abs(activity.amountAtomic))}</span> <span className="inline-flex items-center gap-1 text-[9px] text-slate-400"><TokenLogo symbol={activity.tokenSymbol} size={10} />{activity.tokenSymbol}</span></p>
            </li>
          })}
        </ul> : <div className="flex flex-col items-center px-5 py-8 text-center"><span className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Clock3 size={20} /></span><p className="mt-3 text-xs font-bold">No recorded activity</p><p className="mt-1 max-w-xs text-[10px] leading-relaxed text-dashboard-muted">Daily Bonus and eligible View Ads tasks can add internal HOMERO credits. One-way HOMERO to PEPE swaps are available; valid PEPE withdrawals are sent automatically.</p><button type="button" onClick={() => onNavigate('View Ads')} className="mt-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-500 hover:text-blue-400">View publisher ads <ArrowRight size={12} /></button></div>}
      </section>

      <footer className="mx-auto flex w-fit max-w-full items-center justify-center gap-2 rounded-full border border-dashboard-outline bg-dashboard-surface px-4 py-2 text-center text-[9px] text-dashboard-muted shadow-sm shadow-black/5"><ShieldCheck size={12} className="shrink-0 text-dashboard-accent" /><span>Ledger values are off-chain. HOMERO to PEPE swaps are available internally; valid PEPE withdrawals are sent automatically through FaucetPay.</span></footer>
    </main>
    </LocalizedTree>
  )
}
