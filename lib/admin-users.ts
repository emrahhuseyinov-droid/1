import 'server-only'
import { desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  arcadeSessions,
  earningEvents,
  guestProfiles,
  pepeCrushSessions,
  ptcClicks,
  user as userTable,
  youtubeAdViews,
} from '@/lib/db/schema'
import type { AdminActivityItem, AdminUserActivityPage, AdminUsersResponse } from '@/lib/admin-user-types'
import { isPepeReserveAdmin } from '@/lib/pepe-reserve'

export async function isAdminRequest(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders })
  return Boolean(session?.user && isPepeReserveAdmin(session.user.email, session.user.emailVerified))
}

export async function getAdminUserSummaries(): Promise<AdminUsersResponse> {
  const [registeredUsers, profiles] = await Promise.all([
    db.select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
      createdAt: userTable.createdAt,
    }).from(userTable).orderBy(desc(userTable.createdAt)),
    db.select({ id: guestProfiles.id, userId: guestProfiles.userId })
      .from(guestProfiles)
      .where(isNotNull(guestProfiles.userId)),
  ])

  if (registeredUsers.length === 0) return { users: [], refreshedAt: new Date().toISOString() }

  const guestIds = profiles.map((profile) => profile.id)
  const userIds = registeredUsers.map((registeredUser) => registeredUser.id)
  const [earningStats, ptcStats, arcadeStats, crushStats, youtubeStats, latestActivityResult] = await Promise.all([
    guestIds.length
      ? db.select({
          guestId: earningEvents.guestId,
          recordedEvents: sql<number>`count(*)::int`,
          tasksCompleted: sql<number>`count(*) filter (where ${earningEvents.source} in ('adslab_ptc', 'adslab_shortlink', 'advertiser_task', 'youtube_advertiser_task', 'view_ads', 'shortlink', 'applixir_video', 'faucetpay_paidview', 'adslab_offerwall', 'offerwall_me'))::int`,
          latestAt: sql<Date | null>`max(${earningEvents.createdAt})`,
        }).from(earningEvents)
          .where(inArray(earningEvents.guestId, guestIds))
          .groupBy(earningEvents.guestId)
      : Promise.resolve([]),
    db.select({
      userId: ptcClicks.userId,
      completions: sql<number>`count(*) filter (where ${ptcClicks.status} = 'completed')::int`,
      latestAt: sql<Date | null>`max(${ptcClicks.updatedAt})`,
    }).from(ptcClicks).where(inArray(ptcClicks.userId, userIds)).groupBy(ptcClicks.userId),
    guestIds.length
      ? db.select({
          guestId: arcadeSessions.guestId,
          runs: sql<number>`count(*)::int`,
          latestAt: sql<Date | null>`max(${arcadeSessions.startedAt})`,
        }).from(arcadeSessions).where(inArray(arcadeSessions.guestId, guestIds)).groupBy(arcadeSessions.guestId)
      : Promise.resolve([]),
    guestIds.length
      ? db.select({
          guestId: pepeCrushSessions.guestId,
          games: sql<number>`count(*)::int`,
          latestAt: sql<Date | null>`max(${pepeCrushSessions.startedAt})`,
        }).from(pepeCrushSessions).where(inArray(pepeCrushSessions.guestId, guestIds)).groupBy(pepeCrushSessions.guestId)
      : Promise.resolve([]),
    guestIds.length
      ? db.select({
          guestId: youtubeAdViews.guestId,
          completions: sql<number>`count(*) filter (where ${youtubeAdViews.status} = 'completed')::int`,
          latestAt: sql<Date | null>`max(coalesce(${youtubeAdViews.completedAt}, ${youtubeAdViews.startedAt}))`,
        }).from(youtubeAdViews).where(inArray(youtubeAdViews.guestId, guestIds)).groupBy(youtubeAdViews.guestId)
      : Promise.resolve([]),
    db.execute(sql<{ userId: string; latestAt: Date | null }>`
      with requested_users as (
        select unnest(${sql.param(userIds)}::text[]) as user_id
      )
      select user_id as "userId", max(occurred_at) as "latestAt"
      from (
        select profile.user_id, event.created_at as occurred_at
        from public.earnpepe_earning_events event
        join public.earnpepe_guest_profiles profile on profile.id = event.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select click.user_id, click.updated_at from public.ptc_clicks click
        where click.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, game.started_at from public.earnpepe_arcade_sessions game
        join public.earnpepe_guest_profiles profile on profile.id = game.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, game.started_at from public.earnpepe_crush_sessions game
        join public.earnpepe_guest_profiles profile on profile.id = game.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, coalesce(ad_view.completed_at, ad_view.started_at) from public.earnpepe_youtube_ad_views ad_view
        join public.earnpepe_guest_profiles profile on profile.id = ad_view.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, spin.created_at from public.earnpepe_wheel_spins spin
        join public.earnpepe_guest_profiles profile on profile.id = spin.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, coalesce(event.dismissed_at, event.clicked_at, event.shown_at, event.scheduled_at)
        from public.earnpepe_banner_promo_events event
        join public.earnpepe_guest_profiles profile on profile.id = event.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, links.started_at from public.earnpepe_shortlink_sessions links
        join public.earnpepe_guest_profiles profile on profile.id = links.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select profile.user_id, coalesce(video.completed_at, video.created_at) from public.earnpepe_video_reward_sessions video
        join public.earnpepe_guest_profiles profile on profile.id = video.guest_id
        where profile.user_id in (select user_id from requested_users)
        union all
        select login.user_id, login.recorded_at from public.earnpepe_referral_login_days login
        where login.user_id in (select user_id from requested_users)
        union all
        select withdrawal.user_id, withdrawal.updated_at from public.earnpepe_withdrawal_requests withdrawal
        where withdrawal.user_id in (select user_id from requested_users)
        union all
        select deposit.user_id, deposit.updated_at from public.earnpepe_advertiser_deposits deposit
        where deposit.user_id in (select user_id from requested_users)
      ) user_activity
      where user_id is not null
      group by user_id
    `),
  ])

  const profileByUserId = new Map(profiles.filter((profile) => profile.userId).map((profile) => [profile.userId as string, profile]))
  const earningsByGuest = new Map(earningStats.map((row) => [row.guestId, row]))
  const ptcByUser = new Map(ptcStats.map((row) => [row.userId, row]))
  const arcadeByGuest = new Map(arcadeStats.map((row) => [row.guestId, row]))
  const crushByGuest = new Map(crushStats.map((row) => [row.guestId, row]))
  const youtubeByGuest = new Map(youtubeStats.map((row) => [row.guestId, row]))
  const latestActivityRows = latestActivityResult.rows as { userId: string; latestAt: Date | null }[]
  const latestActivityByUser = new Map<string, Date | null>(latestActivityRows.map((row) => [row.userId, row.latestAt]))

  const users = registeredUsers.map((registeredUser) => {
    const profile = profileByUserId.get(registeredUser.id)
    const earning = profile ? earningsByGuest.get(profile.id) : undefined
    const ptc = ptcByUser.get(registeredUser.id)
    const arcade = profile ? arcadeByGuest.get(profile.id) : undefined
    const crush = profile ? crushByGuest.get(profile.id) : undefined
    const youtube = profile ? youtubeByGuest.get(profile.id) : undefined
    const latestDate = latestActivityByUser.get(registeredUser.id)

    return {
      id: registeredUser.id,
      name: registeredUser.name,
      email: registeredUser.email,
      emailVerified: registeredUser.emailVerified,
      registeredAt: registeredUser.createdAt.toISOString(),
      guestId: profile?.id ?? null,
      tasksCompleted: Number(earning?.tasksCompleted ?? 0),
      recordedEvents: Number(earning?.recordedEvents ?? 0),
      arcadeRuns: Number(arcade?.runs ?? 0),
      crushGames: Number(crush?.games ?? 0),
      ptcCompletions: Number(ptc?.completions ?? 0),
      youtubeCompletions: Number(youtube?.completions ?? 0),
      latestActivityAt: latestDate?.toISOString() ?? null,
    }
  })

  return { users, refreshedAt: new Date().toISOString() }
}

