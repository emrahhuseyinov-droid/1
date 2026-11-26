'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { useRouter } from 'next/navigation'
import {
  Activity,
  CheckCircle2,
  Clock3,
  Gamepad2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { authClient } from '@/lib/auth-client'
import type { AdminUserActivityPage, AdminUsersResponse } from '@/lib/admin-user-types'

async function fetchAdminJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? 'Не удалось загрузить данные.')
  return payload
}

const numberFormat = new Intl.NumberFormat('ru-RU')
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' })

function formatDate(value: string | null, formatter = dateTimeFormat) {
  if (!value) return 'Нет активности'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : formatter.format(date)
}

function formatReward(event: AdminUserActivityPage['events'][number]) {
  if (event.amount === null || !event.tokenSymbol) return null
  const value = Number(event.amount)
  if (!Number.isFinite(value)) return null
  const normalized = event.amountUnit === 'atomic' ? value / 100_000_000 : value
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(normalized)} ${event.tokenSymbol}`
}

const eventTone: Record<AdminUserActivityPage['events'][number]['kind'], string> = {
  task: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
  game: 'border-violet-300/20 bg-violet-300/10 text-violet-100',
  reward: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
  account: 'border-slate-300/20 bg-white/[0.04] text-slate-200',
  promotion: 'border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100',
  finance: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
}

export function AdminUsersPage({ adminEmail }: { adminEmail: string }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const usersQuery = useSWR<AdminUsersResponse>('/api/admin/users', fetchAdminJson, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const activityQuery = useSWRInfinite<AdminUserActivityPage>(
    (pageIndex, previousPage) => {
      if (!selectedUserId) return null
      const baseUrl = `/api/admin/users/${encodeURIComponent(selectedUserId)}`
      if (pageIndex === 0) return baseUrl
      if (!previousPage?.nextCursor) return null
      const cursor = new URLSearchParams({
        beforeAt: previousPage.nextCursor.occurredAt,
        beforeId: previousPage.nextCursor.eventId,
      })
      return `${baseUrl}?${cursor.toString()}`
    },
    fetchAdminJson,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
      persistSize: false,
    },
  )

  const allUsers = usersQuery.data?.users ?? []
  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ru-RU')
    if (!normalized) return allUsers
    return allUsers.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase('ru-RU').includes(normalized))
  }, [allUsers, search])
  const verifiedUsers = allUsers.filter((user) => user.emailVerified).length
  const tasksTotal = allUsers.reduce((total, user) => total + user.tasksCompleted, 0)
  const selectedUser = allUsers.find((user) => user.id === selectedUserId)
  const activityPages = activityQuery.data ?? []
  const events = [...new Map(activityPages.flatMap((page) => page.events).map((event) => [event.eventId, event])).values()]
  const hasMoreEvents = Boolean(activityPages.at(-1)?.nextCursor)

  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      router.replace('/')
      router.refresh()
    } catch {
      return
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d18] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.08] bg-[#101426] lg:flex">
        <div className="border-b border-white/[0.08] px-5 py-5">
          <PepeCasaLogo size={34} textClassName="text-lg text-white" />
        </div>
        <nav aria-label="Меню администратора" className="flex-1 px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Администрирование</p>
          <a href="/admin" aria-current="page" className="flex items-center gap-3 rounded-xl border border-cyan-200/10 bg-cyan-300/[0.08] px-3 py-3 text-sm font-semibold text-cyan-100">
            <UsersRound aria-hidden="true" size={17} />
            Пользователи
          </a>
        </nav>
        <div className="border-t border-white/[0.08] p-4">
          <p className="truncate px-2 text-xs font-semibold text-slate-300" title={adminEmail}>{adminEmail}</p>
          <button type="button" onClick={signOut} disabled={signingOut} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
            <LogOut aria-hidden="true" size={15} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#101426] px-4 py-3 lg:hidden">
        <PepeCasaLogo size={30} textClassName="text-base text-white" />
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-cyan-100">Пользователи</span>
          <button type="button" onClick={signOut} disabled={signingOut} aria-label="Выйти из аккаунта" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"><LogOut aria-hidden="true" size={16} /></button>
        </div>
      </div>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:ml-[248px] lg:px-9 lg:py-8">
        <header className="mb-7 flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">
              <ShieldCheck aria-hidden="true" size={14} /> Панель администратора
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Пользователи и активность</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Регистрации, выполненные задания и игровые сессии в одном месте.</p>
          </div>
          <button type="button" onClick={() => void usersQuery.mutate()} disabled={usersQuery.isValidating} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-60 sm:self-auto">
            <RefreshCw aria-hidden="true" size={14} className={usersQuery.isValidating ? 'animate-spin' : ''} />
            Обновить
          </button>
        </header>

        <section aria-label="Сводная статистика" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon={UsersRound} label="Зарегистрировано" value={usersQuery.data ? numberFormat.format(allUsers.length) : '—'} helper="Все аккаунты" />
          <StatCard icon={CheckCircle2} label="Email подтверждён" value={usersQuery.data ? numberFormat.format(verifiedUsers) : '—'} helper="Подтверждённые аккаунты" />
          <StatCard icon={Activity} label="Заданий выполнено" value={usersQuery.data ? numberFormat.format(tasksTotal) : '—'} helper="Подтверждённые награды" />
          <StatCard icon={Clock3} label="Обновление" value={usersQuery.data ? formatDate(usersQuery.data.refreshedAt) : '—'} helper="Автообновление каждые 15 секунд" />
        </section>

        {usersQuery.error && <div role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-100">{usersQuery.error.message}</div>}

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <section aria-labelledby="users-heading" className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111626]">
            <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 id="users-heading" className="text-sm font-semibold">Список пользователей</h2>
                <p className="mt-1 text-xs text-slate-500">Показано {numberFormat.format(filteredUsers.length)} из {numberFormat.format(allUsers.length)}</p>
              </div>
              <label className="relative block w-full sm:max-w-xs">
                <span className="sr-only">Поиск по имени или email</span>
                <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или email" className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0b0f1c] pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10" />
              </label>
            </div>

            <div className="max-h-[690px] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#151b2d] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold sm:px-5">Пользователь</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Регистрация</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Задания</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Игры</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-5">Активность</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {usersQuery.isLoading && allUsers.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">Загружаем пользователей…</td></tr>}
                  {!usersQuery.isLoading && filteredUsers.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">{search ? 'Ничего не найдено.' : 'Пользователей пока нет.'}</td></tr>}
                  {filteredUsers.map((user) => {
                    const selected = selectedUserId === user.id
                    const gameCount = user.arcadeRuns + user.crushGames
                    return (
                      <tr key={user.id} className={`transition-colors hover:bg-white/[0.035] ${selected ? 'bg-cyan-300/[0.06]' : ''}`}>
                        <td className="px-4 py-3.5 sm:px-5">
                          <button type="button" aria-pressed={selected} onClick={() => setSelectedUserId(user.id)} className="block max-w-[270px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
                            <span className="block truncate font-semibold text-slate-100">{user.name || 'Без имени'}</span>
                            <span className="mt-1 block truncate text-[11px] text-slate-500">{user.email}</span>
                          </button>
                        </td>
                        <td className="px-3 py-3.5 text-slate-400">{formatDate(user.registeredAt, dateFormat)}</td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-200">{numberFormat.format(user.tasksCompleted)}</td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-200">{numberFormat.format(gameCount)}</td>
                        <td className="px-4 py-3.5 text-right text-slate-500 sm:px-5">{formatDate(user.latestActivityAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="activity-heading" className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111626]">
            <div className="border-b border-white/[0.07] px-5 py-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">Карточка аккаунта</p>
              <h2 id="activity-heading" className="truncate text-sm font-semibold">{selectedUser?.name ?? 'Активность пользователя'}</h2>
              {selectedUser && <p className="mt-1 truncate text-xs text-slate-500">{selectedUser.email}</p>}
            </div>

            {!selectedUser && <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
              <Gamepad2 aria-hidden="true" size={24} className="mb-3 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">Выберите пользователя</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Здесь появятся его задания, игровые сессии, награды и другие записанные события.</p>
            </div>}

            {selectedUser && <>
              <div className="grid grid-cols-2 gap-px border-b border-white/[0.07] bg-white/[0.06]">
                <DetailMetric label="Задания" value={selectedUser.tasksCompleted} />
                <DetailMetric label="PEPE RUNNER" value={selectedUser.arcadeRuns} />
                <DetailMetric label="PEPE Crush" value={selectedUser.crushGames} />
                <DetailMetric label="YouTube" value={selectedUser.youtubeCompletions} />
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <p className="text-xs font-semibold text-slate-300">История действий</p>
                <span className="text-[10px] text-slate-500">{numberFormat.format(selectedUser.recordedEvents)} наград</span>
              </div>
              {activityQuery.error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-100">{activityQuery.error.message}</p>}
              <ol aria-live="polite" className="max-h-[500px] divide-y divide-white/[0.05] overflow-auto px-5">
                {activityQuery.isLoading && events.length === 0 && <li className="py-8 text-center text-xs text-slate-500">Загружаем историю…</li>}
                {!activityQuery.isLoading && events.length === 0 && <li className="py-8 text-center text-xs text-slate-500">Записанных действий пока нет.</li>}
                {events.map((event) => {
                  const reward = formatReward(event)
                  return <li key={event.eventId} className="flex gap-3 py-3.5">
                    <span aria-hidden="true" className={`mt-0.5 h-fit shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${eventTone[event.kind]}`}>{event.kind === 'task' ? 'Задание' : event.kind === 'game' ? 'Игра' : event.kind === 'finance' ? 'Финансы' : event.kind === 'account' ? 'Аккаунт' : event.kind === 'promotion' ? 'Промо' : 'Награда'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200">{event.title}</p>
                      <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">{event.detail}</p>
                      <time dateTime={event.occurredAt} className="mt-1 block text-[10px] text-slate-600">{formatDate(event.occurredAt)}</time>
                    </div>
                    {reward && <span className="shrink-0 pt-0.5 text-right font-mono text-[10px] text-slate-400">{reward}</span>}
                  </li>
                })}
                {!activityQuery.isLoading && hasMoreEvents && <li className="py-3 text-center"><button type="button" disabled={activityQuery.isValidating} onClick={() => void activityQuery.setSize(activityQuery.size + 1)} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50">{activityQuery.isValidating ? 'Загружаем…' : 'Загрузить ещё'}</button></li>}
              </ol>
            </>}
          </section>
        </div>

        {usersQuery.data && <p className="mt-5 text-right text-[10px] text-slate-600">Синхронизировано: {formatDate(usersQuery.data.refreshedAt)}</p>}
      </main>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, helper }: { icon: typeof UsersRound; label: string; value: string; helper: string }) {
  return <article className="rounded-2xl border border-white/[0.08] bg-[#111626] p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <Icon aria-hidden="true" size={16} className="shrink-0 text-cyan-300/70" />
    </div>
    <p className="mt-4 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">{value}</p>
    <p className="mt-1 truncate text-[10px] text-slate-600">{helper}</p>
  </article>
}

function DetailMetric({ label, value }: { label: string; value: number }) {
  return <div className="bg-[#111626] px-5 py-3.5">
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{numberFormat.format(value)}</p>
  </div>
}
