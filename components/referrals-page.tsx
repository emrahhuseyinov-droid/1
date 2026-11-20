'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ReferralOverview } from '@/lib/referral-types'
import { LocalizedTree } from '@/components/site-language-provider'
import {
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

function formatRate(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

export function ReferralsPage({ referralOverview }: Props) {
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

  async function inviteFriends() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join pepe.casa',
          text: 'Join pepe.casa with my referral link',
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

  const shareMessage = encodeURIComponent(`Join pepe.casa with my referral link: ${referralLink}`)
  const rewardRate = referralOverview.referralCount > 0
    ? Math.min(100, (referralOverview.activeReferralCount / referralOverview.referralCount) * 100)
    : 0
  const earnings = [
    { token: 'PEPE', amount: referralOverview.bonusAtomicByToken.PEPE, accent: 'bg-cyan-300', text: 'text-cyan-200' },
    { token: 'HOMERO', amount: referralOverview.bonusAtomicByToken.HOMERO, accent: 'bg-lime-300', text: 'text-lime-200' },
  ]
  const stats = [
    { label: 'Total referrals', value: referralOverview.referralCount.toLocaleString(), icon: UsersRound, note: 'Joined with your link' },
    { label: 'Rewarded referrals', value: referralOverview.activeReferralCount.toLocaleString(), icon: Gift, note: 'Earned a bonus' },
    { label: 'Bonus events', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles, note: 'Verified activity' },
    { label: 'PEPE bonus total', value: formatAtomicAmount(referralOverview.bonusAtomicByToken.PEPE), icon: Wallet, note: 'Referral earnings' },
  ]

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell referrals-page max-w-none w-full space-y-4 rounded-[22px] border border-white/[0.08] bg-[#101010] p-3 text-white before:hidden after:hidden sm:space-y-5 sm:p-4 lg:p-5">
        <section className="referral-hero relative isolate flex min-h-[205px] items-center overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#141414] px-5 py-5 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_25%,rgba(214,255,0,0.07),transparent_34%),linear-gradient(110deg,rgba(255,255,255,0.015),transparent_62%)]" />
          <div className="relative z-10 max-w-[680px]">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-lime-300">Referral program</p>
            <h1 className="text-[27px] font-semibold tracking-[-0.035em] sm:text-[34px]">Invite friends. Earn crypto.</h1>
            <p className="mt-2 max-w-[520px] text-xs leading-5 text-white/55 sm:text-sm">Earn a site-funded 10% bonus on eligible referral rewards. Your friends keep their full earnings.</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button type="button" onClick={inviteFriends} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-lime-300 px-4 text-xs font-bold text-[#17190c] transition hover:bg-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]">
                <UsersRound aria-hidden="true" size={15} /> Invite now
              </button>
              <button type="button" onClick={copyReferralLink} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 text-xs font-semibold text-white/85 transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]">
                {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}{copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {shareNotice && <p role="status" className="mt-2 text-xs text-lime-100">{shareNotice}</p>}
          </div>
          <img src="/images/referral-hero.png" alt="" aria-hidden="true" className="pointer-events-none absolute -right-3 top-1/2 hidden h-[220px] w-[220px] -translate-y-1/2 object-contain opacity-90 sm:block lg:right-5 lg:h-[255px] lg:w-[255px]" />
        </section>

        <section aria-label="Referral statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, note }) => (
            <article key={label} className="flex min-h-[142px] min-w-0 flex-col justify-between rounded-[14px] border border-white/[0.07] bg-[#191919] p-4 sm:min-h-[154px] sm:p-5">
              <span className="flex size-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-lime-200"><Icon aria-hidden="true" size={17} /></span>
              <div className="min-w-0">
                <p className={`truncate font-semibold tracking-tight text-white ${label === 'PEPE bonus total' ? 'text-lg sm:text-xl' : 'text-2xl sm:text-[28px]'}`}>{value}</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <h2 className="text-xs font-semibold text-white/75">{label}</h2>
                  <span className="text-[10px] text-white/40">{note}</span>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="referral-link-title" className="rounded-[14px] border border-white/[0.07] bg-[#191919] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="referral-link-title" className="text-sm font-semibold text-white">Your referral link</h2>
              <p className="mt-1 text-xs text-white/45">Share this link to connect new accounts to your profile.</p>
            </div>
            <span className="rounded-md border border-lime-200/10 bg-lime-200/[0.06] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-wider text-lime-100">{referralOverview.referralCode}</span>
          </div>
          <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
            <label htmlFor="referral-link" className="sr-only">Personal referral link</label>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-white/[0.08] bg-[#111111] px-3.5">
              <Link2 aria-hidden="true" className="shrink-0 text-white/45" size={16} />
              <input id="referral-link" type="text" readOnly value={referralLink} className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-white/70 outline-none sm:text-sm" />
            </div>
            <button type="button" onClick={copyReferralLink} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-lime-300 px-4 text-xs font-bold text-[#14170b] transition hover:bg-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#191919]">
              {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}{copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          {copyError && <p role="status" className="mt-2 text-xs font-medium text-rose-300">Could not copy automatically. Select the link and copy it manually.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Share via</span>
            <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join pepe.casa with my referral link')}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200"><Share2 aria-hidden="true" size={14} />Telegram</a>
            <a href={`https://twitter.com/intent/tweet?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200"><ArrowUpRight aria-hidden="true" size={14} />X</a>
            <a href={`https://wa.me/?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200"><ArrowUpRight aria-hidden="true" size={14} />WhatsApp</a>
            <button type="button" aria-expanded={qrOpen} aria-controls="referral-qr-panel" onClick={() => setQrOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200"><QrCode aria-hidden="true" size={14} />{qrOpen ? 'Hide QR code' : 'QR code'}</button>
          </div>
          {qrOpen && <div id="referral-qr-panel" className="mt-4 flex flex-col items-center gap-4 rounded-lg border border-white/[0.08] bg-[#111111] p-4 text-center sm:flex-row sm:text-left">
            <div className="rounded-lg bg-white p-3"><QRCodeSVG value={referralLink} size={144} level="M" includeMargin /></div>
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold text-white">Scan to join</h3>
              <p className="mt-1 text-xs leading-5 text-white/45">This QR code opens your referral link. Friends can scan it with their phone camera.</p>
              <button type="button" onClick={() => setQrOpen(false)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200"><X aria-hidden="true" size={14} />Close</button>
            </div>
          </div>}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)]">
          <section aria-labelledby="referral-performance-title" className="rounded-[14px] border border-white/[0.07] bg-[#191919] p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="referral-performance-title" className="text-sm font-semibold text-white">Referral performance</h2>
                <p className="mt-1 text-xs text-white/45">A snapshot of your verified referral activity</p>
              </div>
              <span className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-white/45">All time</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Attributed accounts', value: referralOverview.referralCount.toLocaleString(), icon: Link2 },
                { label: 'Rewarded referrals', value: referralOverview.activeReferralCount.toLocaleString(), icon: UsersRound },
                { label: 'Bonus events', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-[10px] border border-white/[0.06] bg-[#141414] p-3.5">
                  <div className="flex items-center gap-2 text-white/45"><Icon aria-hidden="true" size={14} /><span className="text-[10px] font-medium">{label}</span></div>
                  <p className="mt-2.5 text-xl font-semibold tracking-tight text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-[10px] border border-white/[0.06] bg-[#141414] p-3.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-white/65">Referral reward rate</span>
                <span className="font-semibold text-lime-200">{formatRate(rewardRate)}</span>
              </div>
              <div role="progressbar" aria-label="Share of referrals with a bonus" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rewardRate)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-lime-300 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${rewardRate}%` }} />
              </div>
              <p className="mt-2 text-[10px] text-white/40">{referralOverview.activeReferralCount.toLocaleString()} of {referralOverview.referralCount.toLocaleString()} referrals have earned a bonus.</p>
            </div>
            <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-emerald-300/10 bg-emerald-300/[0.035] p-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-200" size={15} />
              <p className="text-[11px] leading-5 text-white/50">Only eligible earnings verified by the server create referral bonuses. Sign-up attribution stays attached to your account.</p>
            </div>
          </section>

          <section aria-labelledby="earnings-breakdown-title" className="rounded-[14px] border border-white/[0.07] bg-[#191919] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="earnings-breakdown-title" className="text-sm font-semibold text-white">Earnings breakdown</h2>
                <p className="mt-1 text-xs text-white/45">Bonuses by token</p>
              </div>
              <Wallet aria-hidden="true" className="text-white/35" size={17} />
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-[10px] border border-white/[0.06] bg-[#141414] p-3.5">
              <div aria-hidden="true" className="grid size-[86px] shrink-0 place-items-center rounded-full p-[8px]" style={{ background: 'conic-gradient(#d8ff00 0 10%, #303030 10% 100%)' }}>
                <div className="grid size-full place-items-center rounded-full bg-[#141414] text-center"><span className="text-lg font-semibold leading-none text-white">10%</span><span className="mt-1 text-[8px] uppercase tracking-wide text-white/40">bonus</span></div>
              </div>
              <p className="text-[11px] leading-5 text-white/50">A site-funded bonus on eligible referral earnings.</p>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {earnings.map(({ token, amount, accent, text }) => (
                <div key={token} className="flex items-center justify-between gap-3 rounded-[10px] border border-white/[0.06] bg-[#141414] px-3.5 py-3">
                  <div className="flex items-center gap-2.5"><span className={`size-2 rounded-full ${accent}`} /><span className="text-xs font-medium text-white/65">{token}</span></div>
                  <span className={`break-all text-right font-mono text-xs font-semibold ${text}`}>{formatAtomicAmount(amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-white/40">Token balances are displayed separately.</p>
          </section>
        </div>

        <section aria-labelledby="referral-steps-title" className="rounded-2xl border border-white/[0.07] bg-[#151616] p-4 sm:p-5">
          <div className="text-center">
            <h2 id="referral-steps-title" className="text-sm font-semibold text-white">How it works</h2>
            <p className="mt-1 text-xs text-white/55">Three simple steps to earn together</p>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Share2, title: '1. Share your link', text: 'A new account can carry your referral code through sign-up.' },
              { icon: UsersRound, title: '2. Invite a friend', text: 'Referral attribution is saved to the account profile.' },
              { icon: Gift, title: '3. Earn a bonus', text: 'Receive 10% of eligible earnings, funded by the platform.' },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                <span className="flex size-9 items-center justify-center rounded-full border border-lime-200/10 bg-lime-200/[0.06] text-lime-200"><Icon aria-hidden="true" size={16} /></span>
                <h3 className="mt-3 text-xs font-semibold text-white/80">{title}</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-white/55">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="referral-faq-title" className="rounded-2xl border border-white/[0.07] bg-[#151616] p-4 sm:p-5">
          <h2 id="referral-faq-title" className="mb-3 text-sm font-semibold text-white">Frequently asked questions</h2>
          <div className="flex flex-col gap-2">
            {faqItems.map(({ question, answer }) => (
              <details key={question} className="group rounded-xl border border-white/[0.06] p-3.5 transition open:bg-white/[0.025] sm:p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-white/75 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200">
                  <span>{question}</span><ChevronDown aria-hidden="true" size={15} className="shrink-0 text-white/50 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[11px] leading-5 text-white/45 sm:text-xs">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </LocalizedTree>
  )
}
