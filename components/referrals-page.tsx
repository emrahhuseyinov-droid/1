'use client'

import { useEffect, useState } from 'react'
import type { ReferralOverview } from '@/lib/referral-types'
import { LocalizedTree } from '@/components/site-language-provider'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Flame,
  Link2,
  Share2,
  ShieldCheck,
  UsersRound,
  Wallet,
} from 'lucide-react'

type Props = { referralOverview: ReferralOverview }

function formatAtomicAmount(amount: string) {
  const atomicUnitsPerToken = BigInt(100_000_000)
  const atomic = BigInt(amount)
  const whole = atomic / atomicUnitsPerToken
  const fraction = String(atomic % atomicUnitsPerToken).padStart(8, '0')
  return `${whole}.${fraction}`
}

const faqItems = [
  {
    question: 'When are referral rewards credited?',
    answer: 'The site funds a 10% bonus on eligible referral earnings, in the same token. It is not deducted from the referred user’s reward. HOMERO bonuses can be exchanged for PEPE here.'
  },
  {
    question: 'Do I need to register or sign in?',
    answer: 'Yes. Email and password accounts protect the profile. Existing guest records are linked to the account when the original guest cookie is available during sign-in.'
  },
  {
    question: 'How is earning activity checked?',
    answer: 'Eligible activity is verified on the server. A timer, redirect, or client-side click alone is not enough. Valid PEPE payout requests are sent automatically through FaucetPay; on-chain transfers are unavailable.'
  },
]

export function ReferralsPage({ referralOverview }: Props) {
  const [referralLink, setReferralLink] = useState(`/?ref=${referralOverview.referralCode}`)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  useEffect(() => {
    setReferralLink(`${window.location.origin}/?ref=${referralOverview.referralCode}`)
  }, [referralOverview.referralCode])

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setCopyError(true)
      window.setTimeout(() => setCopyError(false), 3000)
    }
  }

  const shareMessage = encodeURIComponent(`Join pepe.casa with my referral link: ${referralLink}`)

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[28px]">
          <UsersRound className="text-blue-500" size={24} /> Referrals
        </h1>
        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-wider text-blue-500">Account referral profile</span>
      </header>

      <section className="relative overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 p-5 text-white shadow-xl shadow-blue-900/15 sm:p-8">
        <div className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full border-[28px] border-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-24 right-28 size-44 rounded-full bg-cyan-300/10 blur-2xl" />
        <div className="relative max-w-xl space-y-4">
          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-50">Referral attribution</span>
          <h2 className="text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl">Share your link.<br />Keep records together.</h2>
          <p className="max-w-lg text-xs font-medium leading-relaxed text-blue-100 sm:text-sm">Eligible referral earnings generate a 10% site-funded bonus in the same token, without reducing the referral&apos;s reward.</p>

          <div className="space-y-3 rounded-2xl border border-white/50 bg-white p-3.5 text-slate-900 shadow-lg sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="referral-link" className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Your referral link</label>
              <span className="rounded-md bg-blue-100 px-2 py-1 text-[8px] font-extrabold uppercase text-blue-700">Signup attribution</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <Link2 className="ml-1 shrink-0 text-slate-400" size={15} />
              <input id="referral-link" type="text" readOnly value={referralLink} aria-label="Personal referral link" className="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-slate-700 outline-none sm:text-xs" />
              <button type="button" onClick={copyReferralLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {copyError && <p role="status" className="text-[10px] font-semibold text-rose-600">Could not copy automatically. Select the link and copy it manually.</p>}

            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Share your referral link</p>
              <div className="grid grid-cols-3 gap-2">
                <a href={`https://twitter.com/intent/tweet?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" aria-label="Share referral link on X" className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"><span className="text-xs font-black">X</span><span className="hidden sm:inline">Share</span><ArrowUpRight size={12} /></a>
                <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join pepe.casa with my referral link')}`} target="_blank" rel="noopener noreferrer" aria-label="Share referral link on Telegram" className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"><span className="text-xs font-black">TG</span><span className="hidden sm:inline">Share</span><ArrowUpRight size={12} /></a>
                <a href={`https://wa.me/?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" aria-label="Share referral link on WhatsApp" className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><span className="text-xs font-black">WA</span><span className="hidden sm:inline">Share</span><ArrowUpRight size={12} /></a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Referral statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {[
          { label: 'Total referrals', icon: UsersRound, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500', value: String(referralOverview.referralCount) },
          { label: 'Rewarded referrals', icon: Flame, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500', value: String(referralOverview.activeReferralCount) },
          { label: 'Bonus events', icon: Wallet, iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-500', value: String(referralOverview.bonusCount) },
          { label: 'Bonus balance', icon: Wallet, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500', value: `${formatAtomicAmount(referralOverview.bonusAtomicByToken.HOMERO)} HOMERO · ${formatAtomicAmount(referralOverview.bonusAtomicByToken.PEPE)} PEPE` },
        ].map(({ label, icon: Icon, iconBg, iconColor, value }) => (
          <article key={label} className="flex min-h-[88px] min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#111a2b] sm:p-4">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}><Icon size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-normal break-words text-[9px] font-extrabold uppercase leading-snug tracking-wide text-slate-400">{label}</p>
              <p className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 break-words font-black leading-tight ${label === 'Bonus balance' ? 'text-[10px] sm:text-xs' : 'text-base'}`}>
                {value}
              </p>
            </div>
          </article>
        ))}
      </section>

      <aside className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 sm:p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={17} />
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm"><strong className="font-extrabold">Active referral program.</strong></p>
      </aside>

      <section className="space-y-3">
        <div className="text-center"><h2 className="text-base font-black sm:text-lg">Referral status</h2><p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 sm:text-sm">The site funds a 10% bonus in the same token for eligible referral earnings.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {[
            { icon: Share2, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500', title: '1. Share your link', text: 'A new account can carry your referral code through sign-up.' },
            { icon: Flame, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500', title: '2. Sign-ups are attributed', text: 'Referral attribution is recorded on the persistent account profile.' },
            { icon: Wallet, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500', title: '3. Earn a 10% bonus', text: 'The platform funds the bonus separately; it does not reduce what your referral earns.' },
          ].map(({ icon: Icon, iconBg, iconColor, title, text }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-[#111a2b] sm:p-6">
              <span className={`mx-auto flex size-11 items-center justify-center rounded-full ${iconBg} ${iconColor}`}><Icon size={20} /></span>
              <h3 className="mt-3 text-xs font-extrabold">{title}</h3>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111a2b] sm:p-6">
        <h2 className="mb-3 text-sm font-black">Frequently asked questions</h2>
        {faqItems.map(({ question, answer }) => (
          <details key={question} className="group rounded-2xl border border-slate-100 p-3.5 transition open:bg-slate-50 dark:border-slate-800 dark:open:bg-slate-900/50 sm:p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <span>{question}</span><ChevronDown size={15} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs">{answer}</p>
          </details>
        ))}
      </section>
    </main>
    </LocalizedTree>
  )
}
