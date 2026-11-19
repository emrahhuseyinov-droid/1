import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  earningEvents,
  guestProfiles,
  pepeCrushDaily,
  pepeCrushLevelResults,
  pepeCrushProfiles,
  pepeCrushSessions,
  user,
  type PepeCrushBoosterInventory,
} from '@/lib/db/schema'
import { getDashboardBalancesAtomic } from '@/lib/dashboard'
import { getProfileAvatar } from '@/lib/profile-avatars'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'
import { PEPE_ATOMIC_UNITS } from '@/lib/withdrawal-constants'
import {
  BOOSTER_CODES,
  ENGINE_VERSION,
  emptyBoosterCounts,
  isBoosterCode,
  replayGame,
  starsForState,
  type BoosterCode,
  type BoosterCounts,
  type GameAction,
  type LevelConfig,
} from './engine'
import { getLevelConfig, getLevelTier, MAX_LEVEL_NUMBER } from './levels'
import {
  ACHIEVEMENTS,
  BOOSTER_CAP,
  BOOSTER_INFO,
  DAILY_REWARDS,
  getDailyMissions,
  getUtcDayKey,
  getUtcWeekStart,
  STARTER_BOOSTERS,
  type AchievementMetric,
  type MissionMetric,
} from './catalog'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type ProfileRow = typeof pepeCrushProfiles.$inferSelect
type DailyRow = typeof pepeCrushDaily.$inferSelect

export class PepeCrushError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000
const MIN_MS_PER_ACTION = 180
const MAX_ACTIONS = 400
const REPLAY_REWARD_DAILY_LIMIT = 30

function normalizeBoosters(value: unknown): BoosterCounts {
  const result = emptyBoosterCounts()
  if (value && typeof value === 'object') {
    for (const code of BOOSTER_CODES) {
      const amount = (value as Record<string, unknown>)[code]
      if (Number.isInteger(amount) && (amount as number) > 0) result[code] = Math.min(BOOSTER_CAP, amount as number)
    }
  }
  return result
}

function addBoosters(base: BoosterCounts, extra?: Partial<BoosterCounts>) {
  const next = { ...base }
  if (!extra) return next
  for (const code of BOOSTER_CODES) next[code] = Math.min(BOOSTER_CAP, next[code] + (extra[code] ?? 0))
  return next
}

async function ensureProfile(transaction: Transaction | typeof db, guestId: string) {
  await transaction
    .insert(pepeCrushProfiles)
    .values({ guestId, boosters: { ...STARTER_BOOSTERS } as PepeCrushBoosterInventory })
    .onConflictDoNothing()
}

async function lockProfile(transaction: Transaction, guestId: string): Promise<ProfileRow> {
  await ensureProfile(transaction, guestId)
  const [profile] = await transaction.select().from(pepeCrushProfiles).where(eq(pepeCrushProfiles.guestId, guestId)).for('update')
  if (!profile) throw new PepeCrushError('Profile unavailable.', 500)
  return profile
}

async function getDailyRow(transaction: Transaction | typeof db, guestId: string, day: string, lock = false): Promise<DailyRow> {
  await transaction.insert(pepeCrushDaily).values({ guestId, day }).onConflictDoNothing()
  const query = transaction.select().from(pepeCrushDaily).where(and(eq(pepeCrushDaily.guestId, guestId), eq(pepeCrushDaily.day, day)))
  const [row] = lock ? await query.for('update') : await query
  return row
}

function dailyMetricValue(row: DailyRow, metric: MissionMetric) {
  if (metric === 'levelsWon') return row.levelsWon
  if (metric === 'score') return row.score
  if (metric === 'specials') return row.specials
  if (metric === 'bestCascade') return row.bestCascade
  if (metric === 'boostersUsed') return row.boostersUsed
  return row.stars
}

function achievementMetricValue(profile: ProfileRow, metric: AchievementMetric) {
  return profile[metric]
}

