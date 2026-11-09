'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { dashboardSectionPaths, getDashboardSectionFromPath, type DashboardSection } from '@/lib/dashboard-sections'
import { AccountSettingsPage } from '@/components/account-settings-page'
import { HomeroTokenLogo } from '@/components/homero-token-logo'
import { PepeCasaAvatar } from '@/components/pepecasa-avatar'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'
import { TokenLogo } from '@/components/token-logo'
import { SwapPage } from '@/components/swap-page'
import { DashboardPage } from '@/components/dashboard-page'
import { WalletPage } from '@/components/wallet-page'
import { PromoCodePage } from '@/components/promo-code-page'
import { ReferralsPage } from '@/components/referrals-page'
import { ViewAdsPage } from '@/components/view-ads-page'
import { ShortlinksPage } from '@/components/shortlinks-page'
import { AdsLabOfferwallPage } from '@/components/adslab-offerwall-page'
import { BannerRewardPromo } from '@/components/banner-reward-promo'
import { ArcadePage } from '@/components/arcade-page'
import { WheelOfFortunePage } from '@/components/wheel-of-fortune-page'
import { ArcadeWeeklyLeaderboardPage } from '@/components/arcade-weekly-leaderboard-page'
import { WithdrawPage } from '@/components/withdraw-page'
import { authClient } from '@/lib/auth-client'
import type { DashboardOverview } from '@/lib/dashboard-types'
import { walletAssets, type WalletCoinSymbol } from '@/lib/wallet-assets'
import type { PromoActivityEligibility, PromoClaim } from '@/lib/promo-types'
import { DEFAULT_PROFILE_AVATAR, type ProfileAvatarSrc } from '@/lib/profile-avatars'
import type { ReferralOverview } from '@/lib/referral-types'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Link2,
  ChevronDown,
  CircleHelp,
  Dices,
  Gamepad2,
  Gift,
  House,
  LogOut,
  Menu,
  ShieldCheck,
  Trophy,
  UsersRound,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const atomicUnitsPerToken = 100_000_000

type NavigationLink = { label: string; icon: LucideIcon; badge?: string; section?: DashboardSection }
type NavigationGroup = { title: string; links: NavigationLink[] }

