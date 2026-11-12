'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { BadgeCheck, Check, Copy, LockKeyhole, UserRound } from 'lucide-react'
import { AccountSecurityPanel } from '@/components/account-security-panel'
import { PepeCasaAvatar } from '@/components/pepecasa-avatar'
import { LocalizedTree } from '@/components/site-language-provider'
import { getAvailableProfileAvatars, type ProfileAvatarSrc } from '@/lib/profile-avatars'

type SettingsTab = 'profile' | 'security'

const tabs: { id: SettingsTab; label: string; icon: typeof UserRound }[] = [
  { id: 'profile', label: 'My Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: LockKeyhole },
]

export function AccountSettingsPage({ name, email, avatarSrc, isAdmin, onAvatarChange }: { name: string; email: string; avatarSrc: ProfileAvatarSrc; isAdmin: boolean; onAvatarChange: (avatarSrc: ProfileAvatarSrc) => void }) {
  const availableAvatars = getAvailableProfileAvatars(isAdmin)
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [copyStatus, setCopyStatus] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [savingAvatar, setSavingAvatar] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email)
      setCopyStatus('Email copied.')
    } catch {
      setCopyStatus('Clipboard access is unavailable in this browser.')
    }
  }

  async function saveAvatar(nextAvatar: ProfileAvatarSrc) {
    if (savingAvatar) return

    setSavingAvatar(true)
    setAvatarStatus('')
    try {
      const response = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: nextAvatar }),
        cache: 'no-store',
      })
      const result: { image?: unknown } | null = await response.json().catch(() => null)
      if (!response.ok || result?.image !== nextAvatar) throw new Error('Avatar save failed.')

      onAvatarChange(nextAvatar)
      setAvatarStatus('Avatar saved.')
    } catch {
      setAvatarStatus('Could not save avatar. Please try again.')
    } finally {
      setSavingAvatar(false)
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length
    setActiveTab(tabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell flex flex-col gap-5">
      <header>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Profile settings</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">Account settings</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Manage your signed-in account and profile information.</p>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-blue-500/15 bg-gradient-to-r from-blue-500/[0.10] via-white to-slate-50 p-6 shadow-sm dark:border-blue-500/20 dark:from-blue-500/[0.12] dark:via-[#111a2b] dark:to-[#142137] sm:p-7">
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <PepeCasaAvatar size={64} src={avatarSrc} className="border-2 border-blue-500/25 shadow-lg shadow-blue-950/15" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-black tracking-tight">{name || email}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-bold text-blue-600 dark:text-blue-400"><BadgeCheck size={12} /> Account linked</span>
              </div>
              <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{email}</p>
            </div>
          </div>
        </div>
      </section>

      <div role="tablist" aria-label="Account settings" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-[#111a2b]">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={(element) => { tabRefs.current[index] = element }}
            id={`settings-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`settings-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-2 text-center text-[10px] font-bold transition sm:text-xs ${activeTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <section id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111a2b] sm:p-6">
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-sm font-extrabold">Profile details</h2>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Your sign-in identity is attached to your existing account profile.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400"><UserRound size={14} /> Profile nickname</div>
                <p className="mt-2 text-xs font-extrabold">{name}</p>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Email for sign-in</div>
                  <p className="mt-2 break-all text-xs font-extrabold">{email}</p>
                </div>
                <button type="button" onClick={copyEmail} aria-label="Copy sign-in email" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-blue-500/20 bg-white px-3 py-2 text-[10px] font-extrabold text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-900/70 dark:text-blue-300 dark:hover:bg-slate-800">
                  {copyStatus === 'Email copied.' ? <Check size={13} /> : <Copy size={13} />}
                  {copyStatus === 'Email copied.' ? 'Copied' : 'Copy email'}
                </button>
              </div>
            <p role="status" aria-live="polite" className="sr-only">{copyStatus}</p>

            <section aria-labelledby="avatar-picker-title" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 id="avatar-picker-title" className="text-xs font-extrabold">Choose your avatar</h3>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">Choose an avatar; your choice will appear across your account.</p>
                </div>
                <PepeCasaAvatar size={48} src={avatarSrc} className="border-2 border-blue-500/30 shadow-md shadow-blue-950/10" />
              </div>

              <div role="group" aria-label="Choose your avatar" aria-busy={savingAvatar} className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 xl:grid-cols-8">
                {availableAvatars.map((avatar) => {
                  const selected = avatarSrc === avatar.src
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      aria-label={`Choose ${avatar.label} avatar`}
                      aria-pressed={selected}
                      disabled={savingAvatar}
                      onClick={() => void saveAvatar(avatar.src)}
                      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-slate-800"
                    >
                      <span className={`relative inline-flex rounded-full ${selected ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-300/70 dark:ring-slate-700'}`}>
                        <PepeCasaAvatar size={54} src={avatar.src} className="shadow-sm" />
                        {selected && <span aria-hidden="true" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-blue-600 text-white shadow"><Check size={12} strokeWidth={3} /></span>}
                      </span>
                    </button>
                  )
                })}
              </div>

              <p role="status" aria-live="polite" className="mt-3 min-h-4 text-[10px] font-semibold text-blue-600 dark:text-blue-300">
                {savingAvatar ? 'Saving avatar…' : avatarStatus}
              </p>
            </section>
          </div>


          </div>
        )}

        {activeTab === 'security' && <AccountSecurityPanel email={email} />}
      </section>
    </main>
    </LocalizedTree>
  )
}