function previousDayKey(dayKey: string) {
  return getUtcDayKey(new Date(Date.parse(`${dayKey}T00:00:00Z`) - 86_400_000))
}

function publicProfile(profile: ProfileRow) {
  return {
    currentLevel: profile.currentLevel,
    levelsCompleted: profile.levelsCompleted,
    totalStars: profile.totalStars,
    totalScore: profile.totalScore,
    bestScore: profile.bestScore,
    wins: profile.wins,
    losses: profile.losses,
    threeStarLevels: profile.threeStarLevels,
    boosters: normalizeBoosters(profile.boosters),
    achievements: profile.achievements,
    specialsCreated: profile.specialsCreated,
    bestCascade: profile.bestCascade,
    streak: profile.streak,
  }
}

export type PepeCrushProfile = ReturnType<typeof publicProfile>

export async function getPepeCrushState(guestId: string) {
  await ensureProfile(db, guestId)
  const today = getUtcDayKey()
  const [[profile], daily, recentSessions, balances] = await Promise.all([
    db.select().from(pepeCrushProfiles).where(eq(pepeCrushProfiles.guestId, guestId)),
    getDailyRow(db, guestId, today),
    db
      .select({
        id: pepeCrushSessions.id,
        level: pepeCrushSessions.level,
        status: pepeCrushSessions.status,
        score: pepeCrushSessions.score,
        stars: pepeCrushSessions.stars,
        finishedAt: pepeCrushSessions.finishedAt,
      })
      .from(pepeCrushSessions)
      .where(and(eq(pepeCrushSessions.guestId, guestId), inArray(pepeCrushSessions.status, ['won', 'lost'])))
      .orderBy(desc(pepeCrushSessions.finishedAt))
      .limit(10),
    getDashboardBalancesAtomic(guestId),
  ])

  const streakAlive = profile.lastDailyClaim === today || profile.lastDailyClaim === previousDayKey(today)
  const nextStreakDay = profile.lastDailyClaim === today ? profile.streak : streakAlive ? profile.streak + 1 : 1

  return {
    profile: publicProfile(profile),
    pepeBalanceAtomic: balances.PEPE,
    tier: getLevelTier(profile.currentLevel),
    daily: {
      day: today,
      canClaimBonus: profile.lastDailyClaim !== today,
      streak: streakAlive ? profile.streak : 0,
      nextRewardDay: ((Math.max(1, nextStreakDay) - 1) % DAILY_REWARDS.length) + 1,
      rewards: DAILY_REWARDS,
      missions: getDailyMissions(today).map((mission) => ({
        ...mission,
        progress: Math.min(dailyMetricValue(daily, mission.metric), mission.target),
        claimed: daily.claimedMissions.includes(mission.code),
      })),
    },
    achievements: ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: profile.achievements.includes(achievement.code),
      progress: Math.min(achievementMetricValue(profile, achievement.metric), achievement.target),
    })),
    shop: BOOSTER_CODES.map((code) => ({
      code,
      price: BOOSTER_INFO[code].price,
      priceAtomic: String(BigInt(BOOSTER_INFO[code].price) * BigInt(PEPE_ATOMIC_UNITS)),
    })),
    recentSessions: recentSessions.map((session) => ({ ...session, finishedAt: session.finishedAt?.toISOString() ?? null })),
  }
}

export async function getLevelResultsRange(guestId: string, from: number, count: number) {
  const start = Math.max(1, Math.min(MAX_LEVEL_NUMBER, Math.floor(from)))
  const size = Math.max(1, Math.min(60, Math.floor(count)))
  const rows = await db
    .select({ level: pepeCrushLevelResults.level, stars: pepeCrushLevelResults.stars, bestScore: pepeCrushLevelResults.bestScore })
    .from(pepeCrushLevelResults)
    .where(and(eq(pepeCrushLevelResults.guestId, guestId), gte(pepeCrushLevelResults.level, start), lte(pepeCrushLevelResults.level, start + size - 1)))
  return rows
}