const activityPageSize = 50

type RawActivity = {
  eventId: string
  occurredAt: Date
  kind: AdminActivityItem['kind']
  title: string
  detail: string
  amount: string | null
  amountUnit: AdminActivityItem['amountUnit']
  tokenSymbol: string | null
}

export async function getAdminUserActivity(
  userId: string,
  beforeAt?: Date,
  beforeId?: string,
): Promise<AdminUserActivityPage | null> {
  const [registeredUser] = await db.select({
    id: userTable.id,
    name: userTable.name,
    email: userTable.email,
    createdAt: userTable.createdAt,
  }).from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!registeredUser) return null

  const [profile] = await db.select({ id: guestProfiles.id })
    .from(guestProfiles)
    .where(eq(guestProfiles.userId, registeredUser.id))
    .limit(1)
  const guestId = profile?.id ?? null

  const result = await db.execute(sql<RawActivity>`
    with activity as (
      select
        'earning:' || ee.id::text as event_id,
        ee.created_at as occurred_at,
        case when ee.source in ('adslab_ptc', 'adslab_shortlink', 'advertiser_task', 'youtube_advertiser_task', 'view_ads', 'shortlink', 'applixir_video', 'faucetpay_paidview', 'adslab_offerwall', 'offerwall_me') then 'task' else 'reward' end as kind,
        case ee.source
          when 'adslab_ptc' then 'AdsLab PTC'
          when 'adslab_shortlink' then 'AdsLab shortlink'
          when 'advertiser_task' then 'PTC task'
          when 'youtube_advertiser_task' then 'YouTube task'
          when 'view_ads' then 'View Ads task'
          when 'shortlink' then 'Shortlink task'
          when 'applixir_video' then 'Reward video'
          when 'faucetpay_paidview' then 'FaucetPay paid view'
          when 'adslab_offerwall' then 'AdsLab offerwall'
          when 'offerwall_me' then 'Offerwall.me'
          when 'manual_claim' then 'Faucet claim'
          when 'daily_bonus' then 'Daily bonus'
          when 'wheel_of_fortune' then 'Wheel of Fortune reward'
          when 'pepe_crush_level_reward' then 'PEPE Crush level reward'
          when 'pepe_crush_achievement_reward' then 'PEPE Crush achievement'
          when 'pepe_crush_daily_bonus' then 'PEPE Crush daily bonus'
          when 'pepe_crush_mission_reward' then 'PEPE Crush mission reward'
          when 'pepe_verse_daily' then 'PEPE VERSE daily reward'
          when 'pepe_verse_task' then 'PEPE VERSE task'
          when 'pepe_verse_tournament' then 'PEPE VERSE tournament reward'
          when 'admin_adjustment' then 'Account adjustment'
          else replace(ee.source, '_', ' ')
        end::text as title,
        coalesce(campaign.title, ee.item_id, ee.source)::text as detail,
        ee.reward_atomic::text as amount,
        'atomic'::text as amount_unit,
        ee.token_symbol::text as token_symbol
      from public.earnpepe_earning_events ee
      left join public.earnpepe_advertiser_campaigns campaign
        on campaign.id::text = ee.item_id and ee.source in ('advertiser_task', 'youtube_advertiser_task')
      where ee.guest_id = ${guestId}::uuid

      union all

      select
        'ptc:' || pc.id::text, pc.updated_at, 'task'::text, 'PTC task'::text,
        concat(pc.task_id, ' · ', pc.status), pc.payout::text, 'token'::text, pc.payout_token_symbol::text
      from public.ptc_clicks pc where pc.user_id = ${registeredUser.id}

      union all

      select
        'arcade:' || game.id::text, game.started_at, 'game'::text, 'PEPE RUNNER'::text,
        concat('Mode: ', game.mode, ' · Status: ', game.status, ' · Distance: ', game.distance_m, ' m'),
        null::text, null::text, null::text
      from public.earnpepe_arcade_sessions game where game.guest_id = ${guestId}::uuid

      union all

      select
        'crush:' || game.id::text, game.started_at, 'game'::text, concat('PEPE Crush — level ', game.level),
        concat('Status: ', game.status, ' · Score: ', game.score, ' · Stars: ', game.stars),
        null::text, null::text, null::text
      from public.earnpepe_crush_sessions game where game.guest_id = ${guestId}::uuid

      union all

      select
        'youtube:' || ad_view.id::text, ad_view.started_at, 'task'::text, 'YouTube sponsored task'::text,
        concat(coalesce(campaign.title, 'Campaign'), ' · Status: ', ad_view.status),
        null::text, null::text, null::text
      from public.earnpepe_youtube_ad_views ad_view
      left join public.earnpepe_advertiser_campaigns campaign on campaign.id = ad_view.campaign_id
      where ad_view.guest_id = ${guestId}::uuid

      union all

      select
        'wheel:' || spin.id::text, spin.created_at, 'reward'::text, 'Wheel of Fortune'::text,
        concat(spin.reward_type, case when spin.reward_quantity > 0 then concat(' · ', spin.reward_quantity) else '' end),
        case when spin.reward_type = 'homero' then spin.reward_atomic::text else null::text end,
        case when spin.reward_type = 'homero' then 'atomic'::text else null::text end,
        case when spin.reward_type = 'homero' then 'HOMERO'::text else null::text end
      from public.earnpepe_wheel_spins spin where spin.guest_id = ${guestId}::uuid

      union all

      select
        'promo:' || event.id::text,
        coalesce(event.dismissed_at, event.clicked_at, event.shown_at, event.scheduled_at),
        'promotion'::text, 'Promo banner'::text, concat('Status: ', event.status),
        null::text, null::text, null::text
      from public.earnpepe_banner_promo_events event where event.guest_id = ${guestId}::uuid

      union all

      select
        'shortlink:' || links.guest_id::text || ':' || links.link_id,
        links.started_at, 'task'::text, 'Shortlink opened'::text, links.link_id,
        null::text, null::text, null::text
      from public.earnpepe_shortlink_sessions links where links.guest_id = ${guestId}::uuid

      union all

      select
        'video:' || video.id::text, coalesce(video.completed_at, video.created_at), 'task'::text,
        'Reward video session'::text, concat('Status: ', video.status),
        null::text, null::text, null::text
      from public.earnpepe_video_reward_sessions video where video.guest_id = ${guestId}::uuid

      union all

      select
        'login:' || login.user_id || ':' || login.login_day::text,
        login.recorded_at, 'account'::text, 'Site login'::text, login.login_day::text,
        null::text, null::text, null::text
      from public.earnpepe_referral_login_days login where login.user_id = ${registeredUser.id}

      union all

      select
        'withdrawal:' || withdrawal.id::text, withdrawal.created_at, 'finance'::text,
        'PEPE withdrawal request'::text, concat('Status: ', withdrawal.status),
        withdrawal.amount_atomic::text, 'atomic'::text, 'PEPE'::text
      from public.earnpepe_withdrawal_requests withdrawal where withdrawal.user_id = ${registeredUser.id}

      union all

      select
        'deposit:' || deposit.id::text, deposit.created_at, 'finance'::text,
        'Advertiser deposit'::text, concat('Status: ', deposit.status),
        deposit.amount_atomic::text, 'atomic'::text, 'PEPE'::text
      from public.earnpepe_advertiser_deposits deposit where deposit.user_id = ${registeredUser.id}
    )
    select
      event_id as "eventId",
      occurred_at as "occurredAt",
      kind,
      title,
      detail,
      amount,
      amount_unit as "amountUnit",
      token_symbol as "tokenSymbol"
    from activity
    where (${beforeAt ?? null}::timestamptz is null or (occurred_at, event_id) < (${beforeAt ?? null}::timestamptz, ${beforeId ?? ''}::text))
    order by occurred_at desc, event_id desc
    limit ${activityPageSize + 1}
  `)

  const rows = result.rows as RawActivity[]
  const hasMore = rows.length > activityPageSize
  const pageRows = rows.slice(0, activityPageSize)
  const events: AdminActivityItem[] = pageRows.map((row) => ({
    eventId: row.eventId,
    occurredAt: new Date(row.occurredAt).toISOString(),
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    amount: row.amount,
    amountUnit: row.amountUnit,
    tokenSymbol: row.tokenSymbol,
  }))
  const lastEvent = pageRows.at(-1)

  return {
    user: {
      id: registeredUser.id,
      name: registeredUser.name,
      email: registeredUser.email,
      registeredAt: registeredUser.createdAt.toISOString(),
    },
    events,
    nextCursor: hasMore && lastEvent
      ? { occurredAt: new Date(lastEvent.occurredAt).toISOString(), eventId: lastEvent.eventId }
      : null,
  }
}
