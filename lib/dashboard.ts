import 'server-only'
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, referralCommissions } from '@/lib/db/schema'
import { ADVERTISER_WALLET_EVENT_SOURCES, ADVERTISER_WALLET_TRANSFER_OUT_SOURCE } from '@/lib/advertiser-wallet'
import { PEPE_RESERVE_EVENT_SOURCES, PEPE_SWAP_COMMISSION_SOURCE } from '@/lib/pepe-reserve'
import { getStreakFromDate, getUtcDateKey } from '@/lib/daily-bonus'
import type { DashboardActivity, DashboardOverview } from '@/lib/dashboard-types'
import type { WalletBalancesAtomic } from '@/lib/wallet-assets'

export async function getDashboardOverview(guestId: string): Promise<DashboardOverview> {
  const [balanceRows, commissionTotal, earningRows, commissionRows, dailyRows] = await Promise.all([
    db.select({ tokenSymbol: earningEvents.tokenSymbol, amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES])))
      .groupBy(earningEvents.tokenSymbol),
    db.select({ amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, guestId)),
    db.select({ id: earningEvents.id, source: earningEvents.source, sourceKey: earningEvents.sourceKey, itemId: earningEvents.itemId, tokenSymbol: earningEvents.tokenSymbol, amountAtomic: earningEvents.rewardAtomic, createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES])))
      .orderBy(desc(earningEvents.createdAt))
      .limit(8),
    db.select({ id: referralCommissions.id, amountAtomic: referralCommissions.commissionAmountAtomic, createdAt: referralCommissions.createdAt })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, guestId))
      .orderBy(desc(referralCommissions.createdAt))
      .limit(8),
    db.select({ sourceKey: earningEvents.sourceKey })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), eq(earningEvents.source, 'daily_bonus')))
      .orderBy(desc(earningEvents.createdAt))
      .limit(7),
  ])

  const balancesAtomic: WalletBalancesAtomic = { HOMERO: 0, PEPE: 0 }
  for (const row of balanceRows) balancesAtomic[row.tokenSymbol] = Number(row.amount)
  balancesAtomic.HOMERO += Number(commissionTotal[0]?.amount ?? 0)

  const today = getUtcDateKey()
  const dailyDateKeys = new Set(dailyRows.map((row) => row.sourceKey))
  const claimedToday = dailyDateKeys.has(today)
  const streakAnchor = claimedToday ? today : getUtcDateKey(-1)
  const streak = getStreakFromDate(dailyDateKeys, streakAnchor)

  const activity: DashboardActivity[] = [
    ...earningRows.map((row) => ({
      id: row.id,
      title: row.source === 'adslab_ptc'
        ? 'AdsLab PTC task reward'
        : row.source === 'adslab_shortlink'
          ? 'AdsLab Shortlink reward'
          : row.source === 'adslab_shortlink_reversal'
            ? 'AdsLab Shortlink chargeback'
            : row.source === 'adslab_ptc_reversal'
              ? 'AdsLab PTC chargeback'
              : row.source === 'adslab_offerwall'
                ? 'AdsLab Offerwall reward'
                : row.source === 'adslab_offerwall_reversal'
                  ? 'AdsLab Offerwall chargeback'
                  : row.source === 'banner_click_promo'
                ? 'Banner click bonus'
                : row.source === 'manual_claim'
          ? 'Faucet claim'
          : row.source === 'manual_faucet'
          ? 'CAPTCHA reward'
          : row.source === 'manual_mining'
            ? row.itemId === 'manual-faucet' ? 'CAPTCHA reward' : 'Legacy reward'
            : row.source === 'view_ads'
              ? 'View Ads task reward'
              : row.source === 'applixir_video'
                ? 'Watch & Earn video reward'
                : row.source === 'shortlink'
                  ? 'Shortlink reward'
                  : row.source === 'promo_code'
                    ? `Promo code${row.itemId ? `: ${row.itemId}` : ''}`
                    : row.source === 'daily_bonus'
                      ? 'Daily bonus'
                      : row.source === 'arcade_homero_coin'
                        ? 'Arcade HOMERO coin'
                        : row.source === 'withdrawal_request'
                          ? 'PEPE withdrawal request'
                          : row.source === 'withdrawal_refund'
                            ? 'Rejected PEPE withdrawal refund'
                            : row.source === 'admin_adjustment'
                              ? 'Admin balance credit'
                              : row.source === PEPE_SWAP_COMMISSION_SOURCE
                              ? 'Token exchange commission'
                              : row.source === ADVERTISER_WALLET_TRANSFER_OUT_SOURCE
                                ? 'PEPE transfer to advertiser wallet'
                                : row.source === 'swap'
                                  ? `Token exchange ${row.itemId ?? 'tokens'}`
                                  : 'Demo reward',
      createdAt: row.createdAt.toISOString(),
      amountAtomic: row.amountAtomic,
      tokenSymbol: row.tokenSymbol,
      kind: row.source === PEPE_SWAP_COMMISSION_SOURCE
        ? 'commission' as const
        : row.source === 'swap'
          ? 'swap' as const
          : 'earning' as const,
    })),
    ...commissionRows.map((row) => ({
      id: row.id,
      title: 'Referral commission',
      createdAt: row.createdAt.toISOString(),
      amountAtomic: row.amountAtomic,
      tokenSymbol: 'HOMERO' as const,
      kind: 'commission' as const,
    })),
  ]

  activity.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))

  return {
    balanceAtomic: balancesAtomic.HOMERO,
    balancesAtomic,
    dailyBonus: { streak, claimedToday },
    recentActivity: activity.slice(0, 5),
  }
}