export async function startPepeCrushSession(guestId: string, requestedLevel: unknown) {
  if (!Number.isInteger(requestedLevel) || (requestedLevel as number) < 1 || (requestedLevel as number) > MAX_LEVEL_NUMBER) {
    throw new PepeCrushError('Invalid level.', 400)
  }
  const level = requestedLevel as number
  await ensureProfile(db, guestId)
  const [profile] = await db.select({ currentLevel: pepeCrushProfiles.currentLevel }).from(pepeCrushProfiles).where(eq(pepeCrushProfiles.guestId, guestId))
  if (level > profile.currentLevel) throw new PepeCrushError('This level is still locked.', 403)

  const config = getLevelConfig(level)
  const seed = randomInt(1, 2_147_483_647)
  const sessionId = await db.transaction(async (transaction) => {
    await transaction
      .update(pepeCrushSessions)
      .set({ status: 'abandoned', finishedAt: new Date() })
      .where(and(eq(pepeCrushSessions.guestId, guestId), eq(pepeCrushSessions.status, 'running')))
    const [session] = await transaction
      .insert(pepeCrushSessions)
      .values({ guestId, level, seed, engineVersion: ENGINE_VERSION })
      .returning({ id: pepeCrushSessions.id })
    return session.id
  })

  return { sessionId, seed, config, tier: getLevelTier(level) }
}

function parseActions(raw: unknown): GameAction[] {
  if (!Array.isArray(raw) || raw.length > MAX_ACTIONS) throw new PepeCrushError('Invalid move list.', 400)
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new PepeCrushError('Invalid move.', 400)
    const action = entry as Record<string, unknown>
    if (action.t === 'swap' && Number.isInteger(action.a) && Number.isInteger(action.b)) {
      return { t: 'swap', a: action.a as number, b: action.b as number }
    }
    if (action.t === 'boost' && isBoosterCode(action.b) && Number.isInteger(action.i)) {
      return { t: 'boost', b: action.b, i: action.i as number }
    }
    throw new PepeCrushError('Invalid move.', 400)
  })
}

function firstCompletionReward(stars: number) {
  return 10 + stars * 5
}

async function recordPepeReward(transaction: Transaction, guestId: string, source: string, sourceKey: string, itemId: string, amount: number, now = new Date()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return
  await transaction.insert(earningEvents).values({
    id: randomUUID(),
    guestId,
    source,
    sourceKey,
    itemId,
    tokenSymbol: 'PEPE',
    rewardAtomic: amount * PEPE_ATOMIC_UNITS,
    createdAt: now,
  })
}

function milestoneBooster(level: number): Partial<BoosterCounts> | undefined {
  if (level % 10 !== 0) return undefined
  const code = BOOSTER_CODES[(level / 10) % BOOSTER_CODES.length] as BoosterCode
  return { [code]: 1 }
}

