import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, asc, eq, lte } from 'drizzle-orm'
import { grantArcadeEnergy } from '@/lib/arcade-service'
import { db } from '@/lib/db'
import { adslabOfferwallTransactions, earningEvents, guestProfiles } from '@/lib/db/schema'

export async function releaseMatureAdsLabOfferwallRewards(guestId: string) {
  const now = new Date()

  await db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
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
      const [credit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId,
          source: 'adslab_offerwall',
          sourceKey: held.providerTransactionId,
          itemId: held.providerTransactionId,
          tokenSymbol: 'PEPE',
          rewardAtomic: held.rewardAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })

      if (credit) await grantArcadeEnergy(transaction, guestId, now)

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
