import 'server-only'

import { and, asc, eq, lte } from 'drizzle-orm'
import { grantArcadeEnergy } from '@/lib/arcade-service'
import { db } from '@/lib/db'
import { adslabOfferwallTransactions, earningEvents, guestProfiles } from '@/lib/db/schema'
import { HomeroAmmUnavailableError, HomeroTreasuryInsufficientError, issueHomeroRewardForPepe } from '@/lib/homero-amm'
import { getHomeroTreasuryAdminProfile, lockHomeroTreasuryProfiles } from '@/lib/homero-treasury'

export async function releaseMatureAdsLabOfferwallRewards(guestId: string) {
  const adminProfile = await getHomeroTreasuryAdminProfile()
  if (!adminProfile) return

  const now = new Date()
  await db.transaction(async (transaction) => {
    await lockHomeroTreasuryProfiles(transaction, [adminProfile.id, guestId])
    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .limit(1)

    if (!profile) return

    const heldTransactions = await transaction
      .select()
      .from(adslabOfferwallTransactions)
      .where(and(
        eq(adslabOfferwallTransactions.guestId, guestId),
        eq(adslabOfferwallTransactions.status, 'credited'),
        eq(adslabOfferwallTransactions.rewardReleased, false),
        lte(adslabOfferwallTransactions.releaseAt, now),
      ))
      .orderBy(asc(adslabOfferwallTransactions.releaseAt))
      .for('update')

    for (const held of heldTransactions) {
      const [existingCredit] = await transaction
        .select({ id: earningEvents.id })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, guestId),
          eq(earningEvents.source, 'adslab_offerwall'),
          eq(earningEvents.sourceKey, held.providerTransactionId),
        ))
        .limit(1)

      if (!existingCredit) {
        try {
          await issueHomeroRewardForPepe(transaction, {
            adminProfileId: adminProfile.id,
            recipientProfileId: guestId,
            pepeEquivalentAtomic: held.rewardAtomic,
            sourceKey: held.providerTransactionId,
            recipientSource: 'adslab_offerwall',
            itemId: held.providerTransactionId,
            now,
          })
        } catch (error) {
          if (error instanceof HomeroAmmUnavailableError || error instanceof HomeroTreasuryInsufficientError) break
          throw error
        }

        await grantArcadeEnergy(transaction, guestId, now)
      }

      await transaction
        .update(adslabOfferwallTransactions)
        .set({ rewardReleased: true })
        .where(and(
          eq(adslabOfferwallTransactions.id, held.id),
          eq(adslabOfferwallTransactions.rewardReleased, false),
        ))
    }
  })
}