export async function finishPepeCrushSession(guestId: string, sessionId: string, rawActions: unknown, gaveUp: boolean) {
  const actions = parseActions(rawActions)

  return db.transaction(async (transaction) => {
    const [session] = await transaction
      .select()
      .from(pepeCrushSessions)
      .where(and(eq(pepeCrushSessions.id, sessionId), eq(pepeCrushSessions.guestId, guestId)))
      .for('update')
    if (!session) throw new PepeCrushError('Game session not found.', 404)
    if (session.status !== 'running') throw new PepeCrushError('This game session is already finished.', 409)

    const now = new Date()
    const elapsedMs = now.getTime() - session.startedAt.getTime()
    if (elapsedMs > SESSION_MAX_AGE_MS || session.engineVersion !== ENGINE_VERSION) {
      await transaction.update(pepeCrushSessions).set({ status: 'abandoned', finishedAt: now }).where(eq(pepeCrushSessions.id, session.id))
      return { ok: false as const, reason: 'expired' as const }
    }

    const config: LevelConfig = getLevelConfig(session.level)
    const { state, invalidAt } = replayGame(config, session.seed, actions)
    const tooFast = elapsedMs < actions.length * MIN_MS_PER_ACTION
    const unfinished = state.status === 'playing' && !gaveUp
    const profile = await lockProfile(transaction, guestId)
    const inventory = normalizeBoosters(profile.boosters)
    const overspent = BOOSTER_CODES.some((code) => state.boostersUsed[code] > inventory[code])

    if (invalidAt >= 0 || tooFast || unfinished || overspent) {
      await transaction.update(pepeCrushSessions).set({ status: 'invalid', finishedAt: now }).where(eq(pepeCrushSessions.id, session.id))
      console.warn('[pepe-crush] rejected session', { sessionId: session.id, invalidAt, tooFast, unfinished, overspent })
      return { ok: false as const, reason: 'invalid' as const }
    }

    const won = state.status === 'won'
    const stars = starsForState(state)
    const score = state.score
    const boostersUsedTotal = BOOSTER_CODES.reduce((sum, code) => sum + state.boostersUsed[code], 0)
    const remainingBoosters = { ...inventory }
    for (const code of BOOSTER_CODES) remainingBoosters[code] -= state.boostersUsed[code]

    const today = getUtcDayKey(now)
    const daily = await getDailyRow(transaction, guestId, today, true)

    let levelReward = 0
    let boosterRewards: Partial<BoosterCounts> | undefined
    let firstCompletion = false
    let newStars = 0
    let scoreGain = 0
    let newThreeStar = false

    if (won) {
      const [existing] = await transaction
        .select()
        .from(pepeCrushLevelResults)
        .where(and(eq(pepeCrushLevelResults.guestId, guestId), eq(pepeCrushLevelResults.level, session.level)))
        .for('update')
      firstCompletion = !existing
      const previousStars = existing?.stars ?? 0
      const previousBest = existing?.bestScore ?? 0
      newStars = Math.max(0, stars - previousStars)
      scoreGain = Math.max(0, score - previousBest)
      newThreeStar = stars === 3 && previousStars < 3

      if (firstCompletion) {
        levelReward += firstCompletionReward(stars)
        boosterRewards = milestoneBooster(session.level)
        await transaction.insert(pepeCrushLevelResults).values({ guestId, level: session.level, bestScore: score, stars })
      } else {
        levelReward += newStars * 5
        if (daily.levelsWon < REPLAY_REWARD_DAILY_LIMIT) levelReward += 2
        if (newStars > 0 || scoreGain > 0) {
          await transaction
            .update(pepeCrushLevelResults)
            .set({ bestScore: Math.max(previousBest, score), stars: Math.max(previousStars, stars), updatedAt: now })
            .where(and(eq(pepeCrushLevelResults.guestId, guestId), eq(pepeCrushLevelResults.level, session.level)))
        }
      }
    }

    const updatedProfile: ProfileRow = {
      ...profile,
      currentLevel: won ? Math.min(MAX_LEVEL_NUMBER, Math.max(profile.currentLevel, session.level + 1)) : profile.currentLevel,
      levelsCompleted: profile.levelsCompleted + (firstCompletion ? 1 : 0),
      totalStars: profile.totalStars + newStars,
      totalScore: profile.totalScore + scoreGain,
      bestScore: Math.max(profile.bestScore, score),
      wins: profile.wins + (won ? 1 : 0),
      losses: profile.losses + (won ? 0 : 1),
      threeStarLevels: profile.threeStarLevels + (newThreeStar ? 1 : 0),
      specialsCreated: profile.specialsCreated + state.stats.specialsCreated,
      rainbowsCreated: profile.rainbowsCreated + state.stats.rainbowsCreated,
      bestCascade: Math.max(profile.bestCascade, state.stats.maxCascade),
    }

    let boosters = addBoosters(remainingBoosters, boosterRewards)
    const unlocked = ACHIEVEMENTS.filter((achievement) =>
      !profile.achievements.includes(achievement.code) && achievementMetricValue(updatedProfile, achievement.metric) >= achievement.target,
    )
    let achievementReward = 0
    for (const achievement of unlocked) {
      achievementReward += achievement.reward
      boosters = addBoosters(boosters, achievement.boosters)
    }

    await recordPepeReward(transaction, guestId, 'pepe_crush_level_reward', session.id, 'level-reward', levelReward, now)
    for (const achievement of unlocked) {
      await recordPepeReward(transaction, guestId, 'pepe_crush_achievement_reward', achievement.code, achievement.code, achievement.reward, now)
    }

    await transaction
      .update(pepeCrushProfiles)
      .set({
        currentLevel: updatedProfile.currentLevel,
        levelsCompleted: updatedProfile.levelsCompleted,
        totalStars: updatedProfile.totalStars,
        totalScore: updatedProfile.totalScore,
        bestScore: updatedProfile.bestScore,
        wins: updatedProfile.wins,
        losses: updatedProfile.losses,
        threeStarLevels: updatedProfile.threeStarLevels,
        specialsCreated: updatedProfile.specialsCreated,
        rainbowsCreated: updatedProfile.rainbowsCreated,
        bestCascade: updatedProfile.bestCascade,
        boosters: boosters as PepeCrushBoosterInventory,
        achievements: [...profile.achievements, ...unlocked.map((achievement) => achievement.code)],
        updatedAt: now,
      })
      .where(eq(pepeCrushProfiles.guestId, guestId))

    await transaction
      .update(pepeCrushDaily)
      .set({
        levelsWon: daily.levelsWon + (won ? 1 : 0),
        score: daily.score + score,
        specials: daily.specials + state.stats.specialsCreated,
        boostersUsed: daily.boostersUsed + boostersUsedTotal,
        bestCascade: Math.max(daily.bestCascade, state.stats.maxCascade),
        stars: daily.stars + stars,
      })
      .where(and(eq(pepeCrushDaily.guestId, guestId), eq(pepeCrushDaily.day, today)))

    await transaction
      .update(pepeCrushSessions)
      .set({
        status: won ? 'won' : 'lost',
        score,
        stars,
        movesUsed: state.movesUsed,
        boostersUsed: state.boostersUsed as PepeCrushBoosterInventory,
        finishedAt: now,
      })
      .where(eq(pepeCrushSessions.id, session.id))

    return {
      ok: true as const,
      won,
      level: session.level,
      score,
      stars,
      firstCompletion,
      levelReward,
      boosterRewards: boosterRewards ?? null,
      achievements: unlocked.map((achievement) => ({ code: achievement.code, ru: achievement.ru, en: achievement.en, reward: achievement.reward })),
      achievementReward,
      nextLevel: updatedProfile.currentLevel,
    }
  })
}

