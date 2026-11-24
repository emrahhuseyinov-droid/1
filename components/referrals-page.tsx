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
    <article className="group flex min-w-0 flex-col justify-between rounded-[22px] border border-[#e9e2d8] bg-[#fffdf8] p-4 shadow-[0_7px_22px_rgba(51,35,47,0.035)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(51,35,47,0.08)] sm:min-h-[148px] sm:p-5 motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold leading-5 text-[#756d70] sm:text-xs">{label}</p>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon aria-hidden="true" size={16} /></span>
      </div>
      <div className="mt-5 min-w-0">
        <p className="truncate text-[27px] font-semibold leading-none tracking-[-0.055em] text-[#29232c] sm:text-[32px]">{value}</p>
        <p className="mt-2 text-[10px] leading-4 text-[#948b8c]">{note}</p>
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
    { label: 'People you invited', value: referralOverview.referralCount.toLocaleString(), icon: UsersRound, note: 'Joined through your link', tone: 'bg-[#f9e7df] text-[#bd6558]' },
    { label: 'Friends earning', value: referralOverview.activeReferralCount.toLocaleString(), icon: Gift, note: 'Already earned a bonus', tone: 'bg-[#eee7f5] text-[#755b8d]' },
    { label: 'Bonus moments', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles, note: 'Verified reward events', tone: 'bg-[#f8edd0] text-[#a57928]' },
    { label: 'PEPE earned', value: formatAtomicAmount(referralOverview.bonusAtomicByToken.PEPE), icon: Wallet, note: 'Your referral rewards', tone: 'bg-[#dff1e8] text-[#3b8064]' },
  ]
  const earnings = [
    { token: 'PEPE', amount: referralOverview.bonusAtomicByToken.PEPE, color: 'bg-[#ed8f79]', text: 'text-[#a95143]' },
    { token: 'HOMERO', amount: referralOverview.bonusAtomicByToken.HOMERO, color: 'bg-[#8c73a8]', text: 'text-[#69517f]' },
  ]

  return (
    <LocalizedTree>
      <main id="top" className="referrals-page mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-3 pb-8 pt-4 sm:gap-6 sm:px-5 sm:pt-6 lg:px-8">
        <section aria-labelledby="referrals-title" className="relative isolate grid min-h-[330px] overflow-hidden rounded-[30px] border border-[#eee3d7] bg-[#f4ecdf] shadow-[0_18px_50px_rgba(22,14,25,0.13)] lg:grid-cols-[1.15fr_0.85fr]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_18%,rgba(236,149,127,0.30),transparent_32%),radial-gradient(ellipse_at_5%_100%,rgba(149,125,174,0.14),transparent_43%)]" />
          <div className="relative z-10 flex flex-col items-start justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8cbbd] bg-white/55 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#766d70] sm:text-[10px]">
              <span className="size-1.5 rounded-full bg-[#dd806f]" /> pepe.casa · referral circle
            </span>
            <h1 id="referrals-title" className="mt-5 max-w-[620px] text-[38px] font-semibold leading-[0.98] tracking-[-0.065em] text-[#302633] sm:text-[54px] lg:text-[64px]">Invite friends.<br /><span className="font-serif font-medium italic text-[#a45c76]">Earn together.</span></h1>
            <p className="mt-4 max-w-[430px] text-[13px] leading-6 text-[#70666a] sm:text-sm sm:leading-7">Bring your people to pepe.casa. When they earn, you do too — with a platform-funded 10% bonus.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={inviteFriends} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#32263a] px-5 text-xs font-semibold text-[#fff9ef] shadow-[0_9px_18px_rgba(50,38,58,0.18)] transition hover:-translate-y-0.5 hover:bg-[#493650] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#755b8d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4ecdf] motion-reduce:transform-none motion-reduce:transition-none">
                Invite your circle <ArrowUpRight aria-hidden="true" size={15} />
              </button>
              <span className="inline-flex items-center gap-2 text-[11px] font-medium text-[#756a6e]"><Gift aria-hidden="true" size={15} className="text-[#b96868]" /> Your friends keep 100% of their earnings</span>
            </div>
            {shareNotice && <p role="status" className="mt-3 text-xs font-medium text-[#496f5a]">{shareNotice}</p>}
          </div>
          <div aria-hidden="true" className="relative min-h-[200px] overflow-hidden lg:min-h-full">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_48%,rgba(255,255,255,0.52),transparent_41%)]" />
            <div className="absolute left-1/2 top-1/2 size-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b99bb1]/35 sm:size-[310px]" />
            <div className="absolute left-1/2 top-1/2 size-[190px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#bb8d8a]/40 sm:size-[238px]" />
            <div className="absolute left-1/2 top-1/2 flex size-[112px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[7px] border-[#f8f1e8] bg-[#32263a] text-center text-[#fff8ed] shadow-[0_15px_36px_rgba(51,35,47,0.2)] sm:size-[132px]">
              <span className="text-[32px] font-semibold leading-none tracking-[-0.07em] sm:text-[38px]">10%</span>
              <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-[#e7c9d1]">for your circle</span>
            </div>
            <span className="absolute left-[15%] top-[28%] flex size-12 items-center justify-center rounded-[17px] bg-[#e7b7a4] text-[#543944] shadow-[0_8px_18px_rgba(88,61,69,0.12)] sm:left-[18%] sm:top-[21%] sm:size-[58px]"><UsersRound size={21} /></span>
            <span className="absolute right-[15%] top-[23%] flex size-11 items-center justify-center rounded-full bg-[#c9b6d8] text-[#493954] shadow-[0_8px_18px_rgba(88,61,69,0.12)] sm:right-[16%] sm:top-[19%] sm:size-[54px]"><Sparkles size={19} /></span>
            <span className="absolute bottom-[22%] left-[19%] flex size-10 items-center justify-center rounded-full bg-[#e8d49e] text-[#62513a] shadow-[0_8px_18px_rgba(88,61,69,0.12)] sm:bottom-[19%] sm:left-[21%] sm:size-[50px]"><Gift size={18} /></span>
            <span className="absolute bottom-[19%] right-[18%] flex size-12 items-center justify-center rounded-[17px] bg-[#a8c8b4] text-[#365747] shadow-[0_8px_18px_rgba(88,61,69,0.12)] sm:bottom-[18%] sm:right-[17%] sm:size-[56px]"><Wallet size={20} /></span>
            <span className="absolute right-[11%] top-[49%] size-2 rounded-full bg-[#d68472] sm:right-[12%]" />
            <span className="absolute left-[12%] top-[54%] size-2 rounded-full bg-[#9678a8] sm:left-[13%]" />
            <span className="absolute bottom-[9%] left-[48%] size-1.5 rounded-full bg-[#b38a4a]" />
            <span className="absolute bottom-5 right-6 hidden text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8f7f80] sm:block">A little more, together</span>
          </div>
        </section>

        <section aria-label="Referral statistics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map((stat) => <ReferralStat key={stat.label} {...stat} />)}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.75fr)]">
          <section aria-labelledby="referral-link-title" className="relative overflow-hidden rounded-[26px] bg-[#302633] p-5 text-[#fff9ef] shadow-[0_16px_38px_rgba(22,14,25,0.17)] sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-white/[0.08]" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-48 rounded-full border border-white/[0.08]" />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#e6b7ac]">Your invitation</p>
                  <h2 id="referral-link-title" className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">Your link, your people</h2>
                  <p className="mt-1.5 max-w-md text-xs leading-5 text-white/60">Pass it along. Every new friend who joins is connected to your circle.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#f3d8c9]"><Link2 size={13} />{referralOverview.referralCode}</span>
              </div>
              <div className="mt-5 flex min-w-0 flex-col gap-2 sm:flex-row">
                <label htmlFor="referral-link" className="sr-only">Personal referral link</label>
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/15 bg-black/15 px-4">
                  <Link2 aria-hidden="true" className="shrink-0 text-[#ddb7b5]" size={16} />
                  <input id="referral-link" type="text" readOnly value={referralLink} className="min-h-12 min-w-0 flex-1 bg-transparent text-xs text-white/80 outline-none sm:text-sm" />
                </div>
                <button type="button" onClick={copyReferralLink} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#eab2a0] px-5 text-xs font-bold text-[#382733] transition hover:bg-[#f3c3b3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#302633]">
                  {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}{copied ? 'Copied' : 'Copy invite link'}
                </button>
              </div>
              {copyError && <p role="status" className="mt-2 text-xs font-medium text-[#ffc4b8]">Could not copy automatically. Select the link and copy it manually.</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.17em] text-white/45">Share it</span>
                <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3]"><Share2 aria-hidden="true" size={13} />Telegram</a>
                <a href={`https://twitter.com/intent/tweet?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3]">X <ArrowUpRight aria-hidden="true" size={13} /></a>
                <a href={`https://wa.me/?text=${shareMessage}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3]">WhatsApp <ArrowUpRight aria-hidden="true" size={13} /></a>
                <button type="button" aria-expanded={qrOpen} aria-controls="referral-qr-panel" onClick={() => setQrOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3]"><QrCode aria-hidden="true" size={13} />{qrOpen ? 'Hide QR' : 'QR code'}</button>
              </div>
              {qrOpen && <div id="referral-qr-panel" className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center sm:flex-row sm:text-left">
                <div className="rounded-xl bg-white p-2.5"><QRCodeSVG value={referralLink} size={128} level="M" includeMargin /></div>
                <div className="max-w-sm">
                  <h3 className="text-sm font-semibold">A scan away</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">Friends can scan this code with their phone camera to open your invitation.</p>
                  <button type="button" onClick={() => setQrOpen(false)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c3b3]"><X aria-hidden="true" size={14} />Close</button>
                </div>
              </div>}
            </div>
          </section>

          <section aria-labelledby="earnings-breakdown-title" className="rounded-[26px] border border-[#e9e2d8] bg-[#fffdf8] p-5 shadow-[0_7px_22px_rgba(51,35,47,0.035)] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a45c76]">The good part</p>
                <h2 id="earnings-breakdown-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#302633]">Bonuses, by token</h2>
                <p className="mt-1 text-xs text-[#887e7f]">A little extra for helping your circle grow.</p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#f1e9f4] text-[#755b8d]"><Wallet aria-hidden="true" size={17} /></span>
            </div>
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[#f5efe7] p-4">
              <div aria-hidden="true" className="grid size-[72px] shrink-0 place-items-center rounded-full p-[5px]" style={{ background: 'conic-gradient(#a45c76 0 10%, #e6dce0 10% 100%)' }}>
                <div className="grid size-full place-items-center rounded-full bg-[#f5efe7] text-center"><span className="text-lg font-semibold leading-none text-[#392c39]">10%</span><span className="mt-1 text-[7px] font-bold uppercase tracking-[0.15em] text-[#8a777e]">bonus</span></div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#413540]">Funded by pepe.casa</p>
                <p className="mt-1 text-[10px] leading-4 text-[#817579]">Your friends keep every bit of their own rewards.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {earnings.map(({ token, amount, color, text }) => (
                <div key={token} className="flex items-center justify-between gap-3 rounded-2xl border border-[#eee7df] px-4 py-3.5">
                  <div className="flex items-center gap-2.5"><span aria-hidden="true" className={`size-2.5 rounded-full ${color}`} /><span className="text-xs font-semibold text-[#675e62]">{token}</span></div>
                  <span className={`break-all text-right font-mono text-xs font-semibold ${text}`}>{formatAtomicAmount(amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#958a8d]">Token balances are displayed separately.</p>
          </section>
        </div>

        <section aria-labelledby="referral-performance-title" className="rounded-[26px] border border-[#e9e2d8] bg-[#fffdf8] p-5 shadow-[0_7px_22px_rgba(51,35,47,0.035)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a45c76]">Your momentum</p>
              <h2 id="referral-performance-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#302633]">A circle in motion</h2>
              <p className="mt-1 text-xs text-[#887e7f]">A snapshot of your verified referral activity.</p>
            </div>
            <span className="rounded-full bg-[#f2eee9] px-3.5 py-2 text-[10px] font-semibold text-[#786f72]">All time</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'People reached', value: referralOverview.referralCount.toLocaleString(), icon: Link2 },
              { label: 'Friends earning', value: referralOverview.activeReferralCount.toLocaleString(), icon: UsersRound },
              { label: 'Bonuses sent', value: referralOverview.bonusCount.toLocaleString(), icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-[#f5efe7] px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#98708c]"><Icon aria-hidden="true" size={15} /></span>
                <div className="min-w-0"><p className="text-[10px] font-medium text-[#82777b]">{label}</p><p className="mt-1 text-lg font-semibold leading-none tracking-tight text-[#342b35]">{value}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[#eee7df] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-[#6f6569]">Friends who have earned a bonus</span>
              <span className="font-semibold text-[#9b5c76]">{formatRate(rewardRate)}</span>
            </div>
            <div role="progressbar" aria-label="Share of referrals with a bonus" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rewardRate)} className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee8e5]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#a45c76] to-[#e59b84] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${rewardRate}%` }} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-[#92878b]"><span>{language === 'ru' ? `${referralOverview.activeReferralCount.toLocaleString()} из ${referralOverview.referralCount.toLocaleString()} ${formatRussianFriendCount(referralOverview.referralCount)}` : `${referralOverview.activeReferralCount.toLocaleString()} of ${referralOverview.referralCount.toLocaleString()} friends`}</span><span className="inline-flex items-center gap-1"><ArrowDownRight aria-hidden="true" size={12} />Keep sharing</span></div>
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#edf4ee] p-3.5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[#4d8062]" size={15} />
            <p className="text-[10px] leading-5 text-[#617269]">Only eligible earnings verified by the server create referral bonuses. Sign-up attribution stays attached to your account.</p>
          </div>
        </section>

        <section aria-labelledby="referral-steps-title" className="rounded-[26px] border border-[#e9e2d8] bg-[#eee7f1] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#8c6684]">Easy as one, two, three</p>
              <h2 id="referral-steps-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#302633]">How the circle grows</h2>
            </div>
            <p className="text-xs text-[#786f78]">A simple invite. A shared little win.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Share2, title: 'Share your link', text: 'A new account can carry your referral code through sign-up.', number: '01', color: 'bg-[#f9e3d9] text-[#af6758]' },
              { icon: UsersRound, title: 'Your friend joins', text: 'Their referral attribution is saved to their account profile.', number: '02', color: 'bg-[#e4d8ec] text-[#755b8d]' },
              { icon: Gift, title: 'Both of you benefit', text: 'You receive a platform-funded bonus on eligible earnings.', number: '03', color: 'bg-[#f2e5bc] text-[#97753b]' },
            ].map(({ icon: Icon, title, text, number, color }) => (
              <article key={number} className="rounded-[20px] border border-white/70 bg-[#fffdf8]/75 p-4 sm:p-5">
                <div className="flex items-center justify-between"><span className={`flex size-10 items-center justify-center rounded-[15px] ${color}`}><Icon aria-hidden="true" size={17} /></span><span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[#a69aa3]">{number}</span></div>
                <h3 className="mt-4 text-sm font-semibold text-[#392f3a]">{title}</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-[#81767e]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="referral-faq-title" className="rounded-[26px] border border-[#e9e2d8] bg-[#fffdf8] p-5 shadow-[0_7px_22px_rgba(51,35,47,0.035)] sm:p-7">
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a45c76]">A few details</p>
            <h2 id="referral-faq-title" className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#302633]">Good to know</h2>
          </div>
          <div className="flex flex-col gap-2">
            {faqItems.map(({ question, answer }) => (
              <details key={question} className="group rounded-2xl border border-[#eee7df] bg-[#fffefa] px-4 py-3.5 transition open:bg-[#faf5ef] sm:px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[#51464e] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a45c76] [&::-webkit-details-marker]:hidden">
                  <span>{question}</span><ChevronDown aria-hidden="true" size={15} className="shrink-0 text-[#a58794] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 max-w-4xl text-[11px] leading-5 text-[#81767e] sm:text-xs">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </LocalizedTree>
  )
}
