import { cookies } from 'next/headers'
import { DashboardRouteContent } from '@/components/dashboard-route-content'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Рейтинг рефералов | pepe.casa',
        description: 'Рейтинг участников pepe.casa по подтверждённым и активным рефералам.',
      }
    : {
        title: 'Referral Leaderboard | pepe.casa',
        description: 'See the pepe.casa referral rankings, based on verified and successful referrals.',
      }
}

export default function Page() {
  return <DashboardRouteContent section="Referral Leaderboard" />
}
