'use client'

import Link from 'next/link'
import { ArrowLeftRight, ArrowRight, Check, Gift, Gamepad2, Megaphone, ShieldCheck, Wallet } from 'lucide-react'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'

const rules = [
  {
    title: 'Daily bonuses and ad tasks',
    description: 'Earn platform rewards from daily bonuses, View Ads, PTC, Shortlinks, and eligible sponsored tasks.',
    icon: Gift,
    tone: 'text-amber-200 bg-amber-300/10 ring-amber-200/15',
    points: [
      'Claim one Daily Bonus per UTC calendar day. HOMERO rewards follow the seven-day schedule shown in your account; missing a UTC day resets the streak.',
      'A successful Daily Bonus also adds up to 1 Pepe Runner energy. Energy cannot exceed 20.00, so the amount credited may be lower when you are close to the cap or already full.',
      'Read each View Ads task before starting. Keep the task window open and complete its timer; the reward is credited only after the server confirms completion.',
      'Verified PTC tasks add +0.20 Pepe Runner energy; verified Shortlinks add +0.35 Pepe Runner energy, subject to the storage and daily energy caps.',
      'Each task shows its reward token, amount, and requirements before you start. Advertiser-created PTC and YouTube campaign rewards are credited in PEPE after verification.'
      'The Wheel of Fortune shows when a free spin is available and the reward before you collect it.',
      'Do not use bots, scripts, fake engagement, or duplicate accounts to claim rewards or referrals. Tasks and rewards may change; earnings are not guaranteed.',
    ],
  },
  {
    title: 'Earner and advertiser workspaces',
    description: 'Use one pepe.casa login to complete tasks or manage your own advertising campaigns.',
    icon: ArrowLeftRight,
    tone: 'text-indigo-200 bg-indigo-300/10 ring-indigo-200/15',
    points: [
      'Switch between Earner and Advertiser workspaces from the account navigation. Switching workspaces does not create a second login.',
      'Fund the Advertiser wallet through the supported FaucetPay top-up flow or transfer PEPE from the Earner wallet. Review your available balance and total campaign cost before launch.',
      'Create a PTC or YouTube campaign. PTC campaigns are listed with View Ads tasks; YouTube campaigns are listed in YouTube tasks. Performers see the reward, token, viewing time, and requirements before starting.',
      'Pause or resume active campaigns. Cancelling returns the unused task budget, including its commission, and any eligible unused promotion amount. Completed tasks are not refunded.',
    ],
  },
  {
    title: 'Manual CAPTCHA faucet',
    description: 'Complete a CAPTCHA to unlock the current PEPE reward after server-side verification.',
    icon: ShieldCheck,
    tone: 'text-cyan-200 bg-cyan-300/10 ring-cyan-200/15',
    points: [
      'Start the challenge from Manual Faucet, complete it, then return to claim your PEPE.',
      'Each claim requires a unique CAPTCHA session and is credited only after server-side verification.',
    ],
  },
  {
    title: 'Protect your account',
    description: 'Use your own account and keep its sign-in details private.',
    icon: ShieldCheck,
    tone: 'text-cyan-200 bg-cyan-300/10 ring-cyan-200/15',
    points: [
      'Do not access another person’s account, share credentials, or create duplicate accounts to bypass limits.',
      'Do not manipulate referrals, reward claims, account balances, or platform requests.',
      'Activity that fails verification may not be credited; suspicious activity can be reviewed.',
    ],
  },
  {
    title: 'Play Arcade fairly',
    description: 'Keep the weekly competition meaningful for every player.',
    icon: Gamepad2,
    tone: 'text-cyan-200 bg-cyan-300/10 ring-cyan-200/15',
    points: [
      'Ranked runs are replay-verified before eligible distances count toward the weekly leaderboard.',
      'Casual runs are for play and do not enter the leaderboard.',
      'Use the game controls as intended; do not alter the client, automate play, or exploit bugs to change a score.',
    ],
  },
  {
    title: 'Request a PEPE payout',
    description: 'Eligible PEPE withdrawals are sent through FaucetPay after verification.',
    icon: Wallet,
    tone: 'text-emerald-200 bg-emerald-300/10 ring-emerald-200/15',
    points: [
      'The withdrawal form supports PEPE only and requires a registered, verified FaucetPay account email.',
      'The minimum request is 500 PEPE. The daily limit is 50,000 PEPE and resets at 00:00 UTC.',
      'Pending and paid requests count toward that day’s limit. The requested PEPE is reserved while the transfer is being processed.',
      'If FaucetPay rejects a request, the PEPE is returned to your balance. If the status is pending, do not submit the same withdrawal again; the balance remains reserved to prevent a duplicate transfer.',
    ],
  },
]

