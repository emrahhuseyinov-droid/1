import { cookies } from 'next/headers'
import { DashboardRouteContent } from '@/components/dashboard-route-content'
import { normalizeReferralCode } from '@/lib/referrals'

export async function generateMetadata() {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Главная | pepe.casa',
        description: 'Просматривайте сводку аккаунта и активность с наградами на pepe.casa.',
      }
    : {
        title: 'Dashboard | pepe.casa',
        description: 'View your account dashboard and reward activity on pepe.casa.',
      }
}

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const query = await searchParams
  const rawReferralCode = Array.isArray(query.ref) ? query.ref[0] : query.ref
  const referralCode = normalizeReferralCode(rawReferralCode)

  return <DashboardRouteContent section="Dashboard" referralCode={referralCode} />
}
