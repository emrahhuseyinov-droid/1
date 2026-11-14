import 'server-only'
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { earningEvents, referralCommissions } from '@/lib/db/schema'
import { ADVERTISER_WALLET_EVENT_SOURCES, ADVERTISER_WALLET_TRANSFER_OUT_SOURCE } from '@/lib/advertiser-wallet'
import { PEPE_RESERVE_EVENT_SOURCES, PEPE_SWAP_COMMISSION_SOURCE } from '@/lib/pepe-reserve'
import { HOMERO_TREASURY_EVENT_SOURCES } from '@/lib/homero-treasury'
import { getStreakFromDate, getUtcDateKey } from '@/lib/daily-bonus'
import type { DashboardActivity, DashboardOverview } from '@/lib/dashboard-types'
import type { WalletBalancesAtomic, WalletCoinSymbol } from '@/lib/wallet-assets'

const wheelRewardActivityTitles: Record<string, string> = {
  'small-prize': 'Wheel of Fortune prize: 25 HOMERO',
  'medium-prize': 'Wheel of Fortune prize: 100 HOMERO',
  'large-prize': 'Wheel of Fortune prize: 500 HOMERO',
  jackpot: 'Wheel of Fortune jackpot: 1,000 HOMERO',
  'consolation-prize': 'Wheel of Fortune prize: 10 HOMERO',
}

export async function getDashboardBalancesAtomic(guestId: string): Promise<Record<WalletCoinSymbol, string>> {
  const [balanceRows, bonusRows] = await Promise.all([
    db.select({ tokenSymbol: earningEvents.tokenSymbol, amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES, ...HOMERO_TREASURY_EVENT_SOURCES])))
      .groupBy(earningEvents.tokenSymbol),
    db.select({ tokenSymbol: referralCommissions.tokenSymbol, amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, guestId))
      .groupBy(referralCommissions.tokenSymbol),
  ])

  const balancesAtomic: Record<WalletCoinSymbol, string> = { HOMERO: '0', PEPE: '0' }
  for (const row of balanceRows) balancesAtomic[row.tokenSymbol] = row.amount
  for (const row of bonusRows) {
    if (row.tokenSymbol === 'PEPE' || row.tokenSymbol === 'HOMERO') {
      balancesAtomic[row.tokenSymbol] = (BigInt(balancesAtomic[row.tokenSymbol]) + BigInt(row.amount)).toString()
    }
  }

  return balancesAtomic
}

export async function getDashboardOverview(guestId: string): Promise<DashboardOverview> {
  const [balanceRows, bonusRows, earningRows, commissionRows, dailyRows] = await Promise.all([
    db.select({ tokenSymbol: earningEvents.tokenSymbol, amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES, ...HOMERO_TREASURY_EVENT_SOURCES])))
      .groupBy(earningEvents.tokenSymbol),
    db.select({ tokenSymbol: referralCommissions.tokenSymbol, amount: sql<string>`coalesce(sum(${referralCommissions.commissionAmountAtomic}), 0)::text` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, guestId))
      .groupBy(referralCommissions.tokenSymbol),
    db.select({ id: earningEvents.id, source: earningEvents.source, sourceKey: earningEvents.sourceKey, itemId: earningEvents.itemId, tokenSymbol: earningEvents.tokenSymbol, amountAtomic: earningEvents.rewardAtomic, createdAt: earningEvents.createdAt })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), notInArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES, ...ADVERTISER_WALLET_EVENT_SOURCES, ...HOMERO_TREASURY_EVENT_SOURCES])))
      .orderBy(desc(earningEvents.createdAt))
      .limit(8),
    db.select({ id: referralCommissions.id, amountAtomic: referralCommissions.commissionAmountAtomic, tokenSymbol: referralCommissions.tokenSymbol, createdAt: referralCommissions.createdAt })
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
  for (const row of bonusRows) {
    if (row.tokenSymbol === 'PEPE' || row.tokenSymbol === 'HOMERO') balancesAtomic[row.tokenSymbol] += Number(row.amount)
  }

  const today = getUtcDateKey()
  const dailyDateKeys = new Set(dailyRows.map((row) => row.sourceKey))
  const claimedToday = dailyDateKeys.has(today)
  const streakAnchor = claimedToday ? today : getUtcDateKey(-1)
  const streak = getStreakFromDate(dailyDateKeys, streakAnchor)

  const activity: DashboardActivity[] = [
    ...earningRows.map((row) => ({
      id: row.id,
      title: row.source === 'wheel_of_fortune'
        ? wheelRewardActivityTitles[row.itemId ?? ''] ?? 'Wheel of Fortune reward'
        : row.source === 'adslab_ptc' || row.source === 'advertiser_task' || row.source === 'advertiser_task_pepe_correction'
        ? 'PTC task reward'
        : row.source === 'adslab_shortlink'
          ? 'Shortlink reward'
          : row.source === 'adslab_shortlink_reversal'
            ? 'Shortlink chargeback'
            : row.source === 'adslab_ptc_reversal'
              ? 'PTC chargeback'
              : row.source === 'adslab_offerwall'
                ? 'Offerwall reward'
                : row.source === 'adslab_offerwall_reversal'
                  ? 'Offerwall chargeback'
                  : row.source === 'banner_click_promo'
                ? 'Banner click bonus'
                : row.source === 'manual_claim'
          ? 'Faucet claim'
          : row.source === 'manual_faucet'
          ? 'CAPTCHA reward'
          : row.source === 'manual_mining'
            ? row.itemId === 'manual-faucet' ? 'CAPTCHA reward' : 'Legacy reward'
              : row.source === 'youtube_advertiser_task'
                ? 'YouTube reward'
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
                                  : `${row.tokenSymbol} reward`,
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
      title: 'Referral bonus',
      createdAt: row.createdAt.toISOString(),
      amountAtomic: row.amountAtomic,
      tokenSymbol: row.tokenSymbol,
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
