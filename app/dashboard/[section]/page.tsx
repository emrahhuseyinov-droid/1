import { notFound, redirect } from 'next/navigation'
import { getDashboardSectionFromSlug, getDashboardSectionPath } from '@/lib/dashboard-sections'
import { normalizeReferralCode } from '@/lib/referrals'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const [{ section: slug }, query] = await Promise.all([params, searchParams])
  const section = getDashboardSectionFromSlug(slug)
  if (!section) notFound()

  const rawReferralCode = Array.isArray(query.ref) ? query.ref[0] : query.ref
  const referralCode = normalizeReferralCode(rawReferralCode)
  const queryString = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''

  redirect(`${getDashboardSectionPath(section)}${queryString}`)
}
