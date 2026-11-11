import { and, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { earningEvents, referralCommissions, wheelSpins } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const rewardSources = [
  'adslab_ptc',
  'adslab_shortlink',
  'adslab_offerwall',
  'advertiser_task',
  'youtube_advertiser_task',
  'view_ads',
  'shortlink',
  'applixir_video',
  'daily_bonus',
  'banner_click_promo',
  'manual_faucet',
  'manual_claim',
  'manual_mining',
  'promo_code',
  'arcade_homero_coin',
  'arcade_reward',
  'wheel_of_fortune',
  'withdrawal_refund',
  'admin_adjustment',
] as const

export async function GET(request: NextRequest) {
  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401, headers: noStoreHeaders })

  try {
    const [earningRows, commissionRows, wheelRows] = await Promise.all([
      db.select({
        id: earningEvents.id,
        source: earningEvents.source,
        tokenSymbol: earningEvents.tokenSymbol,
        amountAtomic: earningEvents.rewardAtomic,
        createdAt: earningEvents.createdAt,
      })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, account.profile.id),
          inArray(earningEvents.source, [...rewardSources]),
          gt(earningEvents.rewardAtomic, 0),
        ))
        .orderBy(desc(earningEvents.createdAt))
        .limit(20),
      db.select({
        id: referralCommissions.id,
        amountAtomic: referralCommissions.commissionAmountAtomic,
        createdAt: referralCommissions.createdAt,
      })
        .from(referralCommissions)
        .where(and(
          eq(referralCommissions.referrerId, account.profile.id),
          gt(referralCommissions.commissionAmountAtomic, 0),
        ))
        .orderBy(desc(referralCommissions.createdAt))
        .limit(20),
      db.select({
        id: wheelSpins.id,
        rewardType: wheelSpins.rewardType,
        rewardQuantity: wheelSpins.rewardQuantity,
        createdAt: wheelSpins.createdAt,
        claimedAt: wheelSpins.claimedAt,
      })
        .from(wheelSpins)
        .where(and(
          eq(wheelSpins.guestId, account.profile.id),
          inArray(wheelSpins.rewardType, ['energy', 'life']),
          isNotNull(wheelSpins.claimedAt),
        ))
        .orderBy(desc(wheelSpins.claimedAt))
        .limit(20),
    ])

    const events = [
      ...earningRows.map((row) => ({
        id: row.id,
        source: row.source,
        kind: 'token' as const,
        tokenSymbol: row.tokenSymbol,
        amountAtomic: String(row.amountAtomic),
        createdAt: row.createdAt.toISOString(),
      })),
      ...commissionRows.map((row) => ({
        id: row.id,
        source: 'referral_commission',
        kind: 'token' as const,
        tokenSymbol: 'HOMERO' as const,
        amountAtomic: String(row.amountAtomic),
        createdAt: row.createdAt.toISOString(),
      })),
      ...wheelRows.map((row) => ({
        id: `wheel-${row.id}`,
        source: 'wheel_of_fortune',
        kind: row.rewardType as 'energy' | 'life',
        quantity: String(row.rewardQuantity),
        createdAt: (row.claimedAt ?? row.createdAt).toISOString(),
      })),
    ]
      .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
      .slice(0, 20)

    return NextResponse.json({ events }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[reward-notifications] Could not load reward updates.', {
      errorName: error instanceof Error ? error.name.slice(0, 64) : typeof error,
    })
    return NextResponse.json({ error: 'Could not load reward updates.' }, { status: 500, headers: noStoreHeaders })
  }
}
