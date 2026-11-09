import { sql } from 'drizzle-orm'
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { WalletCoinSymbol } from '@/lib/wallet-assets'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_userId_idx').on(table.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('account_userId_idx').on(table.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)])

export const rateLimit = pgTable('rateLimit', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
}, (table) => [index('rateLimit_lastRequest_idx').on(table.lastRequest)])

export const guestProfiles = pgTable('earnpepe_guest_profiles', {
  id: uuid('id').primaryKey(),
  referralCode: text('referral_code').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  referrerId: uuid('referrer_id'),
  userId: text('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('earnpepe_guest_profiles_user_id_unique').on(table.userId)])

export const earningEvents = pgTable('earnpepe_earning_events', {
  id: uuid('id').primaryKey(),
  guestId: uuid('guest_id').notNull(),
  source: text('source').notNull(),
  sourceKey: text('source_key').notNull(),
  itemId: text('item_id'),
  tokenSymbol: text('token_symbol').$type<WalletCoinSymbol>().notNull().default('HOMERO'),
  rewardAtomic: bigint('reward_atomic', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('earnpepe_earning_events_guest_source_key_unique').on(table.guestId, table.source, table.sourceKey),
  index('earnpepe_earning_events_guest_idx').on(table.guestId, table.source, table.itemId, table.createdAt),
])

export type VideoRewardSessionStatus = 'pending' | 'credited' | 'expired' | 'rejected'

export const videoRewardSessions = pgTable('earnpepe_video_reward_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull(),
  status: text('status').$type<VideoRewardSessionStatus>().notNull().default('pending'),
  tid: text('tid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  unique('earnpepe_video_reward_sessions_tid_key').on(table.tid),
  index('earnpepe_video_reward_sessions_guest_created_idx').on(table.guestId, table.createdAt.desc()),
  check('earnpepe_video_reward_sessions_status_check', sql`${table.status} in ('pending', 'credited', 'expired', 'rejected')`),
  check('earnpepe_video_reward_sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('earnpepe_video_reward_sessions_state_check', sql`(${table.status} = 'pending' and ${table.tid} is null and ${table.completedAt} is null) or (${table.status} = 'credited' and ${table.tid} is not null and ${table.completedAt} is not null) or (${table.status} in ('expired', 'rejected') and ${table.completedAt} is not null)`),
])

export type OfferwallTransactionStatus = 'credited' | 'reversed'

export const offerwallTransactions = pgTable('earnpepe_offerwall_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').$type<'cpx_research'>().notNull().default('cpx_research'),
  providerTransactionId: text('provider_transaction_id').notNull(),
  guestId: uuid('guest_id').notNull().references(() => guestProfiles.id, { onDelete: 'restrict' }),
  status: text('status').$type<OfferwallTransactionStatus>().notNull(),
  amountUsd: numeric('amount_usd', { precision: 24, scale: 18, mode: 'string' }).notNull().default('0'),
  pepeUsdPrice: numeric('pepe_usd_price', { precision: 24, scale: 18, mode: 'string' }),
  userShareBps: integer('user_share_bps').notNull().default(8000),
  rewardAtomic: bigint('reward_atomic', { mode: 'number' }).notNull().default(0),
  platformShareBps: integer('platform_share_bps').notNull().default(2000),
  platformAmountUsd: numeric('platform_amount_usd', { precision: 24, scale: 18, mode: 'string' }).notNull().default('0'),
  platformRewardAtomic: bigint('platform_reward_atomic', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
}, (table) => [
  unique('earnpepe_offerwall_provider_transaction_unique').on(table.provider, table.providerTransactionId),
  index('earnpepe_offerwall_guest_created_idx').on(table.guestId, table.createdAt.desc()),
  check('earnpepe_offerwall_provider_check', sql`${table.provider} = 'cpx_research'`),
  check('earnpepe_offerwall_status_check', sql`${table.status} in ('credited', 'reversed')`),
  check('earnpepe_offerwall_amount_usd_check', sql`${table.amountUsd} >= 0`),
  check('earnpepe_offerwall_price_check', sql`${table.pepeUsdPrice} is null or ${table.pepeUsdPrice} > 0`),
  check('earnpepe_offerwall_share_check', sql`${table.userShareBps} between 0 and 10000`),
  check('earnpepe_offerwall_platform_share_check', sql`${table.platformShareBps} between 0 and 10000`),
  check('earnpepe_offerwall_share_split_check', sql`${table.userShareBps} + ${table.platformShareBps} = 10000`),
  check('earnpepe_offerwall_reward_check', sql`${table.rewardAtomic} >= 0`),
  check('earnpepe_offerwall_platform_amount_check', sql`${table.platformAmountUsd} >= 0`),
  check('earnpepe_offerwall_platform_reward_check', sql`${table.platformRewardAtomic} >= 0`),
  check('earnpepe_offerwall_status_fields_check', sql`(${table.status} = 'credited' and ${table.amountUsd} > 0 and ${table.pepeUsdPrice} is not null and ${table.rewardAtomic} > 0 and ${table.reversedAt} is null) or (${table.status} = 'reversed' and ${table.reversedAt} is not null)`),
])

export type AdsLabOfferwallTransactionStatus = 'credited' | 'reversed'

export const adslabOfferwallTransactions = pgTable('earnpepe_adslab_offerwall_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerTransactionId: text('provider_transaction_id').notNull(),
  guestId: uuid('guest_id').notNull(),
  status: text('status').$type<AdsLabOfferwallTransactionStatus>().notNull(),
  rewardAtomic: bigint('reward_atomic', { mode: 'number' }).notNull().default(0),
  releaseAt: timestamp('release_at', { withTimezone: true }),
  rewardReleased: boolean('reward_released').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
}, (table) => [
  unique('earnpepe_adslab_offerwall_transaction_unique').on(table.providerTransactionId),
  index('earnpepe_adslab_offerwall_guest_created_idx').on(table.guestId, table.createdAt.desc()),
  index('earnpepe_adslab_offerwall_release_idx').on(table.guestId, table.releaseAt).where(sql`${table.status} = 'credited' and ${table.rewardReleased} = false`),
  check('earnpepe_adslab_offerwall_status_check', sql`${table.status} in ('credited', 'reversed')`),
  check('earnpepe_adslab_offerwall_reward_check', sql`${table.rewardAtomic} >= 0`),
  check('earnpepe_adslab_offerwall_state_check', sql`(${table.status} = 'credited' and ${table.rewardAtomic} > 0 and ${table.reversedAt} is null) or (${table.status} = 'reversed' and ${table.reversedAt} is not null)`),
])

export const adslabInterstitialEvents = pgTable('earnpepe_adslab_interstitial_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerTransactionId: text('provider_transaction_id').notNull().unique(),
  guestId: uuid('guest_id'),
  uid: text('uid').notNull(),
  placementId: text('placement_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('earnpepe_adslab_interstitial_guest_created_idx').on(table.guestId, table.createdAt.desc()),
])

export type BannerPromoEventStatus = 'scheduled' | 'shown' | 'clicked' | 'dismissed'

export const bannerPromoEvents = pgTable('earnpepe_banner_promo_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull(),
  day: date('day', { mode: 'string' }).notNull(),
  sequenceNumber: smallint('sequence_number').notNull(),
  status: text('status').$type<BannerPromoEventStatus>().notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  shownAt: timestamp('shown_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  rewardAtomic: bigint('reward_atomic', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('earnpepe_banner_promo_user_day_sequence_unique').on(table.guestId, table.day, table.sequenceNumber),
  index('earnpepe_banner_promo_guest_day_status_idx').on(table.guestId, table.day, table.status),
  check('earnpepe_banner_promo_status_check', sql`${table.status} in ('scheduled', 'shown', 'clicked', 'dismissed')`),
  check('earnpepe_banner_promo_sequence_check', sql`${table.sequenceNumber} between 1 and 15`),
  check('earnpepe_banner_promo_reward_check', sql`${table.rewardAtomic} >= 0`),
  check('earnpepe_banner_promo_state_check', sql`(${table.status} = 'scheduled' and ${table.shownAt} is null and ${table.clickedAt} is null and ${table.dismissedAt} is null and ${table.rewardAtomic} = 0) or (${table.status} = 'shown' and ${table.shownAt} is not null and ${table.clickedAt} is null and ${table.dismissedAt} is null and ${table.rewardAtomic} = 0) or (${table.status} = 'clicked' and ${table.shownAt} is not null and ${table.clickedAt} is not null and ${table.dismissedAt} is null and ${table.rewardAtomic} = 1500000000) or (${table.status} = 'dismissed' and ${table.shownAt} is not null and ${table.clickedAt} is null and ${table.dismissedAt} is not null and ${table.rewardAtomic} = 0)`),
])

export const referralCommissions = pgTable('earnpepe_referral_commissions', {
  id: uuid('id').primaryKey(),
  referrerId: uuid('referrer_id').notNull(),
  referredId: uuid('referred_id').notNull(),
  earningEventId: uuid('earning_event_id').notNull().unique(),
  baseAmountAtomic: bigint('base_amount_atomic', { mode: 'number' }).notNull(),
  commissionAmountAtomic: bigint('commission_amount_atomic', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('earnpepe_commissions_referrer_idx').on(table.referrerId, table.createdAt),
])

export const shortlinkSessions = pgTable('earnpepe_shortlink_sessions', {
  guestId: uuid('guest_id').notNull(),
  linkId: text('link_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.guestId, table.linkId] })])

export type PtcClickStatus = 'pending' | 'completed' | 'rejected'

export const ptcClicks = pgTable('ptc_clicks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  clickId: text('click_id').notNull().unique(),
  providerTransactionId: text('provider_transaction_id'),
  taskId: text('task_id').notNull().default('pepe-casa-1'),
  status: text('status').$type<PtcClickStatus>().notNull().default('pending'),
  payout: numeric('payout', { mode: 'string' }),
  payoutTokenSymbol: text('payout_token_symbol').$type<WalletCoinSymbol>().notNull().default('HOMERO'),
  rewardUsd: numeric('reward_usd', { precision: 24, scale: 18, mode: 'string' }),
  pepeUsdPrice: numeric('pepe_usd_price', { precision: 24, scale: 18, mode: 'string' }),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  visitsPerUser: integer('visits_per_user').notNull().default(1),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ptc_clicks_user_created_idx').on(table.userId, table.createdAt.desc()),
  index('ptc_clicks_user_task_status_idx').on(table.userId, table.taskId, table.status, table.updatedAt.desc()),
  uniqueIndex('ptc_clicks_provider_transaction_id_key').on(table.providerTransactionId).where(sql`${table.providerTransactionId} is not null`),
  check('ptc_clicks_status_check', sql`${table.status} in ('pending', 'completed', 'rejected')`),
  check('ptc_clicks_payout_check', sql`${table.payout} is null or ${table.payout} >= 0`),
])

export type AdvertiserCampaignType = 'ptc' | 'youtube'
export type AdvertiserCampaignStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export const advertiserCampaigns = pgTable('earnpepe_advertiser_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  advertiserId: uuid('advertiser_id').notNull(),
  campaignType: text('campaign_type').$type<AdvertiserCampaignType>().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  targetUrl: text('target_url').notNull(),
  rewardPerTaskAtomic: bigint('reward_per_task_atomic', { mode: 'number' }).notNull(),
  commissionPerTaskAtomic: bigint('commission_per_task_atomic', { mode: 'number' }).notNull().default(2_500_000_000),
  commissionCollectedAtomic: bigint('commission_collected_atomic', { mode: 'number' }).notNull().default(0),
  promotionFeeAtomic: bigint('promotion_fee_atomic', { mode: 'number' }).notNull().default(0),
  promotionStartedAt: timestamp('promotion_started_at', { withTimezone: true }),
  promotionExpiresAt: timestamp('promotion_expires_at', { withTimezone: true }),
  totalBudgetAtomic: bigint('total_budget_atomic', { mode: 'number' }).notNull(),
  totalTasks: integer('total_tasks').notNull(),
  remainingTasks: integer('remaining_tasks').notNull(),
  durationSeconds: integer('duration_seconds').notNull().default(30),
  status: text('status').$type<AdvertiserCampaignStatus>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('earnpepe_advertiser_campaigns_owner_created_idx').on(table.advertiserId, table.createdAt.desc()),
  index('earnpepe_advertiser_campaigns_active_idx').on(table.status, table.campaignType, table.createdAt.desc()),
  check('earnpepe_advertiser_campaigns_campaign_type_check', sql`${table.campaignType} in ('ptc', 'youtube')`),
  check('earnpepe_advertiser_campaigns_title_check', sql`char_length(${table.title}) between 3 and 80`),
  check('earnpepe_advertiser_campaigns_reward_check', sql`${table.rewardPerTaskAtomic} > 0`),
  check('earnpepe_advertiser_campaigns_budget_check', sql`${table.totalBudgetAtomic} > 0`),
  check('earnpepe_advertiser_campaigns_task_count_check', sql`${table.totalTasks} > 0 and ${table.remainingTasks} >= 0 and ${table.remainingTasks} <= ${table.totalTasks}`),
  check('earnpepe_advertiser_campaigns_duration_check', sql`${table.durationSeconds} between 10 and 3600`),
  check('earnpepe_advertiser_campaigns_status_check', sql`${table.status} in ('active', 'paused', 'completed', 'cancelled')`),
  check('earnpepe_advertiser_campaigns_budget_matches_tasks', sql`${table.totalBudgetAtomic} = (${table.rewardPerTaskAtomic} + ${table.commissionPerTaskAtomic}) * ${table.totalTasks}::bigint`),
  check('earnpepe_advertiser_campaigns_commission_collected_check', sql`${table.commissionCollectedAtomic} = ${table.commissionPerTaskAtomic} * (${table.totalTasks} - ${table.remainingTasks})::bigint`),
  check('earnpepe_advertiser_campaigns_promotion_fee_check', sql`${table.promotionFeeAtomic} >= 0`),
  check('earnpepe_advertiser_campaigns_promotion_window_check', sql`(${table.promotionStartedAt} is null and ${table.promotionExpiresAt} is null) or (${table.promotionStartedAt} is not null and ${table.promotionExpiresAt} is not null and ${table.promotionExpiresAt} > ${table.promotionStartedAt})`),
])

export type WithdrawalRequestStatus = 'pending' | 'paid' | 'rejected'

export const withdrawalRequests = pgTable('earnpepe_withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  guestId: uuid('guest_id').notNull(),
  faucetPayEmail: text('faucetpay_email').notNull(),
  requestKey: text('request_key').notNull(),
  amountAtomic: bigint('amount_atomic', { mode: 'number' }).notNull(),
  requestDay: date('request_day', { mode: 'string' }).notNull(),
  status: text('status').$type<WithdrawalRequestStatus>().notNull().default('pending'),
  adminNote: text('admin_note'),
  paymentReference: text('payment_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  processedBy: text('processed_by'),
}, (table) => [
  uniqueIndex('earnpepe_withdrawal_requests_user_key_unique').on(table.userId, table.requestKey),
  index('earnpepe_withdrawal_requests_user_created_idx').on(table.userId, table.createdAt.desc()),
  index('earnpepe_withdrawal_requests_day_status_idx').on(table.userId, table.requestDay, table.status),
  index('earnpepe_withdrawal_requests_status_created_idx').on(table.status, table.createdAt.desc()),
  check('earnpepe_withdrawal_requests_amount_check', sql`${table.amountAtomic} > 0`),
  check('earnpepe_withdrawal_requests_status_check', sql`${table.status} in ('pending', 'paid', 'rejected')`),
  check('earnpepe_withdrawal_requests_email_check', sql`char_length(${table.faucetPayEmail}) between 3 and 254`),
])

export type ArcadeBoostCode = 'jetpack' | 'shield'
export type ArcadeInventoryCode = ArcadeBoostCode | 'life'
export type ArcadeSessionMode = 'ranked' | 'casual'
export type ArcadeSessionStatus = 'running' | 'completed' | 'abandoned' | 'invalid'
export type ArcadeRewardType = 'milestone' | 'weekly'
export type ArcadeRewardStatus = 'pending' | 'paid'
export type ArcadeReserveEntrySource = 'ptc_fee' | 'milestone_payout' | 'weekly_payout'

export const arcadeProfiles = pgTable('earnpepe_arcade_profiles', {
  guestId: uuid('guest_id').primaryKey(),
  energy: numeric('energy', { precision: 4, scale: 2, mode: 'number' }).notNull().default(0),
  dailyEnergyEarned: numeric('daily_energy_earned', { precision: 4, scale: 2, mode: 'number' }).notNull().default(0),
  dailyEnergyDay: date('daily_energy_day', { mode: 'string' }),
  bestDistanceM: bigint('best_distance_m', { mode: 'number' }).notNull().default(0),
  totalRuns: integer('total_runs').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('earnpepe_arcade_profiles_energy_check', sql`${table.energy} between 0 and 15`),
  check('earnpepe_arcade_profiles_daily_energy_check', sql`${table.dailyEnergyEarned} between 0 and 15`),
  check('earnpepe_arcade_profiles_total_runs_check', sql`${table.totalRuns} >= 0`),
])

export const arcadeSessions = pgTable('earnpepe_arcade_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull(),
  mode: text('mode').$type<ArcadeSessionMode>().notNull().default('ranked'),
  status: text('status').$type<ArcadeSessionStatus>().notNull().default('running'),
  runSeed: integer('run_seed').notNull(),
  boostCodes: text('boost_codes').array().$type<ArcadeBoostCode[]>().notNull().default(sql`ARRAY[]::text[]`),
  extraLives: integer('extra_lives').notNull().default(0),
  actionLog: jsonb('action_log').$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  distanceM: bigint('distance_m', { mode: 'number' }).notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  pausedDurationMs: integer('paused_duration_ms').notNull().default(0),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('earnpepe_arcade_sessions_leaderboard_idx').on(table.mode, table.status, table.finishedAt.desc(), table.distanceM.desc()),
  index('earnpepe_arcade_sessions_guest_created_idx').on(table.guestId, table.createdAt.desc()),
  check('earnpepe_arcade_sessions_mode_check', sql`${table.mode} in ('ranked', 'casual')`),
  check('earnpepe_arcade_sessions_status_check', sql`${table.status} in ('running', 'completed', 'abandoned', 'invalid')`),
  check('earnpepe_arcade_sessions_seed_check', sql`${table.runSeed} between 0 and 2147483647`),
  check('earnpepe_arcade_sessions_extra_lives_check', sql`${table.extraLives} between 0 and 1`),
  check('earnpepe_arcade_sessions_boost_mode_check', sql`${table.mode} <> 'ranked' or cardinality(${table.boostCodes}) = 0`),
  check('earnpepe_arcade_sessions_pause_duration_check', sql`${table.pausedDurationMs} >= 0`),
  check('earnpepe_arcade_sessions_finished_check', sql`(${table.status} = 'running' and ${table.finishedAt} is null) or (${table.status} <> 'running' and ${table.finishedAt} is not null)`),
])

export const arcadeInventory = pgTable('earnpepe_arcade_inventory', {
  guestId: uuid('guest_id').notNull(),
  boostCode: text('boost_code').$type<ArcadeInventoryCode>().notNull(),
  quantity: integer('quantity').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.guestId, table.boostCode] }),
  check('earnpepe_arcade_inventory_item_code_check', sql`${table.boostCode} in ('jetpack', 'shield', 'life')`),
  check('earnpepe_arcade_inventory_quantity_check', sql`${table.quantity} >= 0`),
])

export const arcadeReserve = pgTable('earnpepe_arcade_reserve', {
  id: smallint('id').primaryKey().default(1),
  balanceAtomic: bigint('balance_atomic', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('earnpepe_arcade_reserve_singleton_check', sql`${table.id} = 1`),
  check('earnpepe_arcade_reserve_balance_check', sql`${table.balanceAtomic} >= 0`),
])

export const arcadeReserveEntries = pgTable('earnpepe_arcade_reserve_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').$type<ArcadeReserveEntrySource>().notNull(),
  sourceKey: text('source_key').notNull(),
  amountAtomic: bigint('amount_atomic', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('earnpepe_arcade_reserve_entries_source_unique').on(table.sourceType, table.sourceKey),
  index('earnpepe_arcade_reserve_entries_created_idx').on(table.createdAt.desc()),
  check('earnpepe_arcade_reserve_entries_source_check', sql`${table.sourceType} in ('ptc_fee', 'milestone_payout', 'weekly_payout')`),
  check('earnpepe_arcade_reserve_entries_amount_check', sql`${table.amountAtomic} <> 0`),
])

export const arcadeRewardClaims = pgTable('earnpepe_arcade_reward_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull(),
  rewardKey: text('reward_key').notNull(),
  rewardType: text('reward_type').$type<ArcadeRewardType>().notNull(),
  amountAtomic: bigint('amount_atomic', { mode: 'number' }).notNull(),
  status: text('status').$type<ArcadeRewardStatus>().notNull().default('pending'),
  sourceKey: text('source_key').notNull(),
  placement: integer('placement'),
  periodStart: date('period_start', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (table) => [
  unique('earnpepe_arcade_reward_claims_guest_key_unique').on(table.guestId, table.rewardKey),
  index('earnpepe_arcade_reward_claims_pending_idx').on(table.status, table.createdAt).where(sql`${table.status} = 'pending'`),
  check('earnpepe_arcade_reward_claims_type_check', sql`${table.rewardType} in ('milestone', 'weekly')`),
  check('earnpepe_arcade_reward_claims_status_check', sql`${table.status} in ('pending', 'paid')`),
  check('earnpepe_arcade_reward_claims_amount_check', sql`${table.amountAtomic} > 0`),
  check('earnpepe_arcade_reward_claims_paid_check', sql`(${table.status} = 'pending' and ${table.paidAt} is null) or (${table.status} = 'paid' and ${table.paidAt} is not null)`),
])

export type WheelRewardType = 'homero' | 'energy' | 'life'

export const wheelSpins = pgTable('earnpepe_wheel_spins', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull(),
  sectorIndex: smallint('sector_index').notNull(),
  rewardType: text('reward_type').$type<WheelRewardType>().notNull(),
  rewardAtomic: bigint('reward_atomic', { mode: 'number' }).notNull().default(0),
  rewardQuantity: numeric('reward_quantity', { precision: 8, scale: 2, mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
}, (table) => [
  index('earnpepe_wheel_spins_guest_created_idx').on(table.guestId, table.createdAt.desc()),
  check('earnpepe_wheel_spins_sector_check', sql`${table.sectorIndex} between 0 and 7`),
  check('earnpepe_wheel_spins_reward_type_check', sql`${table.rewardType} in ('homero', 'energy', 'life')`),
  check('earnpepe_wheel_spins_reward_value_check', sql`(${table.rewardType} = 'homero' and ${table.rewardAtomic} > 0 and ${table.rewardQuantity} = 0) or (${table.rewardType} in ('energy', 'life') and ${table.rewardAtomic} = 0 and ${table.rewardQuantity} > 0)`),
  check('earnpepe_wheel_spins_claimed_check', sql`${table.claimedAt} is null or ${table.claimedAt} >= ${table.createdAt}`),
])
