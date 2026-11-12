export const dashboardSectionPaths = {
  Dashboard: '/dashboard',
  'My Wallet': '/my-wallet',
  Withdraw: '/withdraw',
  'Manual Faucet': '/manual-faucet',
  'View Ads': '/view-ads',
  'Watch and Earn': '/watch-and-earn',
  Advertiser: '/advertiser',
  Shortlinks: '/shortlinks',
  Arcade: '/arcade',
  'Wheel of Fortune': '/wheel-of-fortune',
  'Weekly Leaderboard': '/weekly-leaderboard',
  Swap: '/swap',
  Referrals: '/referrals',
  'Promo Code': '/promo-code',
  'Security & Wallets': '/security-wallets',
  'Help & resources': '/help-resources',
  'Contact support': '/contact-support',
} as const

export type DashboardSection = keyof typeof dashboardSectionPaths

const sectionsBySlug: Record<string, DashboardSection> = {
  wallet: 'My Wallet',
  'my-wallet': 'My Wallet',
  withdraw: 'Withdraw',
  'manual-faucet': 'Manual Faucet',
  'view-ads': 'View Ads',
  'watch-and-earn': 'Watch and Earn',
  advertiser: 'Advertiser',
  shortlinks: 'Shortlinks',
  arcade: 'Arcade',
  wheel: 'Wheel of Fortune',
  'wheel-of-fortune': 'Wheel of Fortune',
  'weekly-leaderboard': 'Weekly Leaderboard',
  swap: 'Swap',
  referrals: 'Referrals',
  'promo-code': 'Promo Code',
  'security-wallets': 'Security & Wallets',
  'help-resources': 'Help & resources',
  'contact-support': 'Contact support',
}

export function getDashboardSectionPath(section: DashboardSection): string {
  return dashboardSectionPaths[section]
}

export function getDashboardSectionFromSlug(slug: string): DashboardSection | null {
  return sectionsBySlug[slug] ?? null
}

export function getDashboardSectionFromPath(pathname: string): DashboardSection | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  if (normalizedPath === dashboardSectionPaths.Dashboard) return 'Dashboard'
  const segments = normalizedPath.slice(1).split('/')
  if (segments.length !== 1 || !segments[0]) return null
  return getDashboardSectionFromSlug(segments[0])
}