export function RulesPage() {
  return (
    <LocalizedTree>
    <main className="cartoon-rules relative isolate min-h-dvh overflow-hidden bg-[#111431] text-white selection:bg-amber-200 selection:text-[#101722]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-48 top-20 size-[520px] rounded-full bg-blue-500/[0.11] blur-[120px]" />
        <div className="absolute -right-48 top-[620px] size-[520px] rounded-full bg-amber-300/[0.07] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.45)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0f18]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:h-[80px] sm:px-8">
          <Link href="/" aria-label="pepe.casa home" className="shrink-0 text-white">
            <PepeCasaLogo size={36} textClassName="font-sans text-base sm:text-xl" />
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher compact />
            <Link href="/#features" className="hidden rounded-full px-3 py-2 text-xs font-bold text-white/60 transition hover:text-white sm:block">Features</Link>
            <Link href="/#faq" className="hidden rounded-full px-3 py-2 text-xs font-bold text-white/60 transition hover:text-white sm:block">FAQ</Link>
            <Link href="/sign-in?next=%2Fdashboard" className="hidden rounded-full px-3 py-2 text-xs font-bold text-white/70 transition hover:text-white sm:inline-flex">Sign in</Link>
            <Link href="/sign-up?next=%2Fdashboard" className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-full bg-amber-300 px-2.5 text-[10px] font-extrabold text-[#111722] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 sm:gap-2 sm:px-4 sm:text-xs">
              <span className="sm:hidden">Join</span>
              <span className="hidden sm:inline">Join pepe.casa</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-white/45 transition hover:text-white/80">← Back to home</Link>
        <section className="cartoon-rules-hero mt-8 overflow-hidden rounded-[32px] border-2 border-violet-200/20 p-6 shadow-2xl shadow-indigo-950/30 sm:p-9 lg:p-11">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[0.06] px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-100">
            <span className="size-1.5 rounded-full bg-emerald-300" /> Platform rules & payout guide
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-black leading-[1.02] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Daily rewards. Ad tasks. Clear rules.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
            Learn how verified tasks, advertiser campaigns, account switching, daily rewards, and real PEPE payouts through FaucetPay work. Check each task&apos;s reward and terms before you begin.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/45">Minimum payout</p>
              <p className="mt-2 font-mono text-xl font-black text-amber-100">500 PEPE</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/45">Daily limit</p>
              <p className="mt-2 font-mono text-xl font-black text-cyan-100">50,000 PEPE</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/45">Payout provider</p>
              <p className="mt-2 text-xl font-black text-white">FaucetPay</p>
            </div>
          </div>
          <p className="mt-4 text-[10px] leading-5 text-white/40">The daily withdrawal limit resets at 00:00 UTC. A registered, verified FaucetPay account is required. Eligible PEPE payout requests are sent automatically and their status is shown in your account.</p>
        </section>

        <section id="rules" aria-labelledby="rules-heading" className="scroll-mt-28 pt-14 sm:pt-16">
          <div className="mb-7">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">Use the platform responsibly</p>
            <h2 id="rules-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">The rules, in plain language</h2>
          </div>
          <div className="grid gap-4">
            {rules.map((rule, index) => {
              const Icon = rule.icon
              return (
                <article key={rule.title} id={rule.title === 'Request a PEPE payout' ? 'payouts' : undefined} className="scroll-mt-28 rounded-[24px] border border-white/[0.08] bg-[#0e1520]/85 p-5 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ${rule.tone}`}><Icon size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                            <h3 className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">{rule.title}</h3>
                      <p className="mt-1.5 text-xs leading-6 text-white/50 sm:text-sm">{rule.description}</p>
                    </div>
                  </div>
                  <ul className="mt-5 flex flex-col gap-3 border-t border-white/[0.06] pt-5">
                    {rule.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-xs leading-6 text-white/65 sm:text-sm">
                        <Check size={15} className="mt-1 shrink-0 text-emerald-300" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="balances-heading" className="mt-5 rounded-[24px] border border-amber-200/15 bg-amber-200/[0.04] p-5 sm:p-7">
          <h2 id="balances-heading" className="text-lg font-extrabold">Balances are not all the same</h2>
          <p className="mt-2 text-xs leading-6 text-white/60 sm:text-sm">
            PEPE, HOMERO, and the Advertiser wallet are tracked separately. The withdrawal form sends PEPE only; HOMERO is an in-platform balance and advertiser campaign funds are reserved for campaigns. If an exchange option is available, its current rate and fee are shown before you confirm.
          </p>
          <p className="mt-3 text-[10px] leading-5 text-white/40">PEPE is a crypto asset, so its market value can change. pepe.casa does not promise a fixed fiat value or guaranteed earnings.</p>
        </section>

        <section className="mt-8 flex flex-col items-start justify-between gap-5 rounded-[24px] border border-white/[0.08] bg-[#101a28] p-5 sm:flex-row sm:items-center sm:p-7">
          <div>
            <h2 className="text-lg font-extrabold">Ready to get started?</h2>
            <p className="mt-1 text-xs leading-6 text-white/50">See available activities and the current terms in your account.</p>
          </div>
          <Link href="/sign-up?next=%2Fdashboard" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-xs font-extrabold text-[#111722] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100">
            Create your account <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>

      <footer className="border-t border-white/[0.06] bg-[#080d14]/80 px-5 py-6 text-center text-[10px] text-white/35 sm:px-8">
        <p>pepe.casa · Platform rules and payout details</p>
      </footer>
    </main>
    </LocalizedTree>
  )
}
