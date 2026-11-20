'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { AlertTriangle, Award, Crown, Flame, Gamepad2, LoaderCircle, Sparkles, Zap } from 'lucide-react'
import { PepeTokenLogo } from '@/components/pepe-token-logo'
import { AdminPanel, DailyRewardsPanel, HeroScene, TasksPanel } from './game-dashboard-panels'
import type { PepeVerseAdminOverview, PepeVerseState, VerseTab } from './types'

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'Could not load PEPE VERSE.')
  return payload as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'The request could not be completed.')
  return payload as T
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'The settings could not be saved.')
  return payload as T
}

function formatBalance(atomic: string) {
  const amount = Number(BigInt(atomic)) / 100_000_000
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(amount)
}

export function PepeVersePage({ isAdmin, onWalletBalanceRefresh }: { isAdmin: boolean; onWalletBalanceRefresh: () => void }) {
  const { mutate: mutateGlobal } = useSWRConfig()
  const { data, error, isLoading, mutate } = useSWR<PepeVerseState>('/api/pepe-verse/state', getJson, { refreshInterval: 20_000, revalidateOnFocus: true })
  const { data: adminData, mutate: mutateAdmin } = useSWR<PepeVerseAdminOverview>(isAdmin ? '/api/pepe-verse/admin' : null, getJson)
  const [tab, setTab] = useState<VerseTab>('home')
  const [busy, setBusy] = useState<string | null>(null)

  const refreshBalance = async () => {
    await mutate()
    await mutateGlobal('/api/account/balances')
    onWalletBalanceRefresh()
  }

  const claim = async (kind: 'daily' | 'task' | 'tournament', code?: string) => {
    const key = kind === 'task' ? code ?? 'task' : kind
    setBusy(key)
    try {
      const result = await postJson<{ amount: number; rewardDay?: number; place?: number; unlockedSkin?: string }>('/api/pepe-verse/claim', { kind, ...(code ? { code } : {}) })
      if (kind === 'tournament') toast.success(`Place #${result.place} prize: +${result.amount} PEPE`)
      else toast.success(`Reward claimed: +${result.amount} PEPE`)
      if (result.unlockedSkin) toast(`New skin unlocked: ${result.unlockedSkin}`)
      await refreshBalance()
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Could not claim the reward.')
    } finally {
      setBusy(null)
    }
  }

  const buySkin = async (skinId: string) => {
    setBusy(skinId)
    try {
      const result = await postJson<{ coins: number; skinId: string }>('/api/pepe-verse/shop', { skinId })
      toast.success(`${result.skinId.replaceAll('-', ' ')} is ready`)
      await mutate()
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Could not update your character.')
    } finally {
      setBusy(null)
    }
  }

  const saveSettings = async (settings: Omit<PepeVerseAdminOverview, 'totalRewards' | 'totalRewardAtomic' | 'transactions'>) => {
    await patchJson('/api/pepe-verse/admin', settings)
    await Promise.all([mutateAdmin(), mutate()])
    toast.success('PEPE VERSE settings saved.')
  }

  if (isLoading) return <main className="min-h-[calc(100vh-62px)] bg-[#040c24] p-5 text-white"><div className="flex min-h-72 items-center justify-center gap-3 text-sm text-cyan-100"><LoaderCircle className="animate-spin" />Loading your PEPE VERSE profile…</div></main>
  if (error || !data) return <main className="min-h-[calc(100vh-62px)] bg-[#040c24] p-4 text-white sm:p-6"><div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4 text-sm"><AlertTriangle className="mt-0.5 shrink-0 text-rose-200" /><div><h1 className="font-black">PEPE VERSE is unavailable</h1><p className="mt-1 text-xs leading-5 text-rose-100/80">{error instanceof Error ? error.message : 'The game could not load.'}</p><button type="button" onClick={() => void mutate()} className="mt-3 rounded-lg border border-rose-100/20 px-3 py-1.5 text-xs font-bold hover:bg-white/10">Try again</button></div></div></main>

  const current = data.tournament.current.find((entry) => entry.isCurrentUser)
  const xpProgress = data.profile.xp % 100
  const tabView = tab === 'admin' && isAdmin
    ? <AdminPanel initial={adminData} onSave={saveSettings} />
    : null

  return (
    <main id="top" className="min-h-[calc(100vh-62px)] overflow-hidden bg-[#040c24] px-3 py-3 text-white sm:px-4 sm:py-4">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3">
        <header className="relative flex min-h-[126px] items-center justify-between overflow-hidden rounded-[24px] border border-cyan-300/45 bg-[radial-gradient(ellipse_at_78%_45%,rgba(153,35,255,0.58),transparent_34%),radial-gradient(ellipse_at_40%_120%,rgba(0,174,255,0.45),transparent_56%),linear-gradient(110deg,#061841,#091354_55%,#180b47)] px-5 py-5 shadow-[0_0_28px_rgba(0,177,255,0.23)] sm:px-8">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(135deg,transparent_45%,rgba(75,200,255,.45)_45.2%,transparent_45.6%),linear-gradient(20deg,transparent_54%,rgba(151,87,255,.5)_54.2%,transparent_54.5%)]" />
          <div className="relative flex items-center gap-4"><div className="grid size-14 place-items-center rounded-2xl border border-fuchsia-300/60 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_25px_rgba(211,46,255,0.34)]"><Gamepad2 size={34} aria-hidden="true" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Play · Earn · Level up</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white drop-shadow-[0_0_12px_rgba(30,180,255,0.45)] sm:text-4xl">PEPE VERSE</h1></div></div>
          <div className="relative hidden max-w-[310px] text-right sm:block"><p className="text-lg font-black leading-tight text-amber-200">Enter the PEPE Universe</p><p className="text-sm font-bold text-emerald-200">Earn rewards. Build your legend.</p></div>
          <div className="relative hidden h-24 w-24 shrink-0 sm:block"><PepeTokenLogo size={84} /></div>
        </header>

        {!data.enabled && <div role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-bold text-amber-100">PEPE VERSE reward claims are temporarily paused.</div>}

        <section aria-label="Player statistics" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/35 bg-[#071534] px-3 py-2.5"><span className="grid size-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><PepeTokenLogo size={25} /></span><div className="min-w-0"><p className="truncate text-[9px] font-black uppercase tracking-wider text-slate-400">PEPE balance</p><p className="truncate text-sm font-black text-white">{formatBalance(data.balanceAtomic)} <span className="text-[10px] text-emerald-200">PEPE</span></p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300/35 bg-[#071534] px-3 py-2.5"><span className="grid size-9 place-items-center rounded-xl bg-amber-400/15 text-amber-300"><Zap size={21} fill="currentColor" /></span><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Level {data.profile.level}</p><p className="text-xs font-black text-white">{xpProgress} / 100 XP</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-300/35 bg-[#071534] px-3 py-2.5"><span className="grid size-9 place-items-center rounded-xl bg-violet-400/15 text-violet-300"><Sparkles size={21} /></span><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Experience</p><p className="text-xs font-black text-white">{data.profile.xp.toLocaleString()} XP</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/35 bg-[#071534] px-3 py-2.5"><span className="grid size-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><Flame size={21} /></span><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Weekly rank</p><p className="text-xs font-black text-white">{current ? `#${current.rank} · ${current.score} XP` : 'Unranked'}</p></div></div>
        </section>

        <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(245px,.92fr)_minmax(335px,1.12fr)_minmax(300px,1.08fr)]">
          <DailyRewardsPanel state={data} busy={busy === 'daily'} onClaim={() => void claim('daily')} />
          {tabView ? <section className="flex min-h-[490px] items-start justify-center rounded-[22px] border border-cyan-400/35 bg-[#071534]/90 p-4 shadow-[0_0_24px_rgba(0,194,255,0.10)]"><AdminPanel initial={adminData} onSave={saveSettings} /></section> : <HeroScene state={data} tab={tab} onTabChange={setTab} onShop={buySkin} busy={busy !== null} isAdmin={isAdmin} />}
          <TasksPanel state={data} busy={busy} onClaim={(code) => code === 'tournament' ? void claim('tournament') : void claim('task', code)} />
        </div>

        <section aria-label="Achievements" className="grid gap-2 rounded-2xl border border-violet-300/25 bg-[#071534]/85 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.achievements.map((achievement) => <div key={achievement.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${achievement.unlocked ? 'bg-amber-300/10 text-amber-100' : 'bg-white/[0.025] text-slate-400'}`}><Award size={17} className={achievement.unlocked ? 'text-amber-300' : 'text-slate-500'} /><div className="min-w-0"><p className="truncate text-[10px] font-black">{achievement.title}</p><p className="truncate text-[9px]">{achievement.description}</p></div>{achievement.unlocked && <Crown size={14} className="ml-auto text-amber-300" />}</div>)}
        </section>
      </div>
    </main>
  )
}
