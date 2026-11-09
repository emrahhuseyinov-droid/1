import { LandingPage } from '@/components/landing-page'
import { normalizeReferralCode } from '@/lib/referrals'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const query = await searchParams
  const rawReferralCode = Array.isArray(query.ref) ? query.ref[0] : query.ref
  const referralCode = normalizeReferralCode(rawReferralCode) ?? undefined

  return <LandingPage referralCode={referralCode} />
}
