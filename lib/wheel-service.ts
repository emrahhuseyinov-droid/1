import 'server-only'
import { randomInt } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { arcadeInventory, arcadeProfiles, guestProfiles, wheelCaptchaSessions, wheelSpins } from '@/lib/db/schema'
import { lockArcadeProfile } from '@/lib/arcade-service'
import { ARCADE_ENERGY_CAP } from '@/lib/arcade-gameplay'
import { getHomeroTreasuryAdminProfile, getHomeroTreasurySnapshot, lockHomeroTreasuryProfiles, recordHomeroTreasuryTransfer } from '@/lib/homero-treasury'
import { chooseWheelSector, wheelSectors, WHEEL_COOLDOWN_MS } from '@/lib/wheel-of-fortune'

export class WheelServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'cooldown' | 'not_found' | 'energy_full' | 'profile_missing' | 'captcha_required' | 'treasury_unavailable',
    readonly nextAllowedAt?: string,
  ) {
    super(message)
  }
}

function serializeSpin(spin: typeof wheelSpins.$inferSelect) {
  return {
    id: spin.id,
    sectorIndex: spin.sectorIndex,
    rewardType: spin.rewardType,
    rewardAtomic: String(spin.rewardAtomic),
    rewardQuantity: spin.rewardQuantity,
    createdAt: spin.createdAt.toISOString(),
    claimedAt: spin.claimedAt?.toISOString() ?? null,
  }
}

export async function getWheelState(guestId: string, now = new Date()) {
  const [lastSpin] = await db
    .select()
    .from(wheelSpins)
    .where(eq(wheelSpins.guestId, guestId))
    .orderBy(desc(wheelSpins.createdAt))
    .limit(1)

  const nextSpinAt = lastSpin ? new Date(lastSpin.createdAt.getTime() + WHEEL_COOLDOWN_MS) : null
  return {
    cooldownMs: WHEEL_COOLDOWN_MS,
    nextSpinAt: nextSpinAt?.toISOString() ?? null,
    cooldownRemainingMs: nextSpinAt ? Math.max(0, nextSpinAt.getTime() - now.getTime()) : 0,
    lastSpin: lastSpin ? serializeSpin(lastSpin) : null,
  }
}

export async function startWheelSpin(guestId: string, captchaSessionId: string, now = new Date()) {
  return db.transaction(async (transaction) => {
    const [captchaSession] = await transaction
      .select({ status: wheelCaptchaSessions.status, expiresAt: wheelCaptchaSessions.expiresAt })
      .from(wheelCaptchaSessions)
      .where(and(
        eq(wheelCaptchaSessions.id, captchaSessionId),
        eq(wheelCaptchaSessions.guestId, guestId),
      ))
      .for('update')
      .limit(1)

    if (!captchaSession || captchaSession.status !== 'verified' || captchaSession.expiresAt <= now) {
      throw new WheelServiceError('AdsLab has not confirmed this CAPTCHA yet.', 403, 'captcha_required')
    }

    const [lockedProfile] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
      .limit(1)

    if (!lockedProfile) throw new WheelServiceError('Account profile not found.', 404, 'profile_missing')

    const [lastSpin] = await transaction
      .select({ createdAt: wheelSpins.createdAt })
      .from(wheelSpins)
      .where(eq(wheelSpins.guestId, guestId))
      .orderBy(desc(wheelSpins.createdAt))
      .limit(1)

    if (lastSpin) {
      const nextAllowedAt = new Date(lastSpin.createdAt.getTime() + WHEEL_COOLDOWN_MS)
      if (now < nextAllowedAt) {
        throw new WheelServiceError('Your next free spin is not ready yet.', 429, 'cooldown', nextAllowedAt.toISOString())
      }
    }

    const [consumedSession] = await transaction
      .update(wheelCaptchaSessions)
      .set({ status: 'consumed', consumedAt: now })
      .where(and(
        eq(wheelCaptchaSessions.id, captchaSessionId),
        eq(wheelCaptchaSessions.guestId, guestId),
        eq(wheelCaptchaSessions.status, 'verified'),
      ))
      .returning({ id: wheelCaptchaSessions.id })

    if (!consumedSession) throw new WheelServiceError('AdsLab has not confirmed this CAPTCHA yet.', 403, 'captcha_required')

    const sectorIndex = chooseWheelSector(randomInt(0, 10_000))
    const sector = wheelSectors[sectorIndex]
    const [spin] = await transaction
      .insert(wheelSpins)
      .values({
        guestId,
        sectorIndex,
        rewardType: sector.rewardType,
        rewardAtomic: sector.rewardAtomic,
        rewardQuantity: sector.rewardQuantity,
        createdAt: now,
      })
      .returning()

    if (!spin) throw new Error('The wheel spin could not be saved.')
    return { ...serializeSpin(spin), nextSpinAt: new Date(now.getTime() + WHEEL_COOLDOWN_MS).toISOString() }
  })
}