export async function claimDailyBonus(guestId: string) {
  return db.transaction(async (transaction) => {
    const profile = await lockProfile(transaction, guestId)
    const today = getUtcDayKey()
    if (profile.lastDailyClaim === today) throw new PepeCrushError('Daily bonus already claimed today.', 409)
    const streak = profile.lastDailyClaim === previousDayKey(today) ? profile.streak + 1 : 1
    const reward = DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length]
    let boosters = addBoosters(normalizeBoosters(profile.boosters), reward.boosters)
    const updated = { ...profile, streak }
    const unlocked = ACHIEVEMENTS.filter((achievement) =>
      !profile.achievements.includes(achievement.code) && achievementMetricValue(updated, achievement.metric) >= achievement.target,
    )
    let achievementReward = 0
    for (const achievement of unlocked) {
      achievementReward += achievement.reward
      boosters = addBoosters(boosters, achievement.boosters)
    }
    const now = new Date()
    await recordPepeReward(transaction, guestId, 'pepe_crush_daily_bonus', today, 'daily-bonus', reward.pepe, now)
    for (const achievement of unlocked) {
      await recordPepeReward(transaction, guestId, 'pepe_crush_achievement_reward', achievement.code, achievement.code, achievement.reward, now)
    }
    await transaction
      .update(pepeCrushProfiles)
      .set({
        streak,
        lastDailyClaim: today,
        boosters: boosters as PepeCrushBoosterInventory,
        achievements: [...profile.achievements, ...unlocked.map((achievement) => achievement.code)],
        updatedAt: now,
      })
      .where(eq(pepeCrushProfiles.guestId, guestId))
    return { streak, reward, achievementReward }
  })
}

