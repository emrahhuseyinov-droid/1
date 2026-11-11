import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { DashboardRouteContent } from '@/components/dashboard-route-content'
import type { AdvertiserPageView } from '@/components/advertiser-page'
import { normalizeReferralCode } from '@/lib/referrals'

const advertiserPages: Record<string, { view: AdvertiserPageView; title: { ru: string; en: string }; description: { ru: string; en: string } }> = {
  fund: {
    view: 'fund',
    title: { ru: 'Пополнение кошелька рекламодателя', en: 'Fund advertiser wallet' },
    description: { ru: 'Пополняйте рекламный кошелёк PEPE внутренним переводом.', en: 'Fund your advertiser PEPE wallet with an internal transfer.' },
  },
  create: {
    view: 'create',
    title: { ru: 'Создать PTC', en: 'Create PTC' },
    description: { ru: 'Создавайте PTC- и YouTube-кампании в pepe.casa.', en: 'Create PTC and YouTube campaigns on pepe.casa.' },
  },
  campaigns: {
    view: 'campaigns',
    title: { ru: 'Рекламные кампании', en: 'Advertiser campaigns' },
    description: { ru: 'Управляйте статусом кампаний и возвратом бюджета.', en: 'Manage campaign status and budget refunds.' },
  },
  activity: {
    view: 'activity',
    title: { ru: 'Операции рекламного кошелька', en: 'Advertiser wallet activity' },
    description: { ru: 'История переводов, списаний и возвратов PEPE.', en: 'History of PEPE transfers, charges, and refunds.' },
  },
}

type AdvertiserRouteProps = {
  params: Promise<{ page: string }>
  searchParams: Promise<{ ref?: string | string[] }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: AdvertiserRouteProps): Promise<Metadata> {
  const [{ page }, cookieStore] = await Promise.all([params, cookies()])
  const pageConfig = advertiserPages[page]
  if (!pageConfig) return { title: 'Advertiser | pepe.casa' }

  const language = cookieStore.get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'
  return {
    title: `${pageConfig.title[language]} | pepe.casa`,
    description: pageConfig.description[language],
  }
}

export default async function AdvertiserSubpage({ params, searchParams }: AdvertiserRouteProps) {
  const [{ page }, query] = await Promise.all([params, searchParams])
  const pageConfig = advertiserPages[page]
  if (!pageConfig) notFound()

  const rawReferralCode = Array.isArray(query.ref) ? query.ref[0] : query.ref
  const referralCode = normalizeReferralCode(rawReferralCode)

  return <DashboardRouteContent section="Advertiser" advertiserView={pageConfig.view} referralCode={referralCode} />
}
