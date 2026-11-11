'use client'

import Link from 'next/link'
import { HomepageArcadeScene } from '@/components/homepage-arcade-scene'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'
import { TokenLogo } from '@/components/token-logo'
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Gift,
  Gamepad2,
  MonitorPlay,
  ShieldCheck,
  Trophy,
  UsersRound,
  Wallet,
  Zap,
} from 'lucide-react'

const navigation = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Rules', href: '/rules' },
]

const features = [
  {
    title: 'Verified reward tasks',
    description: 'Choose an offer, check its requirements, and track confirmed rewards in your account.',
    icon: Gift,
    tone: 'text-amber-200 bg-amber-300/10 ring-amber-200/15',
  },
  {
    title: 'Neon Arcade',
    description: 'Pick Ranked or Casual and chase a new high score.',
    icon: Gamepad2,
    tone: 'text-cyan-200 bg-cyan-300/10 ring-cyan-200/15',
  },
  {
    title: 'Weekly leaderboard',
    description: 'Every Ranked run is replay-verified before it appears on the weekly board.',
    icon: Trophy,
    tone: 'text-yellow-100 bg-yellow-300/10 ring-yellow-100/15',
  },
  {
    title: 'PEPE payouts',
    description: 'Request payouts to a verified FaucetPay account. Minimum: 1,000 PEPE; daily limit: 50,000 PEPE.',
    icon: Wallet,
    tone: 'text-blue-200 bg-blue-300/10 ring-blue-200/15',
  },
  {
    title: 'Wallet & exchange',
    description: 'Review PEPE and HOMERO balances, rates, and fees before confirming an exchange.',
    icon: ArrowLeftRight,
    tone: 'text-emerald-200 bg-emerald-300/10 ring-emerald-200/15',
  },
  {
    title: 'Referral program',
    description: 'Share your personal link and follow referral progress from your dashboard.',
    icon: UsersRound,
    tone: 'text-violet-200 bg-violet-300/10 ring-violet-200/15',
  },
  {
    title: 'Daily rewards',
    description: 'Claim your daily HOMERO bonus and follow your streak from your account.',
    icon: CalendarDays,
    tone: 'text-rose-200 bg-rose-300/10 ring-rose-200/15',
  },
  {
    title: 'Payout history',
    description: 'Track each PEPE request and its FaucetPay status from your account.',
    icon: CircleHelp,
    tone: 'text-indigo-200 bg-indigo-300/10 ring-indigo-200/15',
  },
]

const steps = [
  {
    title: 'Create your account',
    description: 'Complete a quick registration on pepe.casa to unlock your dashboard, tasks, and reward tracking.',
    icon: ShieldCheck,
  },
  {
    title: 'Choose an activity',
    description: 'Earn HOMERO through daily bonuses, complete tasks, or start Arcade runs.',
    icon: Zap,
  },
  {
    title: 'Earn rewards',
    description: 'Track instant reward credits in your profile and exchange HOMERO for PEPE on our exchange.',
    icon: Gift,
  },
  {
    title: 'Withdraw your PEPE',
    description: 'Have at least 1,000 PEPE? Add your FaucetPay account and request a payout instantly!',
    icon: Wallet,
  },
]

type FAQKind = 'payouts' | 'balances' | 'rewards' | 'leaderboard'

const faqs: { kind: FAQKind; question: string }[] = [
  { kind: 'payouts', question: 'Does pepe.casa pay PEPE?' },
  { kind: 'balances', question: 'What is the difference between PEPE and HOMERO?' },
  { kind: 'rewards', question: 'Are rewards guaranteed?' },
  { kind: 'leaderboard', question: 'Can I play without joining the leaderboard?' },
]

type LandingPageProps = {
  referralCode?: string
}

function LandingHeader({ signInHref, signUpHref }: { signInHref: string; signUpHref: string }) {
  return (
    <LocalizedTree>
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0f18]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-2 px-3 sm:h-[80px] sm:gap-4 sm:px-8">
        <Link href="/" aria-label="pepe.casa home" className="shrink-0 text-white">
          <PepeCasaLogo size={36} textClassName="font-sans text-lg sm:text-xl" />
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm font-semibold text-white/70 transition-colors hover:text-white">
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher compact />
          <Link href={signInHref} className="rounded-full px-1.5 py-2 text-[11px] font-bold text-white/70 transition hover:text-white sm:px-4 sm:text-sm">
            Sign in
          </Link>
          <Link href={signUpHref} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-amber-300 px-3 text-[11px] font-extrabold text-[#111722] shadow-[0_6px_24px_rgba(250,204,21,0.16)] transition hover:-translate-y-0.5 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 sm:min-h-11 sm:gap-2 sm:px-5 sm:text-sm">
            Get started <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
    </LocalizedTree>
  )
}