export async function claimWheelReward(guestId: string, spinId: string, now = new Date()) {
  const [spinIdentity] = await db
    .select({ rewardType: wheelSpins.rewardType })
    .from(wheelSpins)
    .where(and(eq(wheelSpins.id, spinId), eq(wheelSpins.guestId, guestId)))
    .limit(1)
  const treasuryAdmin = spinIdentity?.rewardType === 'homero' ? await getHomeroTreasuryAdminProfile() : null

  return db.transaction(async (transaction) => {
    if (spinIdentity?.rewardType === 'homero' && treasuryAdmin) {
      await lockHomeroTreasuryProfiles(transaction, [treasuryAdmin.id, guestId])
    }

    const [spin] = await transaction
      .select()
      .from(wheelSpins)
      .where(and(eq(wheelSpins.id, spinId), eq(wheelSpins.guestId, guestId)))
      .for('update')
      .limit(1)

    if (!spin) throw new WheelServiceError('That wheel result was not found.', 404, 'not_found')
    if (spin.claimedAt) return { spin: serializeSpin(spin), alreadyClaimed: true, energy: null }

    if (spin.rewardType === 'homero') {
      if (!treasuryAdmin) {
        throw new WheelServiceError('The HOMERO treasury is temporarily unavailable.', 503, 'treasury_unavailable')
      }
      const treasury = await getHomeroTreasurySnapshot(transaction, treasuryAdmin.id)
      const rewardAtomic = BigInt(spin.rewardAtomic)
      if (
        !treasury.initialReserveSeeded ||
        BigInt(treasury.availableAtomic) < rewardAtomic ||
        BigInt(treasury.remainingSupplyAtomic) < rewardAtomic
      ) {
        throw new WheelServiceError('The HOMERO treasury cannot fund this reward yet.', 503, 'treasury_unavailable')
      }
      await recordHomeroTreasuryTransfer(
        transaction,
        treasuryAdmin.id,
        guestId,
        spin.rewardAtomic,
        spin.id,
        'wheel_of_fortune',
        wheelSectors[spin.sectorIndex].key,
        now,
      )
    }

    let energy: number | null = null
    if (spin.rewardType === 'energy') {
      const profile = await lockArcadeProfile(transaction, guestId)
      if (profile.energy + spin.rewardQuantity > ARCADE_ENERGY_CAP) {
        throw new WheelServiceError('Make room in your Arcade energy before claiming this reward.', 409, 'energy_full')
      }

      const [updated] = await transaction
        .update(arcadeProfiles)
        .set({ energy: profile.energy + spin.rewardQuantity, updatedAt: now })
        .where(eq(arcadeProfiles.guestId, guestId))
        .returning({ energy: arcadeProfiles.energy })
      if (!updated) throw new Error('Could not add Arcade energy.')
      energy = updated.energy
    }

    if (spin.rewardType === 'life') {
      const quantity = Math.round(spin.rewardQuantity)
      await transaction
        .insert(arcadeInventory)
        .values({ guestId, boostCode: 'life', quantity, updatedAt: now })
        .onConflictDoUpdate({
          target: [arcadeInventory.guestId, arcadeInventory.boostCode],
          set: { quantity: sql`${arcadeInventory.quantity} + ${quantity}`, updatedAt: now },
        })
    }

    const [claimed] = await transaction
      .update(wheelSpins)
      .set({ claimedAt: now })
      .where(and(eq(wheelSpins.id, spinId), eq(wheelSpins.guestId, guestId), sql`${wheelSpins.claimedAt} is null`))
      .returning()

    if (!claimed) throw new Error('The wheel reward could not be marked as claimed.')
    return { spin: serializeSpin(claimed), alreadyClaimed: false, energy }
  })
}