export async function claimDailyMission(guestId: string, code: unknown) {
  const today = getUtcDayKey()
  const mission = getDailyMissions(today).find((item) => item.code === code)
  if (!mission) throw new PepeCrushError('Unknown mission.', 400)
  return db.transaction(async (transaction) => {
    await lockProfile(transaction, guestId)
    const daily = await getDailyRow(transaction, guestId, today, true)
    if (daily.claimedMissions.includes(mission.code)) throw new PepeCrushError('Mission reward already claimed.', 409)
    if (dailyMetricValue(daily, mission.metric) < mission.target) throw new PepeCrushError('Mission is not complete yet.', 409)
    await transaction
      .update(pepeCrushDaily)
      .set({ claimedMissions: [...daily.claimedMissions, mission.code] })
      .where(and(eq(pepeCrushDaily.guestId, guestId), eq(pepeCrushDaily.day, today)))
    await recordPepeReward(transaction, guestId, 'pepe_crush_mission_reward', `${today}:${mission.code}`, mission.code, mission.reward)
    return { reward: mission.reward }
  })
}

export async function buyBooster(guestId: string, code: unknown) {
  if (!isBoosterCode(code)) throw new PepeCrushError('Unknown booster.', 400)
  const price = BOOSTER_INFO[code].price
  const priceAtomic = BigInt(price) * BigInt(PEPE_ATOMIC_UNITS)
  return db.transaction(async (transaction) => {
    const [account] = await transaction
      .select({ id: guestProfiles.id })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, guestId))
      .for('update')
      .limit(1)
    if (!account) throw new PepeCrushError('Account not found.', 404)

    const profile = await lockProfile(transaction, guestId)
    const boosters = normalizeBoosters(profile.boosters)
    const balance = await getDashboardBalancesAtomic(guestId, transaction)
    const availableAtomic = BigInt(balance.PEPE)
    if (availableAtomic < priceAtomic) throw new PepeCrushError('Not enough PEPE in your account balance.', 409)
    if (boosters[code] >= BOOSTER_CAP) throw new PepeCrushError('Booster limit reached.', 409)

    const now = new Date()
    await transaction.insert(earningEvents).values({
      id: randomUUID(),
      guestId,
      source: 'pepe_crush_shop_purchase',
      sourceKey: randomUUID(),
      itemId: code,
      tokenSymbol: 'PEPE',
      rewardAtomic: -Number(priceAtomic),
      createdAt: now,
    })
    boosters[code] += 1
    await transaction
      .update(pepeCrushProfiles)
      .set({ boosters: boosters as PepeCrushBoosterInventory, updatedAt: now })
      .where(eq(pepeCrushProfiles.guestId, guestId))
    return { balanceAtomic: (availableAtomic - priceAtomic).toString(), boosters }
  })
}

export type LeaderboardMetric = 'levels' | 'score' | 'stars'
export type LeaderboardScope = 'all' | 'weekly'

