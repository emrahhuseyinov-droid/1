'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ReferralOverview } from '@/lib/referral-types'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Gift,
  Link2,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'

type Props = { referralOverview: ReferralOverview }

function formatAtomicAmount(amount: string) {
  const atomicUnitsPerToken = BigInt(100_000_000)
  const atomic = BigInt(amount)
  const whole = atomic / atomicUnitsPerToken
  const fraction = String(atomic % atomicUnitsPerToken).padStart(8, '0')
  return `${whole.toLocaleString()}.${fraction}`
}

function formatRate(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function formatRussianFriendCount(value: number) {
  const lastTwoDigits = value % 100
  const lastDigit = value % 10
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'друзей'
  if (lastDigit === 1) return 'друг'
  if (lastDigit >= 2 && lastDigit <= 4) return 'друга'
  return 'друзей'
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

function ReferralStat({ label, value, note, icon: Icon, tone }: {
  label: string
  value: string
  note: string
  icon: typeof UsersRound
  tone: string
}) {
  return (
    <article className="group flex min-w-0 flex-col justify-between rounded-2xl border border-dashboard-outline bg-dashboard-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-dashboard-accent/35 hover:bg-dashboard-surface-raised sm:min-h-[148px] sm:p-5 motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold leading-5 text-white/60 sm:text-xs">{label}</p>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon aria-hidden="true" size={16} /></span>
      </div>
      <div className="mt-5 min-w-0">
        <p className="truncate text-[27px] font-semibold leading-none tracking-[-0.055em] text-white sm:text-[32px]">{value}</p>
        <p className="mt-2 text-[10px] leading-4 text-dashboard-muted">{note}</p>
      </div>
    </article>
  )
}

export function ReferralsPage({ referralOverview }: Props) {
  const { language } = useSiteLanguage()
  const [referralLink, setReferralLink] = useState(`/?ref=${referralOverview.referralCode}`)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [shareNotice, setShareNotice] = useState('')

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

  const inviteTitle = language === 'ru' ? 'Присоединяйтесь к pepe.casa' : 'Join pepe.casa'
  const inviteText = language === 'ru' ? 'Присоединяйтесь к pepe.casa по моей реферальной ссылке' : 'Join pepe.casa with my referral link'

  async function inviteFriends() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: inviteTitle,
          text: inviteText,
          url: referralLink,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(referralLink)
      setShareNotice('Referral link copied. Share it with your friends.')
    } catch {
      setShareNotice('Copy the referral link below to invite your friends.')
    }
    window.setTimeout(() => setShareNotice(''), 3000)
  }

  const shareMessage = encodeURIComponent(`${inviteText}: ${referralLink}`)
  const rewardRate = referralOverview.referralCount > 0
    ? Math.min(100, (referralOverview.activeReferralCount / referralOverview.referralCount) * 100)
    : 0
  const stats = [
    { label: 'People you invited', value: referralOverview.referralCount.toLocaleString(), icon: UsersRound, note: 'Joined through your link', tone: 'bg-dashboard-accent/10 text-dashboard-accent' },
    { label: 'Friends earning', value: referralOverview.activeReferralCount.toLocaleString(), icon: Gift, note: 'Already earned a bonus', tone: 'bg-dashboard-accent/10 text-dashboard-accent' },
    { label: 'Bonus moments', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles, note: 'Verified reward events', tone: 'bg-dashboard-accent/10 text-dashboard-accent' },
    { label: 'PEPE earned', value: formatAtomicAmount(referralOverview.bonusAtomicByToken.PEPE), icon: Wallet, note: 'Your referral rewards', tone: 'bg-dashboard-accent/10 text-dashboard-accent' },
  ]
  const earnings = [
    { token: 'PEPE', amount: referralOverview.bonusAtomicByToken.PEPE, color: 'bg-dashboard-accent', text: 'text-dashboard-accent' },
    { token: 'HOMERO', amount: referralOverview.bonusAtomicByToken.HOMERO, color: 'bg-[#63d8ff]', text: 'text-[#63d8ff]' },
  ]

  return (
    <LocalizedTree>
      <main id="top" className="referrals-page mx-auto flex w-full flex-col gap-5 px-3 pb-8 pt-4 sm:gap-6 sm:px-5 sm:pt-6 lg:px-8">
        <section aria-labelledby="referrals-title" className="relative isolate grid min-h-[320px] overflow-hidden rounded-2xl border border-dashboard-outline bg-[#151515] shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[1.1fr_0.9fr]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_82%_20%,rgba(216,255,0,0.11),transparent_34%),radial-gradient(ellipse_at_0%_100%,rgba(99,216,255,0.06),transparent_42%)]" />
          <div className="relative z-10 flex flex-col items-start justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/65 sm:text-[10px]">
              <span className="size-1.5 rounded-full bg-dashboard-accent" /> pepe.casa · referral circle
            </span>
            <h1 id="referrals-title" className="mt-5 max-w-[680px] text-[36px] font-black leading-[1.02] tracking-[-0.055em] text-white sm:text-5xl lg:text-[56px]">Invite friends.<br /><span className="text-dashboard-accent">Earn together.</span></h1>
            <p className="mt-4 max-w-[480px] text-[13px] leading-6 text-white/60 sm:text-sm sm:leading-7">Bring your people to pepe.casa. When they earn, you do too — with a platform-funded 10% bonus.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={inviteFriends} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-dashboard-accent px-5 text-xs font-extrabold text-black transition hover:-translate-y-0.5 hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] motion-reduce:transform-none motion-reduce:transition-none">
                Invite your circle <ArrowUpRight aria-hidden="true" size={15} />
              </button>
              <span className="inline-flex items-center gap-2 text-[11px] font-medium text-white/60"><Gift aria-hidden="true" size={15} className="text-dashboard-accent" /> Your friends keep 100% of their earnings</span>
            </div>
            {shareNotice && <p role="status" className="mt-3 text-xs font-medium text-dashboard-accent">{shareNotice}</p>}
          </div>
          <div aria-hidden="true" className="relative min-h-[200px] overflow-hidden lg:min-h-full">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_48%,rgba(216,255,0,0.08),transparent_42%)]" />
            <div className="absolute left-1/2 top-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:size-[280px]" />
            <div className="absolute left-1/2 top-1/2 size-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-dashboard-accent/25 sm:size-[220px]" />
            <div className="absolute left-1/2 top-1/2 flex size-[118px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-dashboard-accent/50 bg-[#0b0b0b] text-center text-white shadow-[0_0_60px_rgba(216,255,0,0.1)] sm:size-[136px]">
              <span className="text-[32px] font-black leading-none tracking-[-0.07em] text-dashboard-accent sm:text-[38px]">10%</span>
              <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-white/60">for your circle</span>
            </div>
            <span className="absolute left-[15%] top-[28%] flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-[#202020] text-dashboard-accent sm:left-[18%] sm:top-[21%] sm:size-[58px]"><UsersRound size={21} /></span>
            <span className="absolute right-[15%] top-[23%] flex size-11 items-center justify-center rounded-full border border-white/10 bg-[#202020] text-dashboard-accent sm:right-[16%] sm:top-[19%] sm:size-[54px]"><Sparkles size={19} /></span>
            <span className="absolute bottom-[22%] left-[19%] flex size-10 items-center justify-center rounded-full border border-white/10 bg-[#202020] text-dashboard-accent sm:bottom-[19%] sm:left-[21%] sm:size-[50px]"><Gift size={18} /></span>
            <span className="absolute bottom-[19%] right-[18%] flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-[#202020] text-dashboard-accent sm:bottom-[18%] sm:right-[17%] sm:size-[56px]"><Wallet size={20} /></span>
            <span className="absolute right-[11%] top-[49%] size-2 rounded-full bg-dashboard-accent/80 sm:right-[12%]" />
            <span className="absolute left-[12%] top-[54%] size-2 rounded-full bg-sky-300/70 sm:left-[13%]" />
            <span className="absolute bottom-[9%] left-[48%] size-1.5 rounded-full bg-white/40" />
            <span className="absolute bottom-5 right-6 hidden text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:block">A little more, together</span>
          </div>
        </section>

        <section aria-label="Referral statistics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map((stat) => <ReferralStat key={stat.label} {...stat} />)}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.75fr)]">
          <section aria-labelledby="referral-link-title" className="relative overflow-hidden rounded-2xl border border-dashboard-outline bg-dashboard-surface p-5 text-white shadow-none sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-white/[0.08]" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-48 rounded-full border border-white/[0.08]" />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-dashboard-accent">Your invitation</p>
                  <h2 id="referral-link-title" className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">Your link, your people</h2>
                  <p className="mt-1.5 max-w-md text-xs leading-5 text-white/60">Pass it along. Every new friend who joins is connected to your circle.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-white/80"><Link2 size={13} />{referralOverview.referralCode}</span>
              </div>
              <div className="mt-5 flex min-w-0 flex-col gap-2 sm:flex-row">
                <label htmlFor="referral-link" className="sr-only">Personal referral link</label>
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/15 bg-black/15 px-4">
                  <Link2 aria-hidden="true" className="shrink-0 text-dashboard-accent" size={16} />
                  <input id="referral-link" type="text" readOnly value={referralLink} className="min-h-12 min-w-0 flex-1 bg-transparent text-xs text-white/80 outline-none sm:text-sm" />
                </div>
                <button type="button" onClick={copyReferralLink} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-dashboard-accent px-5 text-xs font-extrabold text-black transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]">
                  {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}{copied ? 'Copied' : 'Copy invite link'}
                </button>
              </div>
              {copyError && <p role="status" className="mt-2 text-xs font-medium text-rose-300">Could not copy automatically. Select the link and copy it manually.</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.17em] text-white/45">Share it</span>
                <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"><Share2 aria-hidden="true" size={13} />Telegram</a>
                <a href={`https://twitter.com/intent/tweet?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent">X <ArrowUpRight aria-hidden="true" size={13} /></a>
                <a href={`https://wa.me/?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent">WhatsApp <ArrowUpRight aria-hidden="true" size={13} /></a>
                <button type="button" aria-expanded={qrOpen} aria-controls="referral-qr-panel" onClick={() => setQrOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"><QrCode aria-hidden="true" size={13} />{qrOpen ? 'Hide QR' : 'QR code'}</button>
              </div>
              {qrOpen && <div id="referral-qr-panel" className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center sm:flex-row sm:text-left">
                <div className="rounded-xl bg-white p-2.5"><QRCodeSVG value={referralLink} size={128} level="M" includeMargin /></div>
                <div className="max-w-sm">
                  <h3 className="text-sm font-semibold">A scan away</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">Friends can scan this code with their phone camera to open your invitation.</p>
                  <button type="button" onClick={() => setQrOpen(false)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"><X aria-hidden="true" size={14} />Close</button>
                </div>
              </div>}
            </div>
          </section>

          <section aria-labelledby="earnings-breakdown-title" className="rounded-2xl border border-dashboard-outline bg-dashboard-surface p-5 shadow-none sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-dashboard-accent">The good part</p>
                <h2 id="earnings-breakdown-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">Bonuses, by token</h2>
                <p className="mt-1 text-xs text-dashboard-muted">A little extra for helping your circle grow.</p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-dashboard-accent/10 text-dashboard-accent"><Wallet aria-hidden="true" size={17} /></span>
            </div>
            <div className="mt-5 flex items-center gap-4 rounded-xl bg-dashboard-surface-raised p-4">
              <div aria-hidden="true" className="grid size-[72px] shrink-0 place-items-center rounded-full p-[5px]" style={{ background: 'conic-gradient(#d8ff00 0 10%, rgb(255 255 255 / 0.12) 10% 100%)' }}>
                <div className="grid size-full place-items-center rounded-full bg-[#151515] text-center"><span className="text-lg font-semibold leading-none text-white">10%</span><span className="mt-1 text-[7px] font-bold uppercase tracking-[0.15em] text-dashboard-muted">bonus</span></div>
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Funded by pepe.casa</p>
                <p className="mt-1 text-[10px] leading-4 text-dashboard-muted">Your friends keep every bit of their own rewards.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {earnings.map(({ token, amount, color, text }) => (
                <div key={token} className="flex items-center justify-between gap-3 rounded-xl border border-dashboard-outline px-4 py-3.5">
                  <div className="flex items-center gap-2.5"><span aria-hidden="true" className={`size-2.5 rounded-full ${color}`} /><span className="text-xs font-semibold text-white/70">{token}</span></div>
                  <span className={`break-all text-right font-mono text-xs font-semibold ${text}`}>{formatAtomicAmount(amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-dashboard-muted">Token balances are displayed separately.</p>
          </section>
        </div>

        <section aria-labelledby="referral-performance-title" className="rounded-2xl border border-dashboard-outline bg-dashboard-surface p-5 shadow-none sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-dashboard-accent">Your momentum</p>
              <h2 id="referral-performance-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">A circle in motion</h2>
              <p className="mt-1 text-xs text-dashboard-muted">A snapshot of your verified referral activity.</p>
            </div>
            <span className="rounded-full border border-dashboard-outline bg-dashboard-surface-raised px-3.5 py-2 text-[10px] font-semibold text-white/70">All time</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'People reached', value: referralOverview.referralCount.toLocaleString(), icon: Link2 },
              { label: 'Friends earning', value: referralOverview.activeReferralCount.toLocaleString(), icon: UsersRound },
              { label: 'Bonuses sent', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-dashboard-outline bg-dashboard-surface-raised px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-dashboard-accent/10 text-dashboard-accent"><Icon aria-hidden="true" size={15} /></span>
                <div className="min-w-0"><p className="text-[10px] font-medium text-dashboard-muted">{label}</p><p className="mt-1 text-lg font-semibold leading-none tracking-tight text-white">{value}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-dashboard-outline p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-white/70">Friends who have earned a bonus</span>
              <span className="font-semibold text-dashboard-accent">{formatRate(rewardRate)}</span>
            </div>
            <div role="progressbar" aria-label="Share of referrals with a bonus" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rewardRate)} className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-dashboard-accent transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${rewardRate}%` }} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-dashboard-muted"><span>{language === 'ru' ? `${referralOverview.activeReferralCount.toLocaleString()} из ${referralOverview.referralCount.toLocaleString()} ${formatRussianFriendCount(referralOverview.referralCount)}` : `${referralOverview.activeReferralCount.toLocaleString()} of ${referralOverview.referralCount.toLocaleString()} friends`}</span><span className="inline-flex items-center gap-1"><ArrowDownRight aria-hidden="true" size={12} />Keep sharing</span></div>
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashboard-outline bg-dashboard-accent/[0.05] p-3.5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-dashboard-accent" size={15} />
            <p className="text-[10px] leading-5 text-dashboard-muted">Only eligible earnings verified by the server create referral bonuses. Sign-up attribution stays attached to your account.</p>
          </div>
        </section>

        <section aria-labelledby="referral-steps-title" className="rounded-2xl border border-dashboard-outline bg-dashboard-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-dashboard-accent">Easy as one, two, three</p>
              <h2 id="referral-steps-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">How the circle grows</h2>
            </div>
            <p className="text-xs text-dashboard-muted">A simple invite. A shared little win.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Share2, title: 'Share your link', text: 'A new account can carry your referral code through sign-up.', number: '01' },
              { icon: UsersRound, title: 'Your friend joins', text: 'Their referral attribution is saved to their account profile.', number: '02' },
              { icon: Gift, title: 'Both of you benefit', text: 'You receive a platform-funded bonus on eligible earnings.', number: '03' },
            ].map(({ icon: Icon, title, text, number }) => (
              <article key={number} className="rounded-xl border border-dashboard-outline bg-dashboard-surface-raised p-4 sm:p-5">
                <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-dashboard-accent/10 text-dashboard-accent"><Icon aria-hidden="true" size={17} /></span><span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-white/40">{number}</span></div>
                <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-dashboard-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="referral-faq-title" className="rounded-2xl border border-dashboard-outline bg-dashboard-surface p-5 shadow-none sm:p-7">
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-dashboard-accent">A few details</p>
            <h2 id="referral-faq-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">Good to know</h2>
          </div>
          <div className="flex flex-col gap-2">
            {faqItems.map(({ question, answer }) => (
              <details key={question} className="group rounded-xl border border-dashboard-outline bg-dashboard-surface-raised px-4 py-3.5 transition open:bg-[#262626] sm:px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-white marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent [&::-webkit-details-marker]:hidden">
                  <span>{question}</span><ChevronDown aria-hidden="true" size={15} className="shrink-0 text-white/50 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 max-w-4xl text-[11px] leading-5 text-dashboard-muted sm:text-xs">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </LocalizedTree>
  )
}
