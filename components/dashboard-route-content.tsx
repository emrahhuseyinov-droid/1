import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ManualClaimPage } from '@/components/manual-claim-page'
import type { AdvertiserPageView } from '@/components/advertiser-page'
import { auth } from '@/lib/auth'
import { ensureAccountProfile } from '@/lib/account-profile'
import { getDashboardOverview } from '@/lib/dashboard'
import { releaseAdsLabOfferwallRewards } from '@/lib/adslab-offerwall'
import { getDashboardSectionPath, type DashboardSection } from '@/lib/dashboard-sections'
import { getProfileAvatar } from '@/lib/profile-avatars'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'
import { getPromoActivityEligibility, getPromoClaims } from '@/lib/promos'
import { getReferralOverview, guestCookieName } from '@/lib/referrals'

function getSafeErrorDetails(error: unknown) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  const metadata = error && typeof error === 'object'
    ? error as { code?: unknown; digest?: unknown }
    : {}
  const message = normalizedError.message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 240)

  return {
    name: normalizedError.name,
    code: typeof metadata.code === 'string' ? metadata.code : undefined,
    digest: typeof metadata.digest === 'string' ? metadata.digest : undefined,
    message,
  }
}

async function withDashboardStep<T>(
  section: DashboardSection,
  step: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action()
  } catch (error) {
    console.error('[dashboard-route] step failed', {
      section,
      step,
      ...getSafeErrorDetails(error),
    })
    throw error
  }
}

export async function DashboardRouteContent({
  section,
  referralCode,
  advertiserView,
}: {
  section: DashboardSection
  referralCode?: string | null
  advertiserView?: AdvertiserPageView
}) {
  const requestHeaders = await withDashboardStep(section, 'request.headers', () => headers())
  const session = await withDashboardStep(section, 'auth.getSession', () =>
    auth.api.getSession({ headers: requestHeaders }),
  )
  const sectionPath = getDashboardSectionPath(section)
  const advertiserPageSegment = advertiserView === 'youtube' ? 'create-youtube' : advertiserView
  const requestedPath = section === 'Advertiser' && advertiserPageSegment
    ? `${sectionPath}/${advertiserPageSegment}`
    : sectionPath
  const nextPath = referralCode
    ? `${requestedPath}?ref=${encodeURIComponent(referralCode)}`
    : requestedPath
  if (!session?.user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  const isAdmin = isPepeReserveAdmin(session.user.email, session.user.emailVerified)

  const cookieStore = await withDashboardStep(section, 'request.cookies', () => cookies())
  const guestToken = cookieStore.get(guestCookieName)?.value
  const profile = await withDashboardStep(section, 'ensureAccountProfile', () =>
    ensureAccountProfile(session.user.id, guestToken, referralCode),
  )
  await withDashboardStep(section, 'releaseOfferwallRewards', () =>
    releaseAdsLabOfferwallRewards(profile.id),
  )
  const [referralOverview, promoClaims, dashboardOverview] = await Promise.all([
    withDashboardStep(section, 'getReferralOverview', () => getReferralOverview(profile.id)),
    withDashboardStep(section, 'getPromoClaims', () => getPromoClaims(profile.id)),
    withDashboardStep(section, 'getDashboardOverview', () => getDashboardOverview(profile.id)),
  ])
  const promoActivity = section === 'Promo Code'
    ? await withDashboardStep(section, 'getPromoActivityEligibility', () =>
        getPromoActivityEligibility(profile.id),
      )
    : { eligible: false, lastActivityAt: null, windowDays: 7 }

  return (
    <ManualClaimPage
      initialSection={section}
      advertiserView={advertiserView}
      guestProfileId={profile.id}
      adslabPlacementId={process.env.ADSLAB_PLACEMENT_ID?.trim() ?? ''}
      email={session.user.email}
      name={session.user.name}
      initialAvatarUrl={getProfileAvatar(session.user.image, isAdmin)}
      isAdmin={isAdmin}
      referralOverview={referralOverview}
      promoClaims={promoClaims}
      promoActivity={promoActivity}
      dashboardOverview={dashboardOverview}
    />
  )
}