async function getDisplayProfiles(guestIds: string[]) {
  if (guestIds.length === 0) return new Map<string, { displayName: string; avatarSrc: string }>()
  const rows = await db
    .select({
      guestId: guestProfiles.id,
      referralCode: guestProfiles.referralCode,
      nickname: user.name,
      avatar: user.image,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(guestProfiles)
    .leftJoin(user, eq(guestProfiles.userId, user.id))
    .where(inArray(guestProfiles.id, guestIds))
  return new Map(rows.map((row) => [row.guestId, {
    displayName: row.nickname?.trim() || `Player ${row.referralCode.slice(0, 4).toUpperCase()}`,
    avatarSrc: String(getProfileAvatar(row.avatar, isPepeReserveAdmin(row.email, row.emailVerified ?? false))),
  }]))
}

export async function getPepeCrushLeaderboard(guestId: string, scope: LeaderboardScope, metric: LeaderboardMetric) {
  let rows: { guestId: string; levels: number; score: number; stars: number }[]
  let myRow: { levels: number; score: number; stars: number } | undefined
  let myRank: number | null = null

  if (scope === 'all') {
    const column = metric === 'levels' ? pepeCrushProfiles.levelsCompleted : metric === 'score' ? pepeCrushProfiles.totalScore : pepeCrushProfiles.totalStars
    const top = await db
      .select({ guestId: pepeCrushProfiles.guestId, levels: pepeCrushProfiles.levelsCompleted, score: pepeCrushProfiles.totalScore, stars: pepeCrushProfiles.totalStars })
      .from(pepeCrushProfiles)
      .where(sql`${pepeCrushProfiles.wins} > 0`)
      .orderBy(desc(column), desc(pepeCrushProfiles.totalStars), pepeCrushProfiles.createdAt)
      .limit(50)
    rows = top
    const [mine] = await db
      .select({ levels: pepeCrushProfiles.levelsCompleted, score: pepeCrushProfiles.totalScore, stars: pepeCrushProfiles.totalStars })
      .from(pepeCrushProfiles)
      .where(eq(pepeCrushProfiles.guestId, guestId))
    myRow = mine
    if (mine && (mine.levels > 0)) {
      const myValue = metric === 'levels' ? mine.levels : metric === 'score' ? mine.score : mine.stars
      const [{ ahead }] = await db
        .select({ ahead: sql<number>`count(*)::int` })
        .from(pepeCrushProfiles)
        .where(and(sql`${pepeCrushProfiles.wins} > 0`, sql`${column} > ${myValue}`))
      myRank = ahead + 1
    }
  } else {
    const weekStart = getUtcWeekStart()
    const orderColumn = metric === 'levels' ? sql.raw('levels') : metric === 'score' ? sql.raw('score') : sql.raw('stars')
    const result = await db.execute<{ guest_id: string; levels: number; score: string; stars: number }>(sql`
      with per_level as (
        select guest_id, level, max(score) as max_score, max(stars) as max_stars
        from earnpepe_crush_sessions
        where status = 'won' and finished_at >= ${weekStart.toISOString()}
        group by guest_id, level
      ), totals as (
        select guest_id, count(*)::int as levels, sum(max_score)::bigint as score, sum(max_stars)::int as stars
        from per_level group by guest_id
      ), ranked as (
        select *, rank() over (order by ${orderColumn} desc) as position from totals
      )
      select guest_id, levels, score, stars, position from ranked
      where position <= 50 or guest_id = ${guestId}
      order by position limit 51
    `)
    const all = result.rows.map((row) => ({
      guestId: row.guest_id,
      levels: Number(row.levels),
      score: Number(row.score),
      stars: Number(row.stars),
      position: Number((row as unknown as { position: number }).position),
    }))
    rows = all.filter((row) => row.position <= 50)
    const mine = all.find((row) => row.guestId === guestId)
    myRow = mine
    myRank = mine?.position ?? null
  }

  const display = await getDisplayProfiles(rows.map((row) => row.guestId))
  return {
    scope,
    metric,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      displayName: display.get(row.guestId)?.displayName ?? 'PEPE player',
      avatarSrc: display.get(row.guestId)?.avatarSrc ?? null,
      levels: row.levels,
      score: Number(row.score),
      stars: row.stars,
      isCurrentUser: row.guestId === guestId,
    })),
    me: myRow ? { rank: myRank, levels: myRow.levels, score: Number(myRow.score), stars: myRow.stars } : null,
  }
}