function HeroPreview() {
  return (
    <LocalizedTree>
    <div className="relative mx-auto w-full max-w-[590px]">
      <div aria-hidden="true" className="absolute -inset-8 rounded-[42px] bg-blue-500/[0.08] blur-3xl" />
      <div className="cartoon-arcade-frame relative overflow-hidden rounded-[32px] border-2 border-violet-200/20 bg-[#1b2047] p-2.5 shadow-[0_32px_100px_rgba(0,0,0,0.46)] sm:p-3">
        <div className="flex items-center justify-between gap-3 px-2.5 pb-3 pt-1 sm:px-3 sm:pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/15">
              <Gamepad2 size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/40">pepe.casa</p>
              <p className="text-[13px] font-bold text-white/90 sm:text-sm">Your pepe.casa dashboard</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[9px] font-bold text-emerald-200/90">
            <span className="size-1.5 rounded-full bg-emerald-300" /> Personal dashboard
          </span>
        </div>

        <div className="relative aspect-[1.32] overflow-hidden rounded-[21px] border border-white/[0.07] bg-[#080c12] sm:aspect-[1.4] sm:rounded-[24px]">
          <HomepageArcadeScene />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07111a] via-[#07111a]/10 to-[#07111a]/25" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#080c12]/70 px-2.5 py-1.5 backdrop-blur sm:left-4 sm:top-4 sm:px-3">
            <span className="size-1.5 rounded-full bg-amber-300" />
            <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-white/80 sm:text-[9px]">Arcade preview</span>
          </div>
          <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4">
            <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-amber-200">Play · Complete tasks · Track rewards</p>
            <p className="mt-1 text-base font-black tracking-tight text-white sm:text-xl">One home for your progress</p>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/[0.07] px-1 pb-1 pt-3 sm:pt-4">
          {[
            { label: 'TASKS', icon: Gift },
            { label: 'ARCADE', icon: Gamepad2 },
            { label: 'PAYOUTS', icon: Wallet },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-extrabold tracking-[0.1em] text-white/65 sm:gap-2 sm:text-[10px]">
                <Icon size={12} className="text-amber-200/80" aria-hidden="true" /> {item.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </LocalizedTree>
  )
}

function SectionHeading({ id, eyebrow, title, description }: { id?: string; eyebrow?: string; title: string; description: string }) {
  return (
    <LocalizedTree>
      <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
        {eyebrow ? <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">{eyebrow}</p> : null}
        <h2 id={id} className={`${eyebrow ? 'mt-3' : ''} text-balance text-3xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white sm:text-4xl lg:text-[40px]`}>{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-white/65 sm:text-base">{description}</p>
      </div>
    </LocalizedTree>
  )
}

function FAQAnswer({ kind }: { kind: FAQKind }) {
  return (
    <LocalizedTree>
      {kind === 'payouts' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.045] p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100">
              <Wallet size={16} aria-hidden="true" />
            </span>
            <p className="text-[13px] leading-6 text-white/75 sm:text-sm">
              {'Yes, pepe.casa pays PEPE. Approved withdrawal requests are processed through FaucetPay after verification.'}
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/45">{'FaucetPay account'}</dt>
              <dd className="mt-1.5 text-[13px] font-semibold leading-5 text-white/85">{'Registered account required'}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/45">{'Minimum payout'}</dt>
              <dd className="mt-1.5 font-mono text-[14px] font-bold text-amber-100">{'1,000 PEPE'}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/45">{'Daily limit'}</dt>
              <dd className="mt-1.5 font-mono text-[14px] font-bold text-amber-100">{'50,000 PEPE'}</dd>
            </div>
          </dl>
          <p className="text-[12px] leading-5 text-white/50">{'The daily limit resets at 00:00 UTC.'}</p>
        </div>
      ) : kind === 'balances' ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-7 text-white/70">
            {'On pepe.casa, there are two balance types: PEPE and HOMERO. Each serves a different purpose.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200/10 bg-gradient-to-br from-emerald-300/[0.055] to-white/[0.015] p-4">
              <div className="flex items-center gap-2.5">
                <TokenLogo symbol="PEPE" size={22} className="ring-1 ring-emerald-200/40" />
                <p className="text-[13px] font-extrabold text-white">{'PEPE (external cryptocurrency)'}</p>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-white/65">
                {'The main currency for withdrawals through FaucetPay. Platform limits apply.'}
              </p>
            </article>
            <article className="rounded-2xl border border-amber-200/10 bg-gradient-to-br from-amber-300/[0.055] to-white/[0.015] p-4">
              <div className="flex items-center gap-2.5">
                <TokenLogo symbol="HOMERO" size={22} />
                <p className="text-[13px] font-extrabold text-white">{'HOMERO (in-platform token)'}</p>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-white/65">
                {'HOMERO is an in-platform balance earned through daily bonuses, verified ad tasks, and eligible Arcade rewards. It is not an external cryptocurrency; any available exchange rate and fee are shown before confirmation.'}
              </p>
            </article>
          </div>
        </div>
      ) : kind === 'rewards' ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-7 text-white/75">
            {'Rewards are not guaranteed. Each task shows its requirements and reward; credits are added only after successful verification.'}
          </p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/45">{'Rewards are credited for:'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-200/10 bg-cyan-300/[0.035] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-200/10 text-cyan-100">
                <MonitorPlay size={17} aria-hidden="true" />
              </span>
              <p className="text-[13px] font-semibold leading-5 text-white/80">{'Completing verified AdsLab PTC tasks for PEPE rewards.'}</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200/10 bg-amber-300/[0.035] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100">
                <Gift size={17} aria-hidden="true" />
              </span>
              <p className="text-[13px] font-semibold leading-5 text-white/80">{'Claiming the daily HOMERO bonus also adds up to 1 Pepe Runner energy, subject to the energy cap.'}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] leading-7 text-white/75">{'Choose the mode that suits you:'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <article className="rounded-2xl border border-cyan-200/10 bg-cyan-300/[0.035] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-cyan-200/10 text-cyan-100"><Gamepad2 size={16} aria-hidden="true" /></span>
                <h3 className="text-[13px] font-extrabold text-white">{'Casual mode'}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-white/65">{'Play at your own pace. Casual results do not appear on the leaderboard.'}</p>
            </article>
            <article className="rounded-2xl border border-amber-200/10 bg-amber-300/[0.035] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><Trophy size={16} aria-hidden="true" /></span>
                <h3 className="text-[13px] font-extrabold text-white">{'Ranked mode'}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-white/65">{'Ranked results are replay-verified and count toward the weekly leaderboard.'}</p>
            </article>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><Gift size={16} aria-hidden="true" /></span>
            <div>
              <p className="text-sm font-extrabold text-amber-100">{'Fixed weekly PEPE prizes'}</p>
              <p className="mt-1.5 text-sm leading-6 text-white/80">{'The top 100 ranked players receive fixed rewards paid from the platform’s general capital.'}</p>
            </div>
          </div>
        </div>
      )}
    </LocalizedTree>
  )
}

export function LandingPage({ referralCode }: LandingPageProps) {
  const dashboardHref = referralCode
    ? `/dashboard?ref=${encodeURIComponent(referralCode)}`
    : '/dashboard'
  const signUpHref = `/sign-up?next=${encodeURIComponent(dashboardHref)}`
  const signInHref = `/sign-in?next=${encodeURIComponent(dashboardHref)}`

  return (
    <LocalizedTree>
    <main className="cartoon-landing relative isolate min-h-dvh overflow-hidden bg-[#111431] text-white selection:bg-amber-200 selection:text-[#101722]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-48 top-20 size-[520px] rounded-full bg-blue-500/[0.11] blur-[120px]" />
        <div className="absolute -right-48 top-[620px] size-[520px] rounded-full bg-amber-300/[0.07] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.45)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <LandingHeader signInHref={signInHref} signUpHref={signUpHref} />

      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-20 pt-12 sm:gap-12 sm:px-8 sm:pb-24 sm:pt-16 md:grid-cols-[0.92fr_1.08fr] md:gap-10 lg:gap-16 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-[560px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.055] px-4 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/75 shadow-[0_8px_26px_rgba(3,8,30,0.18)] sm:text-[10px]">
            <span className="size-1.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]" />
            Tasks · Arcade · PEPE payouts
          </div>
          <h1 className="mt-6 max-w-[620px] text-balance text-[clamp(2.9rem,6.2vw,4.5rem)] font-extrabold leading-[0.99] tracking-[-0.05em] text-white lg:text-[clamp(3.25rem,3.9vw,4rem)]">
            <span className="block">Play.</span>
            <span className="mt-1 block bg-gradient-to-r from-amber-200 via-yellow-100 to-cyan-200 bg-clip-text text-transparent">Earn PEPE.</span>
          </h1>
          <p className="mt-6 max-w-[29rem] text-base leading-7 text-white/70 sm:text-[17px] sm:leading-8">
            Complete verified tasks, play the neon Arcade, and request PEPE payouts through FaucetPay.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={signUpHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-6 text-sm font-extrabold text-[#111722] shadow-[0_10px_34px_rgba(250,204,21,0.18)] transition hover:-translate-y-0.5 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090e16]">
              Create your account <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="#features" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 px-6 text-sm font-bold text-white/75 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100">
              Explore features <ChevronDown size={15} aria-hidden="true" />
            </a>
          </div>
        </div>

        <HeroPreview />
      </section>

      <section id="features" aria-labelledby="features-title" className="scroll-mt-24 border-y border-white/[0.06] bg-white/[0.018] px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            id="features-title"
            eyebrow="One place for everything"
            title="Everything in one account"
            description="Tasks, Arcade, wallet tools, and PEPE payout tracking — all in one place."
          />
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="group relative min-h-[220px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-[#111a26] to-[#0b111a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-1 hover:border-amber-200/20 hover:shadow-[0_18px_40px_rgba(0,0,0,0.2)] sm:p-6">
                  <div aria-hidden="true" className="absolute -right-10 -top-10 size-28 rounded-full bg-white/[0.025] blur-2xl transition group-hover:bg-white/[0.05]" />
                  <div className="relative flex items-start justify-between gap-4">
                    <span className={`grid size-11 place-items-center rounded-2xl ring-1 ${feature.tone}`}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="relative mt-5 text-[17px] font-extrabold leading-snug tracking-tight text-white">{feature.title}</h3>
                  <p className="relative mt-2 text-[15px] leading-6 text-white/65">{feature.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            id="steps-title"
            title="Four steps to your first payout"
            description="Register, stay active, and claim your PEPE tokens directly on FaucetPay."
          />
          <div className="relative grid gap-4 md:grid-cols-4">
            <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-8 hidden border-t border-dashed border-white/10 md:block" />
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <article key={step.title} className="relative min-h-[220px] rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-[#111a26] to-[#0b111a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-1 hover:border-amber-200/20 sm:p-7">
                  <div className="flex items-center">
                    <span className="grid size-12 place-items-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] text-amber-100">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-6 text-[17px] font-extrabold leading-snug text-white">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-7 text-white/65">{step.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.018] px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            id="faq-title"
            title="Frequently asked questions"
            description="Clear answers about tasks, rewards, Arcade, and PEPE payouts."
          />
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-[22px] border border-white/[0.07] bg-gradient-to-br from-[#121b29] via-[#0e1621] to-[#0b111a] px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition-all duration-300 open:border-amber-200/25 open:shadow-[0_16px_42px_rgba(0,0,0,0.2),0_0_0_1px_rgba(251,191,36,0.04)] sm:px-6 sm:py-5">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold leading-6 text-white marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60 sm:text-base [&::-webkit-details-marker]:hidden">
                  <span className="pr-2">{faq.question}</span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] text-amber-100 transition-colors group-open:border-amber-200/20 group-open:bg-amber-200/[0.08]">
                    <ChevronDown size={16} className="transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>
                <div className="mt-4 border-t border-white/[0.07] pt-4 sm:mt-5 sm:pt-5">
                  <FAQAnswer kind={faq.kind} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative isolate overflow-hidden border-t border-white/[0.07] bg-[#080d14] px-5 py-8 sm:px-8 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-indigo-500/[0.08] to-transparent" />
        <div className="mx-auto grid max-w-7xl gap-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="space-y-3">
            <Link href="/" aria-label="pepe.casa home" className="inline-flex rounded-xl text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              <PepeCasaLogo size={30} textClassName="text-base" />
            </Link>
            <p className="max-w-md text-xs leading-5 text-white/45">Earn PEPE through verified activities. Clear rules, straightforward rewards.</p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-2 sm:justify-end">
            {navigation.map((item) => <Link key={item.href} href={item.href} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[11px] font-semibold text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{item.label}</Link>)}
            <Link href={signInHref} className="rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:bg-amber-200/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Sign in</Link>
          </nav>
          <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] pt-4 text-[10px] text-white/35 sm:col-span-2">
            <span>© pepe.casa</span>
            <Link href="/rules" className="inline-flex items-center gap-1.5 transition hover:text-white/70">Platform rules <CircleHelp size={13} aria-hidden="true" /></Link>
          </div>
        </div>
      </footer>
    </main>
    </LocalizedTree>
  )
}
