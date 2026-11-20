'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, ChevronRight, CircleUserRound, Coins, Gift, Heart, LockKeyhole, Medal, RefreshCw, Shield, ShoppingBag, Sparkles, Star, Trophy, Zap } from 'lucide-react'
import type { PepeVerseAdminOverview, PepeVerseState, VerseTab } from './types'

const panelClass = 'rounded-[22px] border border-cyan-400/35 bg-[#071534]/90 shadow-[0_0_24px_rgba(0,194,255,0.10)]'
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-black text-white shadow-[0_0_18px_rgba(50,140,255,0.35)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50'

export function DailyRewardsPanel({ state, busy, onClaim }: { state: PepeVerseState; busy: boolean; onClaim: () => void }) {
  return (
    <section className={`${panelClass} flex h-full flex-col p-4 sm:p-5`} aria-labelledby="verse-daily-title">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/50 bg-cyan-300/10 text-cyan-200 shadow-[0_0_16px_rgba(0,220,255,0.16)]"><Gift size={24} aria-hidden="true" /></span>
        <div>
          <h2 id="verse-daily-title" className="text-lg font-black leading-tight text-white sm:text-xl">Your daily reward</h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">Claim your bonus, boost your abilities, and keep your streak alive.</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2 text-center">
        <span className="text-2xl font-black text-white">{state.daily.streak || 1}</span>
        <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-200">day streak</span>
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-4" aria-label="Seven-day reward calendar">
        {state.daily.rewards.map((reward, index) => {
          const day = index + 1
          const claimed = state.daily.claimedDays[index]
          const active = day === state.daily.nextDay && state.daily.canClaim
          return (
            <li key={day} className={`min-h-[72px] rounded-xl border px-1.5 py-2 text-center ${active ? 'border-cyan-300 bg-cyan-400/15 text-cyan-50 shadow-[0_0_14px_rgba(0,220,255,0.16)]' : claimed ? 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-slate-300'}`}>
              <span className="block text-[9px] font-black uppercase tracking-wider">Day {day}</span>
              <span className="mt-1 inline-flex items-center justify-center gap-1 text-xs font-extrabold"><Coins size={13} className="text-amber-300" aria-hidden="true" />{reward}</span>
              <span className="block text-[9px] font-semibold text-white/55">{day === 7 ? 'bonus skin' : 'PEPE'}</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-auto pt-4">
        <button type="button" className={`${buttonClass} w-full`} disabled={!state.daily.canClaim || busy || !state.enabled || state.dailyClaimsRemaining <= 0} onClick={onClaim}>
          {state.daily.canClaim ? <><Gift size={15} aria-hidden="true" /> Claim day {state.daily.nextDay}</> : <><Check size={15} aria-hidden="true" /> Claimed today</>}
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-400">{state.dailyClaimsRemaining} of {state.dailyLimit} reward claims left today · resets at 00:00 UTC</p>
      </div>
    </section>
  )
}

export function HeroScene({ state, tab, onTabChange, onShop, busy, isAdmin }: {
  state: PepeVerseState
  tab: VerseTab
  onTabChange: (tab: VerseTab) => void
  onShop: (skinId: string) => void
  busy: boolean
  isAdmin: boolean
}) {
  const tabs: { id: VerseTab; label: string; icon: typeof Gift }[] = [
    { id: 'home', label: 'Home', icon: Sparkles },
    { id: 'tasks', label: 'Tasks', icon: Check },
    { id: 'shop', label: 'Shop', icon: ShoppingBag },
    { id: 'board', label: 'Board', icon: Medal },
    { id: 'powerups', label: 'Power ups', icon: Zap },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: Shield }] : []),
  ]

  return (
    <section className={`${panelClass} relative flex min-h-[490px] flex-col overflow-hidden`} aria-label="PEPE VERSE game hub">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_44%,rgba(0,138,255,0.28),transparent_55%),radial-gradient(ellipse_at_16%_88%,rgba(141,36,255,0.19),transparent_45%),linear-gradient(180deg,#081944_0%,#071330_58%,#080d28_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(1px_1px_at_20%_20%,#a5f3fc_0,transparent_1px),radial-gradient(1px_1px_at_78%_32%,#c4b5fd_0,transparent_1px),radial-gradient(2px_2px_at_58%_18%,#fff_0,transparent_1px),radial-gradient(1px_1px_at_36%_65%,#67e8f9_0,transparent_1px)] [background-size:120px_110px]" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-200">Neon district · Sector 07</p><h2 className="mt-1 text-xl font-black text-white">{tab === 'home' ? 'Your hero awaits' : tab === 'tasks' ? 'Mission control' : tab === 'shop' ? 'Skin lab' : tab === 'board' ? 'Season standings' : tab === 'powerups' ? 'Power up' : 'Game settings'}</h2></div>
        <div className="rounded-full border border-cyan-300/35 bg-black/25 px-3 py-1.5 text-[10px] font-bold text-cyan-100"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#34d399]" /> LIVE SEASON</div>
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-3 py-2">
        {tab === 'home' && <div className="relative flex min-h-[340px] w-full max-w-[500px] items-center justify-center">
          <div className="absolute bottom-5 left-1/2 h-16 w-[76%] -translate-x-1/2 rounded-[50%] border-2 border-cyan-300/90 bg-blue-400/10 shadow-[0_0_26px_rgba(0,211,255,0.72),inset_0_0_20px_rgba(78,105,255,0.45)] [transform:translateX(-50%)_perspective(180px)_rotateX(63deg)]" />
          <div className="absolute bottom-6 left-1/2 h-9 w-[64%] -translate-x-1/2 rounded-[50%] border border-violet-300/70 bg-violet-500/15 shadow-[0_0_22px_rgba(168,85,247,0.42)] [transform:translateX(-50%)_perspective(180px)_rotateX(63deg)]" />
          <Image src="/images/pepe-verse-hero.png" alt="PEPE VERSE neon explorer wearing a glowing visor" fill priority sizes="(max-width: 900px) 80vw, 400px" className="z-10 !h-[340px] !w-auto object-contain drop-shadow-[0_0_20px_rgba(0,195,255,0.5)] [animation:verse-float_4s_ease-in-out_infinite]" />
          <div className="absolute left-0 top-1/4 rounded-2xl border border-cyan-300/50 bg-[#081a43]/90 px-3 py-2 text-center shadow-[0_0_18px_rgba(0,210,255,0.18)]"><span className="block text-[9px] font-black uppercase text-cyan-100">Life</span><span className="mt-1 flex gap-0.5 text-rose-400"><Heart size={14} fill="currentColor" /><Heart size={14} fill="currentColor" /><Heart size={14} fill="currentColor" /></span><span className="text-[10px] font-bold text-white">3 / 3</span></div>
          <div className="absolute right-0 top-[28%] rounded-2xl border border-blue-300/50 bg-[#081a43]/90 px-3 py-2 text-center shadow-[0_0_18px_rgba(0,150,255,0.2)]"><span className="block text-[9px] font-black uppercase text-blue-100">Stamina</span><Zap size={18} className="mx-auto my-1 text-amber-300" fill="currentColor" /><span className="text-[10px] font-bold text-white">{state.profile.stamina} / 40</span></div>
          <div className="absolute bottom-12 left-1 rounded-2xl border border-violet-300/50 bg-[#081a43]/90 px-3 py-2 text-center"><span className="block text-[9px] font-black uppercase text-violet-100">Bonus</span><Star size={18} className="mx-auto my-1 text-amber-300" fill="currentColor" /><span className="text-[10px] font-bold text-white">XP ×{state.profile.level}</span></div>
          <div className="absolute bottom-10 right-1 rounded-2xl border border-fuchsia-300/50 bg-[#081a43]/90 px-3 py-2 text-center"><span className="block text-[9px] font-black uppercase text-fuchsia-100">Boost</span><Zap size={18} className="mx-auto my-1 text-fuchsia-300" fill="currentColor" /><span className="text-[10px] font-bold text-white">+{state.profile.energy}%</span></div>
        </div>}
        {tab === 'tasks' && <div className="grid w-full max-w-[420px] grid-cols-2 gap-3">{state.tasks.map((task) => <div key={task.code} className="rounded-2xl border border-cyan-300/25 bg-[#081a43]/75 p-4"><Check size={17} className="text-cyan-300" /><p className="mt-3 text-sm font-black text-white">{task.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-300">{task.description}</p><p className="mt-3 text-[10px] font-bold text-cyan-200">Verified activity only</p></div>)}</div>}
        {tab === 'shop' && <div className="grid w-full max-w-[500px] grid-cols-2 gap-2 sm:grid-cols-4">{state.skins.map((skin) => <article key={skin.id} className={`rounded-2xl border p-3 text-center ${skin.equipped ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/15 bg-[#081a43]/80'}`}><div className={`mx-auto grid size-14 place-items-center rounded-2xl border ${skin.color === 'violet' ? 'border-violet-300/50 bg-violet-500/20 text-violet-200' : skin.color === 'amber' ? 'border-amber-300/50 bg-amber-500/20 text-amber-200' : skin.color === 'emerald' ? 'border-emerald-300/50 bg-emerald-500/20 text-emerald-200' : 'border-cyan-300/50 bg-cyan-500/20 text-cyan-200'}`}><CircleUserRound size={28} /></div><p className="mt-2 text-xs font-black text-white">{skin.name}</p><p className="mt-1 text-[10px] text-slate-300">{skin.owned ? skin.equipped ? 'Equipped' : 'Owned' : `${skin.cost} game credits`}</p><button type="button" disabled={busy || (!skin.owned && state.profile.coins < skin.cost)} onClick={() => onShop(skin.id)} className="mt-2 rounded-lg border border-white/20 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/10 disabled:opacity-40">{skin.equipped ? 'Selected' : skin.owned ? 'Equip' : 'Unlock'}</button></article>)}</div>}
        {tab === 'board' && <div className="w-full max-w-[430px] rounded-2xl border border-cyan-300/20 bg-[#071735]/90 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-white">This week</h3><span className="text-[10px] text-cyan-200">XP standings</span></div>{state.tournament.current.length ? state.tournament.current.slice(0, 5).map((entry) => <div key={`${entry.rank}-${entry.name}`} className={`flex items-center gap-3 border-t border-white/10 py-2.5 ${entry.isCurrentUser ? 'text-cyan-100' : 'text-slate-200'}`}><span className="w-7 font-black text-violet-200">#{entry.rank}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{entry.name}{entry.isCurrentUser ? ' · you' : ''}</span><span className="text-xs font-black tabular-nums">{entry.score} XP</span></div>) : <p className="py-6 text-center text-sm text-slate-400">Earn verified PEPE VERSE XP to enter this week&apos;s board.</p>}</div>}
        {tab === 'powerups' && <div className="grid w-full max-w-[450px] gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4"><Zap className="text-amber-300" /><h3 className="mt-3 font-black text-white">Energy core</h3><p className="mt-1 text-xs text-slate-300">{state.profile.energy}% charge · restored by returning to the Verse.</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${state.profile.energy}%` }} /></div></div><div className="rounded-2xl border border-violet-300/30 bg-violet-300/[0.06] p-4"><Shield className="text-violet-300" /><h3 className="mt-3 font-black text-white">Stamina shield</h3><p className="mt-1 text-xs text-slate-300">{state.profile.stamina}/40 reserve · cosmetic upgrades never spend PEPE.</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500" style={{ width: `${Math.min(100, (state.profile.stamina / 40) * 100)}%` }} /></div></div></div>}
      </div>
      <nav aria-label="PEPE VERSE game navigation" className="relative z-10 flex flex-wrap items-center justify-center gap-2 border-t border-cyan-300/20 bg-[#030b20]/65 px-3 py-3">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => onTabChange(id)} className={`inline-flex min-w-[74px] flex-col items-center gap-1 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:min-w-[84px] ${tab === id ? 'border-cyan-200/70 bg-cyan-400/15 text-cyan-100 shadow-[0_0_14px_rgba(0,210,255,0.18)]' : 'border-white/10 text-slate-300 hover:border-violet-300/50 hover:text-white'}`}><Icon size={17} aria-hidden="true" />{label}</button>)}
      </nav>
    </section>
  )
}

export function TasksPanel({ state, busy, onClaim }: { state: PepeVerseState; busy: string | null; onClaim: (code: string) => void }) {
  return (
    <section className={`${panelClass} flex flex-col p-4 sm:p-5`} aria-labelledby="verse-tasks-title">
      <div className="flex items-center justify-between gap-2"><h2 id="verse-tasks-title" className="text-lg font-black text-white sm:text-xl">Tasks list</h2><RefreshCw size={18} className="text-cyan-200" aria-hidden="true" /></div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-cyan-300/25 bg-[#030b20]/80 p-1"><span className="rounded-lg bg-cyan-400/15 px-3 py-2 text-xs font-black text-cyan-100">Daily tasks <span className="ml-1 rounded-md bg-violet-600 px-1.5 py-0.5 text-white">{state.tasks.length}</span></span><span className="px-3 text-xs font-bold text-slate-400">Missions <span className="ml-1 rounded-md bg-white/10 px-1.5 py-0.5">{state.profile.achievements.length}</span></span></div>
      <div className="mt-3 flex flex-col gap-2">
        {state.tasks.map((task, index) => {
          const done = task.progress >= task.target
          return <article key={task.code} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#0a1b42] to-[#07122f] p-3">
            <div className={`grid size-11 shrink-0 place-items-center rounded-xl border ${done ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>{index === 0 ? <Gift size={18} /> : index === 1 ? <Zap size={18} /> : index === 2 ? <ChevronRight size={18} /> : <Sparkles size={18} />}</div>
            <div className="min-w-0 flex-1"><Link href={task.href} className="truncate text-xs font-extrabold text-white hover:text-cyan-200 focus-visible:outline-none focus-visible:underline">{task.title}</Link><p className="mt-0.5 truncate text-[10px] text-slate-300">{task.description}</p><p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-200"><Coins size={12} /> {task.reward} PEPE</p></div>
            <button type="button" className={`${buttonClass} shrink-0 px-3 py-2`} disabled={!done || task.claimed || busy !== null || !state.enabled || state.dailyClaimsRemaining <= 0} onClick={() => onClaim(task.code)}>{busy === task.code ? '...' : task.claimed ? <><Check size={14} />Claimed</> : done ? 'Claim' : <><LockKeyhole size={13} />Verify</>}</button>
          </article>
        })}
      </div>
      <p className="mt-3 rounded-xl border border-cyan-200/10 bg-cyan-100/[0.035] px-3 py-2 text-[10px] leading-4 text-slate-400">Rewards unlock only after pepe.casa records a successful, verified activity. Clicking a task alone never earns PEPE.</p>
      <TournamentPanel state={state} busy={busy === 'tournament'} onClaim={() => onClaim('tournament')} />
    </section>
  )
}

export function TournamentPanel({ state, busy, onClaim }: { state: PepeVerseState; busy: boolean; onClaim: () => void }) {
  const self = state.tournament.current.find((entry) => entry.isCurrentUser)
  const canClaim = state.tournament.canClaim
  return <section className="mt-3 overflow-hidden rounded-2xl border border-violet-300/35 bg-[radial-gradient(ellipse_at_100%_0%,rgba(168,85,247,0.32),transparent_55%),linear-gradient(110deg,#19104b,#101a47_60%,#34124f)] p-3" aria-label="Weekly tournament">
    <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300"><Trophy size={24} /></span><div className="min-w-0 flex-1"><h3 className="text-xs font-black uppercase text-white">Weekly tournament</h3><p className="mt-1 text-[10px] text-fuchsia-200">Top rewards: {state.tournament.prizes.join(' · ')} PEPE</p></div><button type="button" className="rounded-xl border border-fuchsia-300/50 bg-violet-600 px-3 py-2 text-[10px] font-black text-white hover:bg-violet-500 disabled:opacity-50" disabled={!canClaim || busy || !state.enabled} onClick={onClaim}>{busy ? '...' : 'Claim prize'}</button></div>
    <p className="mt-2 text-[10px] text-white/65">This week: {self ? `rank #${self.rank} · ${self.score} XP` : 'earn XP from verified tasks to join'} · your score is server-recorded.</p>
  </section>
}

export function AdminPanel({ initial, onSave }: { initial: PepeVerseAdminOverview | undefined; onSave: (values: Omit<PepeVerseAdminOverview, 'totalRewards' | 'totalRewardAtomic' | 'transactions'>) => Promise<void> }) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [daily, setDaily] = useState(initial?.dailyRewards ?? [20, 30, 20, 40, 50, 25, 75])
  const [tasks, setTasks] = useState(initial?.taskRewards ?? { faucet: 10, ptc: 10, shortlink: 10, watch: 10, invite: 15 })
  const [prizes, setPrizes] = useState(initial?.tournamentPrizes ?? [100, 50, 25])
  const [limit, setLimit] = useState(initial?.dailyLimit ?? 5)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!initial) return
    setEnabled(initial.enabled)
    setDaily(initial.dailyRewards)
    setTasks(initial.taskRewards)
    setPrizes(initial.tournamentPrizes)
    setLimit(initial.dailyLimit)
  }, [initial])

  const save = async () => {
    setSaving(true)
    setSaved('')
    try {
      await onSave({ enabled, dailyRewards: daily, taskRewards: tasks, tournamentPrizes: prizes, dailyLimit: limit })
      setSaved('Settings saved securely.')
    } catch (error) {
      setSaved(error instanceof Error ? error.message : 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="w-full max-w-2xl rounded-2xl border border-cyan-300/25 bg-[#071735]/90 p-4 text-white sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Restricted controls</p><h3 className="mt-1 text-lg font-black">PEPE VERSE settings</h3></div><div className="text-right"><p className="text-[10px] text-slate-400">Total rewards issued</p><p className="text-sm font-black text-amber-200">{initial?.totalRewardAtomic ? (Number(initial.totalRewardAtomic) / 100_000_000).toLocaleString() : '0'} PEPE</p></div></div>
    <label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-cyan-400" /> Enable PEPE VERSE claims</label>
    <fieldset className="mt-4"><legend className="text-xs font-black text-cyan-100">Daily PEPE · 7-day schedule</legend><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{daily.map((value, index) => <label key={index} className="text-[9px] font-bold text-slate-300">Day {index + 1}<input aria-label={`Day ${index + 1} reward`} type="number" min={0} max={1000} value={value} onChange={(event) => setDaily((old) => old.map((item, i) => i === index ? Number(event.target.value) : item))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-white" /></label>)}</div></fieldset>
    <fieldset className="mt-4"><legend className="text-xs font-black text-cyan-100">Task rewards · PEPE</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(tasks).map(([code, value]) => <label key={code} className="text-[10px] font-bold capitalize text-slate-300">{code}<input aria-label={`${code} task reward`} type="number" min={0} max={1000} value={value} onChange={(event) => setTasks((old) => ({ ...old, [code]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-white" /></label>)}</div></fieldset>
    <fieldset className="mt-4"><legend className="text-xs font-black text-cyan-100">Weekly tournament prizes · PEPE</legend><div className="mt-2 grid grid-cols-3 gap-2">{prizes.map((value, index) => <label key={index} className="text-[10px] font-bold text-slate-300">Place {index + 1}<input aria-label={`Place ${index + 1} prize`} type="number" min={0} max={10000} value={value} onChange={(event) => setPrizes((old) => old.map((item, i) => i === index ? Number(event.target.value) : item))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-white" /></label>)}</div></fieldset>
    <label className="mt-4 flex max-w-xs flex-col gap-1 text-[10px] font-bold text-slate-300">Maximum daily game claims<input type="number" min={1} max={20} value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-white" /></label>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={buttonClass} onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>{saved && <p className="text-xs text-cyan-100" role="status">{saved}</p>}</div>
    <p className="mt-3 text-[10px] leading-4 text-slate-400">All changes are validated server-side. Reward credits go to the existing PEPE ledger; XP, coins, and skins stay separate from withdrawable PEPE.</p>
  </div>
}
