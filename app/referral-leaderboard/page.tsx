import { cookies } from 'next/headers'
import { DashboardRouteContent } from '@/components/dashboard-route-content'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Рейтинг рефералов | pepe.casa',
        description: 'Ежемесячный рейтинг по активным рефералам: 15 одобренных PTC-заданий и входы в 3 разные даты.'
      }
    : {
        title: 'Referral Leaderboard | pepe.casa',
        description: 'Monthly referral ranking: 15 approved PTC tasks and authenticated logins on 3 different days.'
      }
}

export default function Page() {
  return <DashboardRouteContent section="Referral Leaderboard" />
}
