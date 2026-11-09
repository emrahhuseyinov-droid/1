import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcadeRewardClaims } from '@/lib/db/schema'
import { ARCADE_MILESTONES } from '@/lib/arcade-gameplay'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, createMilestoneClaims, isRecord, lockArcadeProfile, readJsonBody, settlePendingArcadeRewards } from '@/lib/arcade-service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response

  const body = await readJsonBody(request)
  if (!isRecord(body) || typeof body.rewardKey !== 'string' || !ARCADE_MILESTONES.some((item) => item.key === body.rewardKey)) {
    return NextResponse.json({ error: 'Choose a valid milestone.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  const milestone = ARCADE_MILESTONES.find((item) => item.key === body.rewardKey)
  if (!milestone) return NextResponse.json({ error: 'Milestone not found.' }, { status: 404, headers: arcadeNoStoreHeaders })

  try {
    const result = await db.transaction(async (transaction) => {
      const profile = await lockArcadeProfile(transaction, access.guestId)
      if (profile.bestDistanceM < milestone.distanceM) return { status: 'not_earned' as const }
      await createMilestoneClaims(transaction, access.guestId, milestone.distanceM, `claim:${milestone.key}`)
      const settled = await settlePendingArcadeRewards(transaction)
      const [claim] = await transaction
        .select({ status: arcadeRewardClaims.status, amountAtomic: arcadeRewardClaims.amountAtomic })
        .from(arcadeRewardClaims)
        .where(and(eq(arcadeRewardClaims.guestId, access.guestId), eq(arcadeRewardClaims.rewardKey, milestone.key)))
        .limit(1)
      return { status: claim?.status ?? 'pending', amountAtomic: claim?.amountAtomic ?? milestone.amountAtomic, reserveBalanceAtomic: settled.balanceAtomic }
    })

    if (result.status === 'not_earned') return NextResponse.json({ error: 'Reach the milestone distance before claiming it.' }, { status: 409, headers: arcadeNoStoreHeaders })
    return NextResponse.json({ ...result, amountAtomic: String(result.amountAtomic), reserveBalanceAtomic: String(result.reserveBalanceAtomic) }, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-reward-claim] Could not settle milestone:', error)
    return NextResponse.json({ error: 'Could not claim the milestone reward.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
