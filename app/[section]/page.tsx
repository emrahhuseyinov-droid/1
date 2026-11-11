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
    return { title: 'View Ads | pepe.casa', description: 'Earn HOMERO through the Daily Bonus and eligible PTC tasks.' }
  }

  const section = getDashboardSectionFromSlug(slug)
  if (!section) return { title: 'pepe.casa' }

  const language = cookieStore.get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'
  const title = section === 'Advertiser'
    ? language === 'ru' ? 'Кошелёк рекламодателя | pepe.casa' : 'Advertiser wallet | pepe.casa'
    : translateSiteText(`${section} | pepe.casa`, language)
  const description = section === 'Advertiser'
    ? language === 'ru'
      ? 'Создавайте PTC-кампании, пополняйте рекламный кошелёк PEPE и управляйте заданиями.'
      : 'Create PTC campaigns, fund your PEPE advertiser wallet, and manage sponsored tasks.'
    : language === 'ru'
    ? section === 'Manual Faucet'
      ? 'Получайте награды PEPE после серверной проверки CAPTCHA.'
      : section === 'Watch and Earn'
        ? 'Смотрите рекламные видео YouTube, выполняйте подтверждённые задания и получайте PEPE.'
        : section === 'Wheel of Fortune'
        ? 'Крутите колесо раз в два часа и получайте серверно подтверждённые награды HOMERO и аркады.'
        : `Откройте раздел «${translateSiteText(section, 'ru')}» в pepe.casa.`
    : section === 'Manual Faucet'
      ? 'Claim PEPE rewards after server-verified CAPTCHA completion.'
      : section === 'Watch and Earn'
        ? 'Watch sponsored YouTube videos, complete verified tasks, and earn PEPE.'
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

  if (section === 'Advertiser') {
    const transferPath = referralCode
      ? `/advertiser/fund?ref=${encodeURIComponent(referralCode)}`
      : '/advertiser/fund'
    redirect(transferPath)
  }

  return <DashboardRouteContent section={section} referralCode={referralCode} />
}
