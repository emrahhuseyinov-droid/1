import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcadeInventory, arcadeSessions, earningEvents } from '@/lib/db/schema'
import { ARCADE_SHOP } from '@/lib/arcade-gameplay'
import { arcadeNoStoreHeaders, authorizeArcadeRequest, getPublisherPepeBalance, isRecord, isUuid, readJsonBody } from '@/lib/arcade-service'

export const runtime = 'nodejs'
type ShopCode = keyof typeof ARCADE_SHOP

export async function POST(request: NextRequest) {
  const access = await authorizeArcadeRequest(request, true)
  if ('response' in access) return access.response

  const body = await readJsonBody(request)
  if (!isRecord(body) || !isUuid(body.idempotencyKey) || typeof body.itemCode !== 'string' || !Object.hasOwn(ARCADE_SHOP, body.itemCode)) {
    return NextResponse.json({ error: 'Choose a valid shop item.' }, { status: 400, headers: arcadeNoStoreHeaders })
  }
  const itemCode = body.itemCode as ShopCode
  const idempotencyKey = body.idempotencyKey
  const item = ARCADE_SHOP[itemCode]

  try {
    const result = await db.transaction(async (transaction) => {
      const [existingPurchase] = await transaction
        .select({ itemId: earningEvents.itemId, rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, access.guestId),
          eq(earningEvents.source, 'arcade_shop'),
          eq(earningEvents.sourceKey, idempotencyKey),
        ))
        .limit(1)
      if (existingPurchase) {
        if (existingPurchase.itemId !== itemCode) return { status: 'idempotency_conflict' as const }
        return { status: 'purchased' as const, alreadyPurchased: true, inventoryQuantity: null }
      }

      if (itemCode === 'life') {
        const [runningSession] = await transaction
          .select({ id: arcadeSessions.id })
          .from(arcadeSessions)
          .where(and(eq(arcadeSessions.guestId, access.guestId), eq(arcadeSessions.status, 'running')))
          .for('update')
          .limit(1)
        if (runningSession) return { status: 'active_run' as const }

        const [ownedLife] = await transaction
          .select({ quantity: arcadeInventory.quantity })
          .from(arcadeInventory)
          .where(and(eq(arcadeInventory.guestId, access.guestId), eq(arcadeInventory.boostCode, 'life')))
          .for('update')
          .limit(1)
        if (ownedLife && ownedLife.quantity >= 1) return { status: 'life_owned' as const }
      }
      const balance = await getPublisherPepeBalance(transaction, access.guestId)
      if (balance < item.priceAtomic) return { status: 'insufficient_balance' as const }

      const [purchase] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: access.guestId,
          source: 'arcade_shop',
          sourceKey: idempotencyKey,
          itemId: itemCode,
          tokenSymbol: 'PEPE',
          rewardAtomic: -item.priceAtomic,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })
      if (!purchase) return { status: 'idempotency_conflict' as const }

      const [inventoryItem] = await transaction
        .insert(arcadeInventory)
        .values({ guestId: access.guestId, boostCode: 'life', quantity: 1, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [arcadeInventory.guestId, arcadeInventory.boostCode],
          set: { quantity: 1, updatedAt: new Date() },
        })
        .returning({ quantity: arcadeInventory.quantity })
      return { status: 'purchased' as const, alreadyPurchased: false, inventoryQuantity: inventoryItem.quantity }
    })

    if (result.status === 'active_run') return NextResponse.json({ error: 'Finish your current game before buying a life.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'life_owned') return NextResponse.json({ error: 'You already have one extra life. Use it before buying another.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'insufficient_balance') return NextResponse.json({ error: 'You do not have enough PEPE for this item.' }, { status: 409, headers: arcadeNoStoreHeaders })
    if (result.status === 'idempotency_conflict') return NextResponse.json({ error: 'This purchase request key was already used.' }, { status: 409, headers: arcadeNoStoreHeaders })
    return NextResponse.json({ ...result, itemCode, priceAtomic: String(item.priceAtomic) }, { headers: arcadeNoStoreHeaders })
  } catch (error) {
    console.error('[arcade-shop] Could not complete purchase:', error)
    return NextResponse.json({ error: 'Could not complete the purchase.' }, { status: 500, headers: arcadeNoStoreHeaders })
  }
}