const publisherNavGroups: NavigationGroup[] = [
  {
    title: 'Main',
    links: [
      { label: 'Dashboard', icon: House },
      { label: 'My Wallet', icon: Wallet },
      { label: 'Withdraw', icon: ArrowDownToLine },
      { label: 'Swap', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Earning features',
    links: [
      { label: 'Arcade', icon: Gamepad2 },
      { label: 'Wheel of Fortune', icon: Dices },
      { label: 'Weekly Leaderboard', icon: Trophy },
      { label: 'PTC Ads', icon: BarChart3, section: 'View Ads' },
      { label: 'Shortlinks', icon: Link2 },
      { label: 'Offerwall', icon: Gift },
    ],
  },
  {
    title: 'Special features',
    links: [
      { label: 'Referrals', icon: UsersRound, badge: '10%' },
      { label: 'Promo Code', icon: Zap },
    ],
  },
  {
    title: 'Profile settings',
    links: [
      { label: 'Security & Wallets', icon: ShieldCheck },
    ],
  },
]

const navItemClassName = 'group relative isolate flex w-full items-center overflow-hidden rounded-2xl border border-transparent px-3 py-2.5 text-left text-xs font-bold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-cyan-200/30 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-indigo-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 motion-reduce:transition-none motion-reduce:hover:transform-none'
const navEdgeClassName = 'pointer-events-none absolute inset-y-2 w-1 rounded-full bg-gradient-to-b from-cyan-200 to-yellow-200 opacity-0 shadow-[0_0_12px_rgba(99,216,255,0.75)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none'

export function ManualClaimPage({ initialSection, guestProfileId, email, name, initialAvatarUrl, referralOverview, promoClaims, promoActivity, dashboardOverview }: { initialSection: DashboardSection; guestProfileId: string; email: string; name: string; initialAvatarUrl: ProfileAvatarSrc; referralOverview: ReferralOverview; promoClaims: PromoClaim[]; promoActivity: PromoActivityEligibility; dashboardOverview: DashboardOverview }) {
  const router = useRouter()
  const pathname = usePathname()
  const activeSection = getDashboardSectionFromPath(pathname) ?? initialSection
  const navGroups = publisherNavGroups
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [coinMenuOpen, setCoinMenuOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl || DEFAULT_PROFILE_AVATAR)
  const [activeCoin, setActiveCoin] = useState<WalletCoinSymbol>('HOMERO')
  const balancesAtomic = dashboardOverview.balancesAtomic
  const walletBalances: Record<WalletCoinSymbol, number> = {
    HOMERO: balancesAtomic.HOMERO / atomicUnitsPerToken,
    PEPE: balancesAtomic.PEPE / atomicUnitsPerToken,
  }
  const balance = walletBalances[activeCoin]
  const [notice, setNotice] = useState('')

  async function handleSignOut() {
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setNotice('Could not sign out. Please try again.')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setNotice('Could not sign out. Please try again.')
    }
  }

  function navigateTo(label: string) {
    const destination = dashboardSectionPaths[label as DashboardSection]
    if (!destination) {
      showComingSoon(label)
      return
    }

    router.push(destination)
    setDrawerOpen(false)
    setCoinMenuOpen(false)
  }

  function showComingSoon(label: string) {
    setNotice(`${label} will be added when you send that category.`)
    window.setTimeout(() => setNotice(''), 2800)
  }

  return (
    <LocalizedTree>
    <div className="cartoon-dashboard min-h-screen w-full min-w-0 overflow-x-clip bg-background text-foreground transition-colors duration-200">
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-slate-950/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r-2 border-violet-200/70 bg-[#fffaf0] shadow-[8px_0_35px_rgba(36,28,94,0.08)] transition-transform duration-300 dark:border-violet-300/20 dark:bg-[#151b3b] dark:shadow-[8px_0_35px_rgba(3,8,30,0.24)] ${drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="flex items-center justify-between border-b border-violet-200/70 px-5 py-4 dark:border-violet-300/15">
          <a href="#top" className="flex items-center" aria-label="pepe.casa home">
            <PepeCasaLogo size={36} textClassName="text-lg text-slate-900 dark:text-white" />
          </a>
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"><X size={18} /></button>
        </div>

        <nav className="sidebar-scrollbar-hidden flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-violet-600 dark:text-cyan-300">{group.title}</h2>
              <div className="space-y-1">
                {group.links.map((link) => {
                  const { label, icon: Icon } = link
                  const badge = link.badge
                  const sectionKey = link.section ?? label as DashboardSection
                  const active = activeSection === sectionKey
                  return <Link
                    key={label}
                    href={dashboardSectionPaths[sectionKey as DashboardSection]}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => { setDrawerOpen(false); setCoinMenuOpen(false) }}
                    className={`${navItemClassName} justify-between ${active ? 'border-cyan-100/40 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 font-black text-white shadow-lg shadow-indigo-950/30' : 'text-slate-600 hover:text-violet-700 dark:text-slate-300 dark:hover:text-white'}`}
                  >
                    <span aria-hidden="true" className={`${navEdgeClassName} left-0.5`} />
                    <span aria-hidden="true" className={`${navEdgeClassName} right-0.5`} />
                    <span className="relative flex items-center gap-3"><Icon size={15} /><span>{label === 'Swap' ? 'TOKEN EXCHANGE' : label}</span></span>
                    {badge && <span className={`relative rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-colors group-hover:bg-amber-300/15 ${badge === 'return' || badge === '10%' || /^[0-9]+$/.test(badge) ? 'bg-amber-300 text-indigo-950' : 'bg-cyan-300 text-indigo-950'}`}>{badge}</span>}
                  </Link>
                })}
              </div>
            </section>
          ))}
          <section>
            <h2 className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-violet-600 dark:text-cyan-300">Support</h2>
            <Link href={dashboardSectionPaths['Contact support']} aria-current={activeSection === 'Contact support' ? 'page' : undefined} onClick={() => setDrawerOpen(false)} className={`${navItemClassName} justify-start gap-3 ${activeSection === 'Contact support' ? 'border-l-[3px] border-blue-500 bg-blue-50 font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
              <span aria-hidden="true" className={`${navEdgeClassName} left-0.5`} />
              <span aria-hidden="true" className={`${navEdgeClassName} right-0.5`} />
              <span className="relative flex items-center gap-3"><CircleHelp size={15} />Contact support</span>
            </Link>
          </section>
        </nav>

        <div className="flex items-center gap-3 border-t-2 border-violet-200/70 bg-[#fff3d9] px-4 py-4 dark:border-violet-300/15 dark:bg-[#111833]">
          <PepeCasaAvatar size={40} src={avatarUrl} />
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold" title={email}>{name || email}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-blue-500">{email}</div></div>
          <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-rose-500 dark:hover:bg-slate-800"><LogOut size={15} /></button>
        </div>
      </aside>

      <div className="min-w-0 md:ml-[286px]">
      <header className="sticky top-0 z-30 flex h-[62px] min-w-0 items-center justify-between border-b-2 border-violet-200/70 bg-[#fffaf0]/90 px-4 backdrop-blur-xl dark:border-violet-300/15 dark:bg-[#141b3b]/90 sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" aria-label="Open navigation menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"><Menu size={19} /></button>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <div className="relative">
            <button type="button" onClick={() => setCoinMenuOpen((open) => !open)} aria-label="Select active coin" aria-expanded={coinMenuOpen} className="flex w-[clamp(7rem,35vw,14rem)] min-w-0 items-center justify-between gap-2 rounded-2xl border-2 border-violet-200 bg-white px-2.5 py-2 shadow-sm shadow-violet-950/5 dark:border-violet-300/25 dark:bg-[#222d58] sm:w-56">
              <span className="flex min-w-0 items-center gap-2">
                <TokenLogo symbol={activeCoin} size={20} />
                <span className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[10px] font-bold sm:text-xs"><span className="truncate">{walletBalances[activeCoin].toFixed(8)}</span><span className="shrink-0 text-slate-500 dark:text-slate-300">{activeCoin}</span></span>
              </span>
              <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${coinMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {coinMenuOpen && <div role="group" aria-label="Select active coin" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border-2 border-violet-200 bg-[#fffaf0] p-2 shadow-2xl shadow-indigo-950/20 dark:border-violet-300/25 dark:bg-[#1a2347]">
              <p className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Select active coin</p>
              {walletAssets.map((asset) => <button key={asset.symbol} type="button" aria-pressed={activeCoin === asset.symbol} onClick={() => { setActiveCoin(asset.symbol); setCoinMenuOpen(false) }} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition ${activeCoin === asset.symbol ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <span className="flex items-center gap-2"><TokenLogo symbol={asset.symbol} size={24} /><span className="text-[10px] font-extrabold">{asset.symbol}</span></span>
                <span className="font-mono text-[9px] font-bold">{walletBalances[asset.symbol].toFixed(8)}</span>
              </button>)}
            </div>}
          </div>
          <LanguageSwitcher />
          <button type="button" aria-label="Open account settings" onClick={() => navigateTo('Security & Wallets')} className="inline-flex rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"><PepeCasaAvatar size={40} src={avatarUrl} /></button>
        </div>
      </header>

      <div className="min-w-0">
      {activeSection === 'Dashboard' ? <DashboardPage overview={dashboardOverview} balance={balance} coin={activeCoin} onNavigate={navigateTo} /> : activeSection === 'My Wallet' ? <WalletPage balances={walletBalances} activeCoin={activeCoin} onSelectCoin={setActiveCoin} onNavigate={navigateTo} /> : activeSection === 'Swap' ? <SwapPage /> : activeSection === 'Withdraw' ? <WithdrawPage balance={walletBalances.PEPE} /> : activeSection === 'Arcade' ? <ArcadePage /> : activeSection === 'Wheel of Fortune' ? <WheelOfFortunePage /> : activeSection === 'Weekly Leaderboard' ? <ArcadeWeeklyLeaderboardPage /> : activeSection === 'View Ads' ? <ViewAdsPage /> : activeSection === 'Shortlinks' ? <ShortlinksPage /> : activeSection === 'Offerwall' ? <AdsLabOfferwallPage userId={guestProfileId} /> : activeSection === 'Referrals' ? <ReferralsPage referralOverview={referralOverview} /> : activeSection === 'Promo Code' ? <PromoCodePage initialClaims={promoClaims} activity={promoActivity} /> : activeSection === 'Security & Wallets' ? <AccountSettingsPage name={name} email={email} avatarSrc={avatarUrl} onAvatarChange={setAvatarUrl} /> : <main id="top" className="dashboard-page-shell space-y-5">
        <header>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Account section</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">{activeSection}</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">This section is being prepared.</p>
        </header>
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111a2b] sm:p-7">
          <h2 className="text-sm font-extrabold">Coming soon</h2>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">This page has its own address and is available only after signing in.</p>
        </section>
      </main>}
        </div>
      </div>

      <BannerRewardPromo />
      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-xs font-semibold text-white shadow-xl"><span className="inline-flex items-center gap-1.5">{notice.includes('HOMERO') && <HomeroTokenLogo size={14} />}{notice}</span></div>}


    </div>
    </LocalizedTree>
  )
}
