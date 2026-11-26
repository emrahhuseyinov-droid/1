import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { AdminUsersPage } from '@/components/admin-users-page'
import { auth } from '@/lib/auth'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Пользователи | Администрирование pepe.casa',
  description: 'Статистика зарегистрированных пользователей, заданий и игровых сессий pepe.casa.',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in?next=%2Fadmin')
  if (!isPepeReserveAdmin(session.user.email, session.user.emailVerified)) notFound()

  return <AdminUsersPage adminEmail={session.user.email} />
}
