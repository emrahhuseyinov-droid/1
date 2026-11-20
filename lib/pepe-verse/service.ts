import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  earningEvents,
  guestProfiles,
  referralCommissions,
  pepeVerseProfiles,
  pepeVerseSettings,
  pepeVerseWeeklyScores,
  user,
} from '@/lib/db/schema'
import { getDashboardBalancesAtomic } from '@/lib/dashboard'
import { PEPE_ATOMIC_UNITS } from '@/lib/withdrawal-constants'
import {
  PEPE_VERSE_ACHIEVEMENTS,
  PEPE_VERSE_DAILY_LIMIT,
  PEPE_VERSE_DAILY_REWARDS,
  PEPE_VERSE_SKINS,
  PEPE_VERSE_TASKS,
  PEPE_VERSE_TASK_REWARDS,
  PEPE_VERSE_TOURNAMENT_PRIZES,
  type PepeVerseTaskCode,
} from './catalog'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Profile = typeof pepeVerseProfiles.$inferSelect
type Settings = typeof pepeVerseSettings.$inferSelect

const GAME_REWARD_SOURCES = ['pepe_verse_daily', 'pepe_verse_task', 'pepe_verse_tournament'] as const
const DEFAULT_SETTINGS = {
  enabled: true,
  dailyRewards: [...PEPE_VERSE_DAILY_REWARDS],
  taskRewards: { ...PEPE_VERSE_TASK_REWARDS },
  tournamentPrizes: [...PEPE_VERSE_TOURNAMENT_PRIZES],
  dailyLimit: PEPE_VERSE_DAILY_LIMIT,
}

export class PepeVerseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function dayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function weekStart(date = new Date()) {
  const start = dayStart(date)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return dayKey(start)
}

