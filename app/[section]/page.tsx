import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { DashboardRouteContent } from '@/components/dashboard-route-content'
import { getDashboardSectionFromSlug } from '@/lib/dashboard-sections'
import { normalizeReferralCode } from '@/lib/referrals'
import { translateSiteText } from '@/lib/site-translations'

type SectionPageProps = {
  params: Promise<{ section: string }>
  searchParams: Promise<{ ref?: string | string[] }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const [{ section: slug }, cookieStore] = await Promise.all([params, cookies()])
  if (slug === 'homero-mining' || slug === 'miner-shop' || slug === 'manual-claim') {
    return { title: 'View Ads | pepe.casa', description: 'Earn HOMERO through the Daily Bonus and eligible AdsLab PTC tasks.' }
  }

  const section = getDashboardSectionFromSlug(slug)
  if (!section) return { title: 'pepe.casa' }

  const language = cookieStore.get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'
  const title = translateSiteText(`${section} | pepe.casa`, language)
  const description = language === 'ru'
    ? section === 'Wheel of Fortune'
      ? 'Крутите колесо раз в два часа и получайте серверно подтверждённые награды HOMERO и аркады.'
      : `Откройте раздел «${translateSiteText(section, 'ru')}» в pepe.casa.`
    : section === 'Wheel of Fortune'
      ? 'Spin once every two hours for server-verified HOMERO and Arcade rewards.'
      : `Open your ${section} section on pepe.casa.`

  return { title, description }
}

export default async function Page({ params, searchParams }: SectionPageProps) {
  const [{ section: slug }, query] = await Promise.all([params, searchParams])
  if (slug === 'homero-mining' || slug === 'miner-shop' || slug === 'manual-claim') redirect('/view-ads')

  const section = getDashboardSectionFromSlug(slug)
  if (!section) notFound()

  const rawReferralCode = Array.isArray(query.ref) ? query.ref[0] : query.ref
  const referralCode = normalizeReferralCode(rawReferralCode)

  return <DashboardRouteContent section={section} referralCode={referralCode} />
}
