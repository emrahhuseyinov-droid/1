import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { ensureAccountProfile } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { earningEvents, user } from '@/lib/db/schema'

export const PEPE_RESERVE_FUNDING_SOURCE = 'pepe_reserve_funding'
export const PEPE_RESERVE_SWAP_SOURCE = 'pepe_reserve_swap'
export const PEPE_RESERVE_MINING_SOURCE = 'homero_mining_reserve'
export const PEPE_RESERVE_ARCADE_WEEKLY_SOURCE = 'arcade_weekly_reward'
export const PEPE_SWAP_COMMISSION_SOURCE = 'pepe_swap_commission'
export const PEPE_RESERVE_EVENT_SOURCES = [PEPE_RESERVE_FUNDING_SOURCE, PEPE_RESERVE_SWAP_SOURCE, PEPE_RESERVE_MINING_SOURCE, PEPE_RESERVE_ARCADE_WEEKLY_SOURCE] as const
export const PEPE_RESERVE_INITIAL_SOURCE_KEYS = ['initial-100m-1', 'initial-100m-2'] as const
export const PEPE_RESERVE_INITIAL_CHUNKS_ATOMIC = [5_000_000_000_000_000, 5_000_000_000_000_000] as const

export function isPepeReserveAdmin(email: string | null | undefined, emailVerified: boolean) {
  const configuredEmail = process.env.PEPE_RESERVE_ADMIN_EMAIL?.trim().toLowerCase()
  return Boolean(emailVerified && configuredEmail && email?.trim().toLowerCase() === configuredEmail)
}

export async function getPepeReserveAdminProfile() {
  const configuredEmail = process.env.PEPE_RESERVE_ADMIN_EMAIL?.trim().toLowerCase()
  if (!configuredEmail) return null

  const [adminUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.emailVerified, true), sql`lower(${user.email}) = ${configuredEmail}`))
    .limit(1)

  if (!adminUser) return null
  return ensureAccountProfile(adminUser.id)
}

export async function getPepeReserveSnapshot(guestId: string) {
  const [balanceRows, seedRows] = await Promise.all([
    db.select({ amount: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.tokenSymbol, 'PEPE'),
        inArray(earningEvents.source, [...PEPE_RESERVE_EVENT_SOURCES]),
      )),
    db.select({ sourceKey: earningEvents.sourceKey })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, PEPE_RESERVE_FUNDING_SOURCE),
        inArray(earningEvents.sourceKey, [...PEPE_RESERVE_INITIAL_SOURCE_KEYS]),
      )),
  ])

  const availableAtomic = BigInt(balanceRows[0]?.amount ?? '0')
  return {
    availableAtomic: availableAtomic.toString(),
    initialReserveSeeded: seedRows.length === PEPE_RESERVE_INITIAL_SOURCE_KEYS.length,
  }
}