function previousWeekStart(date = new Date()) {
  const start = new Date(`${weekStart(date)}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 7)
  return dayKey(start)
}

function previousDay(day: string) {
  return dayKey(new Date(Date.parse(`${day}T00:00:00.000Z`) - 86_400_000))
}

async function ensureProfile(transaction: Transaction | typeof db, guestId: string) {
  await transaction.insert(pepeVerseProfiles).values({ guestId }).onConflictDoNothing({ target: pepeVerseProfiles.guestId })
}

async function ensureSettings(transaction: Transaction | typeof db) {
  await transaction.insert(pepeVerseSettings).values({ id: 1 }).onConflictDoNothing({ target: pepeVerseSettings.id })
}

async function lockProfile(transaction: Transaction, guestId: string) {
  await ensureProfile(transaction, guestId)
  const [profile] = await transaction.select().from(pepeVerseProfiles).where(eq(pepeVerseProfiles.guestId, guestId)).for('update').limit(1)
  if (!profile) throw new PepeVerseError('PEPE VERSE profile is unavailable.', 500)
  return profile
}

async function lockSettings(transaction: Transaction) {
  await ensureSettings(transaction)
  const [settings] = await transaction.select().from(pepeVerseSettings).where(eq(pepeVerseSettings.id, 1)).for('update').limit(1)
  if (!settings) throw new PepeVerseError('PEPE VERSE settings are unavailable.', 500)
  return settings
}

function normalizeRewards(settings: Settings) {
  const dailyRewards = Array.isArray(settings.dailyRewards) && settings.dailyRewards.length === 7
    ? settings.dailyRewards.map((value, index) => Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.dailyRewards[index])
    : DEFAULT_SETTINGS.dailyRewards
  const taskRewards = Object.fromEntries(PEPE_VERSE_TASKS.map(({ code }) => {
    const value = settings.taskRewards?.[code]
    return [code, Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.taskRewards[code as PepeVerseTaskCode]]
  })) as Record<PepeVerseTaskCode, number>
  const tournamentPrizes = Array.isArray(settings.tournamentPrizes) && settings.tournamentPrizes.length === 3
    ? settings.tournamentPrizes.map((value, index) => Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.tournamentPrizes[index])
    : DEFAULT_SETTINGS.tournamentPrizes
  return { dailyRewards, taskRewards, tournamentPrizes, dailyLimit: settings.dailyLimit }
}

async function countQualifyingActivity(executor: Transaction | typeof db, guestId: string, sources: readonly string[], from: Date) {
  const [result] = await executor.select({ count: sql<number>`count(*)::int` })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, guestId),
      eq(earningEvents.tokenSymbol, 'PEPE'),
      inArray(earningEvents.source, [...sources]),
      gte(earningEvents.createdAt, from),
      sql`${earningEvents.rewardAtomic} > 0`,
    ))
  return result?.count ?? 0
}

async function countTaskActivity(executor: Transaction | typeof db, guestId: string, task: (typeof PEPE_VERSE_TASKS)[number], from: Date) {
  if (task.code === 'invite') {
    const [result] = await executor.select({ count: sql<number>`count(*)::int` })
      .from(referralCommissions)
      .where(and(eq(referralCommissions.referrerId, guestId), gte(referralCommissions.createdAt, from)))
    return result?.count ?? 0
  }
  return countQualifyingActivity(executor, guestId, task.sources, from)
}

async function countDailyGameClaims(transaction: Transaction, guestId: string, from: Date) {
  const [result] = await transaction.select({ count: sql<number>`count(*)::int` })
    .from(earningEvents)
    .where(and(
      eq(earningEvents.guestId, guestId),
      inArray(earningEvents.source, ['pepe_verse_daily', 'pepe_verse_task']),
      gte(earningEvents.createdAt, from),
    ))
  return result?.count ?? 0
}

async function insertReward(transaction: Transaction, guestId: string, source: string, sourceKey: string, itemId: string, amount: number, now = new Date()) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000) throw new PepeVerseError('Reward amount is outside the allowed range.', 400)
  const [event] = await transaction.insert(earningEvents).values({
    id: randomUUID(),
    guestId,
    source,
    sourceKey,
    itemId,
    tokenSymbol: 'PEPE',
    rewardAtomic: amount * PEPE_ATOMIC_UNITS,
    createdAt: now,
  }).onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] }).returning({ id: earningEvents.id })
  if (!event) throw new PepeVerseError('This reward has already been claimed.', 409)
}

async function grantProgress(transaction: Transaction, profile: Profile, xpGain: number, coinsGain: number, now: Date) {
  const nextXp = profile.xp + xpGain
  const nextCoins = profile.coins + coinsGain
  const achievements = new Set(profile.achievements)
  achievements.add('first-flight')
  if (profile.streak >= 6) achievements.add('seven-day-streak')

  await transaction.update(pepeVerseProfiles).set({
    xp: nextXp,
    level: Math.floor(nextXp / 100) + 1,
    coins: nextCoins,
    achievements: [...achievements],
    updatedAt: now,
  }).where(eq(pepeVerseProfiles.guestId, profile.guestId))

  await transaction.insert(pepeVerseWeeklyScores).values({ guestId: profile.guestId, weekStart: weekStart(now), score: xpGain, updatedAt: now })
    .onConflictDoUpdate({
      target: [pepeVerseWeeklyScores.guestId, pepeVerseWeeklyScores.weekStart],
      set: { score: sql`${pepeVerseWeeklyScores.score} + ${xpGain}`, updatedAt: now },
    })
}

async function profileLabels(guestIds: string[]) {
  if (!guestIds.length) return new Map<string, string>()
  const rows = await db.select({ guestId: guestProfiles.id, name: user.name, referralCode: guestProfiles.referralCode })
    .from(guestProfiles)
    .leftJoin(user, eq(guestProfiles.userId, user.id))
    .where(inArray(guestProfiles.id, guestIds))
  return new Map(rows.map((row) => [row.guestId, row.name?.trim() || `Player ${row.referralCode.slice(0, 4).toUpperCase()}`]))
}

export async function getPepeVerseState(guestId: string) {
  const { profile, settings, balanceAtomic } = await db.transaction(async (transaction) => {
    await ensureProfile(transaction, guestId)
    await ensureSettings(transaction)
    const [[profile], [settings], balance] = await Promise.all([
      transaction.select().from(pepeVerseProfiles).where(eq(pepeVerseProfiles.guestId, guestId)).limit(1),
      transaction.select().from(pepeVerseSettings).where(eq(pepeVerseSettings.id, 1)).limit(1),
      getDashboardBalancesAtomic(guestId, transaction),
    ])
    if (!profile || !settings) throw new PepeVerseError('PEPE VERSE is temporarily unavailable.', 500)
    return { profile, settings, balanceAtomic: balance.PEPE }
  })

  const today = dayKey()
  const since = dayStart()
  const week = weekStart()
  const rewardConfig = normalizeRewards(settings)
  const sourceList = [...new Set(PEPE_VERSE_TASKS.flatMap((task) => [...task.sources]))]
  const [activityRows, claimedRows, weeklyRows, allTimeRows, previousRows, referralActivity] = await Promise.all([
    db.select({ source: earningEvents.source, count: sql<number>`count(*)::int` })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), inArray(earningEvents.source, sourceList), gte(earningEvents.createdAt, since), sql`${earningEvents.rewardAtomic} > 0`))
      .groupBy(earningEvents.source),
    db.select({ sourceKey: earningEvents.sourceKey })
      .from(earningEvents)
      .where(and(eq(earningEvents.guestId, guestId), inArray(earningEvents.source, ['pepe_verse_daily', 'pepe_verse_task']), gte(earningEvents.createdAt, since))),
    db.select({ guestId: pepeVerseWeeklyScores.guestId, score: pepeVerseWeeklyScores.score })
      .from(pepeVerseWeeklyScores).where(eq(pepeVerseWeeklyScores.weekStart, week))
      .orderBy(desc(pepeVerseWeeklyScores.score), asc(pepeVerseWeeklyScores.guestId)).limit(10),
    db.select({ guestId: pepeVerseProfiles.guestId, xp: pepeVerseProfiles.xp })
      .from(pepeVerseProfiles).orderBy(desc(pepeVerseProfiles.xp), asc(pepeVerseProfiles.createdAt)).limit(10),
    db.select({ guestId: pepeVerseWeeklyScores.guestId })
      .from(pepeVerseWeeklyScores).where(eq(pepeVerseWeeklyScores.weekStart, previousWeekStart()))
      .orderBy(desc(pepeVerseWeeklyScores.score), asc(pepeVerseWeeklyScores.guestId)).limit(rewardConfig.tournamentPrizes.length),
    db.select({ count: sql<number>`count(*)::int` }).from(referralCommissions)
      .where(and(eq(referralCommissions.referrerId, guestId), gte(referralCommissions.createdAt, since))),
  ])
  const sourceCounts = new Map(activityRows.map((row) => [row.source, row.count]))
  const claimedKeys = new Set(claimedRows.map((row) => row.sourceKey))
  const weeklyNames = await profileLabels(weeklyRows.map((row) => row.guestId))
  const allTimeNames = await profileLabels(allTimeRows.map((row) => row.guestId))
  const streakIsActive = profile.lastDailyClaim === today || profile.lastDailyClaim === previousDay(today)
  const nextDay = profile.lastDailyClaim === today ? profile.streak : streakIsActive ? profile.streak + 1 : 1
  const rewardConfigForClient = rewardConfig

  return {
    enabled: settings.enabled,
    balanceAtomic,
    profile: {
      xp: profile.xp,
      level: profile.level,
      coins: profile.coins,
      energy: profile.energy,
      stamina: profile.stamina,
      streak: streakIsActive ? profile.streak : 0,
      achievements: profile.achievements,
      skins: profile.skins,
      equippedSkin: profile.equippedSkin,
    },
    daily: {
      day: today,
      canClaim: settings.enabled && profile.lastDailyClaim !== today,
      streak: streakIsActive ? profile.streak : 0,
      nextDay: Math.min(7, Math.max(1, nextDay)),
      rewards: rewardConfigForClient.dailyRewards,
      claimedDays: Array.from({ length: 7 }, (_, index) => index + 1 < nextDay || (index + 1 === nextDay && profile.lastDailyClaim === today)),
    },
    tasks: PEPE_VERSE_TASKS.map((task) => ({
      code: task.code,
      title: task.title,
      description: task.description,
      href: task.href,
      progress: Math.min(1, task.code === 'invite' ? referralActivity[0]?.count ?? 0 : task.sources.reduce((total, source) => total + (sourceCounts.get(source) ?? 0), 0)),
      target: 1,
      reward: rewardConfig.taskRewards[task.code],
      claimed: claimedKeys.has(`${today}:${task.code}`),
    })),
    skins: PEPE_VERSE_SKINS.map((skin) => ({ ...skin, owned: profile.skins.includes(skin.id), equipped: profile.equippedSkin === skin.id })),
    achievements: PEPE_VERSE_ACHIEVEMENTS.map((achievement) => ({ ...achievement, unlocked: profile.achievements.includes(achievement.id) })),
    tournament: {
      weekStart: week,
      previousWeekStart: previousWeekStart(),
      canClaim: previousRows.some((row) => row.guestId === guestId) && previousRows.some((row, index) => row.guestId === guestId && !settings.claimedTournamentPlaces.includes(`${previousWeekStart()}:${index + 1}`)),
      prizes: rewardConfig.tournamentPrizes,
      claimedPlaces: settings.claimedTournamentPlaces,
      current: weeklyRows.map((row, index) => ({ rank: index + 1, name: weeklyNames.get(row.guestId) ?? 'PEPE player', score: row.score, isCurrentUser: row.guestId === guestId })),
      allTime: allTimeRows.map((row, index) => ({ rank: index + 1, name: allTimeNames.get(row.guestId) ?? 'PEPE player', xp: row.xp, isCurrentUser: row.guestId === guestId })),
    },
    dailyLimit: rewardConfig.dailyLimit,
    dailyClaimsRemaining: Math.max(0, rewardConfig.dailyLimit - claimedRows.length),
  }
}

export async function claimPepeVerseDaily(guestId: string) {
  return db.transaction(async (transaction) => {
    const [profile, settings] = await Promise.all([lockProfile(transaction, guestId), lockSettings(transaction)])
    if (!settings.enabled) throw new PepeVerseError('PEPE VERSE is currently disabled.', 403)
    const today = dayKey()
    if (profile.lastDailyClaim === today) throw new PepeVerseError('Today’s daily reward has already been claimed.', 409)
    const config = normalizeRewards(settings)
    if (await countDailyGameClaims(transaction, guestId, dayStart()) >= config.dailyLimit) {
      throw new PepeVerseError('You have reached today’s PEPE VERSE reward limit.', 429)
    }
    const streak = profile.lastDailyClaim === previousDay(today) ? profile.streak + 1 : 1
    const rewardDay = ((streak - 1) % 7) + 1
    const amount = config.dailyRewards[rewardDay - 1]
    const now = new Date()
    await insertReward(transaction, guestId, 'pepe_verse_daily', today, `day-${rewardDay}`, amount, now)
    const skins = new Set(profile.skins)
    if (rewardDay === 7) skins.add('violet-pulse')
    await transaction.update(pepeVerseProfiles).set({
      lastDailyClaim: today,
      streak,
      skins: [...skins],
      updatedAt: now,
    }).where(eq(pepeVerseProfiles.guestId, guestId))
    const updatedProfile = { ...profile, streak }
    await grantProgress(transaction, updatedProfile, 20 + amount, 8, now)
    return { amount, rewardDay, streak, balanceAtomic: String(amount * PEPE_ATOMIC_UNITS), unlockedSkin: rewardDay === 7 ? 'violet-pulse' : null }
  })
}

export async function claimPepeVerseTask(guestId: string, rawCode: unknown) {
  const task = PEPE_VERSE_TASKS.find((item) => item.code === rawCode)
  if (!task) throw new PepeVerseError('Choose a valid PEPE VERSE task.', 400)
  return db.transaction(async (transaction) => {
    const [profile, settings] = await Promise.all([lockProfile(transaction, guestId), lockSettings(transaction)])
    if (!settings.enabled) throw new PepeVerseError('PEPE VERSE is currently disabled.', 403)
    const today = dayKey()
    const config = normalizeRewards(settings)
    if (await countDailyGameClaims(transaction, guestId, dayStart()) >= config.dailyLimit) {
      throw new PepeVerseError('You have reached today’s PEPE VERSE reward limit.', 429)
    }
    const completed = await countTaskActivity(transaction, guestId, task, dayStart())
    if (completed < 1) throw new PepeVerseError('Complete and verify the linked activity before claiming this task.', 409)
    const amount = config.taskRewards[task.code]
    const now = new Date()
    await insertReward(transaction, guestId, 'pepe_verse_task', `${today}:${task.code}`, task.code, amount, now)
    const taskClaims = await transaction.select({ code: earningEvents.itemId })
      .from(earningEvents)
      .where(and(
        eq(earningEvents.guestId, guestId),
        eq(earningEvents.source, 'pepe_verse_task'),
        inArray(earningEvents.itemId, PEPE_VERSE_TASKS.map(({ code }) => code)),
      ))
    const achievements = new Set(profile.achievements)
    if (new Set(taskClaims.map(({ code }) => code).filter((code): code is PepeVerseTaskCode => code !== null)).size === PEPE_VERSE_TASKS.length) {
      achievements.add('task-runner')
    }
    await transaction.update(pepeVerseProfiles).set({ achievements: [...achievements], updatedAt: now }).where(eq(pepeVerseProfiles.guestId, guestId))
    await grantProgress(transaction, { ...profile, achievements: [...achievements] }, 15 + amount, 5, now)
    return { amount, code: task.code }
  })
}

export async function claimPepeVerseTournament(guestId: string) {
  return db.transaction(async (transaction) => {
    const profile = await lockProfile(transaction, guestId)
    const settings = await lockSettings(transaction)
    if (!settings.enabled) throw new PepeVerseError('PEPE VERSE is currently disabled.', 403)
    const config = normalizeRewards(settings)
    const week = previousWeekStart()
    const scores = await transaction.select({ guestId: pepeVerseWeeklyScores.guestId, score: pepeVerseWeeklyScores.score })
      .from(pepeVerseWeeklyScores).where(eq(pepeVerseWeeklyScores.weekStart, week))
      .orderBy(desc(pepeVerseWeeklyScores.score), asc(pepeVerseWeeklyScores.guestId)).limit(config.tournamentPrizes.length)
    const rankIndex = scores.findIndex((row) => row.guestId === guestId)
    if (rankIndex < 0) throw new PepeVerseError('You did not place in last week’s tournament.', 409)
    const place = rankIndex + 1
    const amount = config.tournamentPrizes[rankIndex]
    if (!amount) throw new PepeVerseError('There is no PEPE prize configured for this place.', 409)
    const claimKey = `${week}:${place}`
    if (settings.claimedTournamentPlaces.includes(claimKey)) throw new PepeVerseError('This tournament place has already been paid.', 409)
    const now = new Date()
    await insertReward(transaction, guestId, 'pepe_verse_tournament', claimKey, `place-${place}`, amount, now)
    await transaction.update(pepeVerseSettings).set({
      claimedTournamentPlaces: [...settings.claimedTournamentPlaces, claimKey],
      updatedAt: now,
    }).where(eq(pepeVerseSettings.id, 1))
    const achievements = new Set(profile.achievements)
    achievements.add('first-flight')
    achievements.add('tournament-podium')
    await transaction.update(pepeVerseProfiles).set({
      achievements: [...achievements],
      updatedAt: now,
    }).where(eq(pepeVerseProfiles.guestId, guestId))
    return { amount, place, week }
  })
}

export async function purchasePepeVerseSkin(guestId: string, rawSkinId: unknown) {
  const skin = PEPE_VERSE_SKINS.find((item) => item.id === rawSkinId)
  if (!skin) throw new PepeVerseError('Choose a valid character skin.', 400)
  return db.transaction(async (transaction) => {
    const profile = await lockProfile(transaction, guestId)
    if (profile.skins.includes(skin.id)) {
      await transaction.update(pepeVerseProfiles).set({ equippedSkin: skin.id, updatedAt: new Date() }).where(eq(pepeVerseProfiles.guestId, guestId))
      return { coins: profile.coins, skinId: skin.id }
    }
    if (profile.coins < skin.cost) throw new PepeVerseError('Not enough game credits for this skin.', 409)
    const now = new Date()
    await transaction.update(pepeVerseProfiles).set({
      coins: profile.coins - skin.cost,
      skins: [...profile.skins, skin.id],
      equippedSkin: skin.id,
      updatedAt: now,
    }).where(eq(pepeVerseProfiles.guestId, guestId))
    return { coins: profile.coins - skin.cost, skinId: skin.id }
  })
}

function validRewardArray(value: unknown, length: number, maximum: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((item) => Number.isSafeInteger(item) && item >= 0 && item <= maximum)
}

export async function updatePepeVerseSettings(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PepeVerseError('Invalid settings.', 400)
  const input = raw as Record<string, unknown>
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new PepeVerseError('Game status must be enabled or disabled.', 400)
  if (input.dailyRewards !== undefined && !validRewardArray(input.dailyRewards, 7, 1_000)) throw new PepeVerseError('Daily rewards must contain seven whole PEPE amounts from 0 to 1,000.', 400)
  if (input.tournamentPrizes !== undefined && !validRewardArray(input.tournamentPrizes, 3, 10_000)) throw new PepeVerseError('Tournament prizes must contain three whole PEPE amounts from 0 to 10,000.', 400)
  if (input.dailyLimit !== undefined && (!Number.isInteger(input.dailyLimit) || (input.dailyLimit as number) < 1 || (input.dailyLimit as number) > 20)) throw new PepeVerseError('Daily reward limit must be between 1 and 20.', 400)
  if (input.taskRewards !== undefined) {
    if (!input.taskRewards || typeof input.taskRewards !== 'object' || Array.isArray(input.taskRewards)) throw new PepeVerseError('Invalid task reward settings.', 400)
    const tasks = input.taskRewards as Record<string, unknown>
    if (PEPE_VERSE_TASKS.some(({ code }) => !Number.isSafeInteger(tasks[code]) || (tasks[code] as number) < 0 || (tasks[code] as number) > 1_000)) {
      throw new PepeVerseError('Task rewards must be whole PEPE amounts from 0 to 1,000.', 400)
    }
  }

  return db.transaction(async (transaction) => {
    const settings = await lockSettings(transaction)
    const [updated] = await transaction.update(pepeVerseSettings).set({
      ...(input.enabled !== undefined ? { enabled: input.enabled as boolean } : {}),
      ...(input.dailyRewards !== undefined ? { dailyRewards: input.dailyRewards as number[] } : {}),
      ...(input.taskRewards !== undefined ? { taskRewards: input.taskRewards as Record<string, number> } : {}),
      ...(input.tournamentPrizes !== undefined ? { tournamentPrizes: input.tournamentPrizes as number[] } : {}),
      ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit as number } : {}),
      updatedAt: new Date(),
    }).where(eq(pepeVerseSettings.id, 1)).returning()
    return normalizeRewards(updated ?? settings)
  })
}

export async function getPepeVerseAdminOverview() {
  await ensureSettings(db)
  const [[settings], [totals], recent] = await Promise.all([
    db.select().from(pepeVerseSettings).where(eq(pepeVerseSettings.id, 1)).limit(1),
    db.select({ count: sql<number>`count(*)::int`, totalAtomic: sql<string>`coalesce(sum(${earningEvents.rewardAtomic}), 0)::text` })
      .from(earningEvents).where(and(eq(earningEvents.tokenSymbol, 'PEPE'), inArray(earningEvents.source, [...GAME_REWARD_SOURCES]))),
    db.select({ id: earningEvents.id, guestId: earningEvents.guestId, source: earningEvents.source, sourceKey: earningEvents.sourceKey, itemId: earningEvents.itemId, rewardAtomic: earningEvents.rewardAtomic, createdAt: earningEvents.createdAt })
      .from(earningEvents).where(and(eq(earningEvents.tokenSymbol, 'PEPE'), inArray(earningEvents.source, [...GAME_REWARD_SOURCES])))
      .orderBy(desc(earningEvents.createdAt)).limit(30),
  ])
  if (!settings) throw new PepeVerseError('PEPE VERSE settings are unavailable.', 500)
  return {
    ...normalizeRewards(settings),
    enabled: settings.enabled,
    totalRewards: totals?.count ?? 0,
    totalRewardAtomic: totals?.totalAtomic ?? '0',
    transactions: recent.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  }
}
