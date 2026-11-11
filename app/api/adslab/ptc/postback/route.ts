import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, like, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { ADSLAB_PTC_PLACEMENT_ID, ADSLAB_PTC_TASK_PREFIX, ADSLAB_SHORTLINK_TASK_PREFIX, adsLabPtcRewardMatches, formatHomeroPayoutAtomic, normalizeAdsLabUsd, parseAdsLabGrossRewardAtomic, parseAdsLabRewardAtomic, parseHomeroPayoutAtomic } from '@/lib/adslab-ptc'
import { grantPtcArcadeEnergy, grantShortlinkArcadeEnergy } from '@/lib/arcade-service'
import { db } from '@/lib/db'
import { earningEvents, guestProfiles, ptcClicks } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const transactionIdPattern = /^[A-Za-z0-9._:-]{1,128}$/
const signaturePattern = /^[a-f0-9]{64}$/i

function response(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { ...noStoreHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function readSingleParam(params: URLSearchParams, name: string, maxLength: number) {
  const values = params.getAll(name)
  if (values.length !== 1) return null
  const value = values[0].trim()
  return value.length > 0 && value.length <= maxLength ? value : null
}

function readSingleAliasParam(params: URLSearchParams, names: readonly string[], maxLength: number) {
  const values = names.flatMap((name) => params.getAll(name))
  if (values.length !== 1) return null
  const value = values[0].trim()
  return value.length > 0 && value.length <= maxLength ? value : null
}

function signatureMatches(signature: string, expected: Buffer) {
  if (!signaturePattern.test(signature)) return false

  const supplied = Buffer.from(signature, 'hex')
  return supplied.length === expected.length && timingSafeEqual(expected, supplied)
}

function signatureFingerprint(value: string | Buffer) {
  // Fingerprints aid comparison without recording replayable signatures.
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const secret = process.env.ADSLAB_POSTBACK_SECRET?.trim() ?? ''
  const rawUid = readSingleParam(params, 'uid', 128) ?? ''
  const uidIsUuid = uuidPattern.test(rawUid)
  const uid = uidIsUuid ? rawUid.toLowerCase() : rawUid
  const pidValues = params.getAll('pid')
  const pid = pidValues.length === 0 ? null : readSingleParam(params, 'pid', 128)
  const txid = readSingleAliasParam(params, ['txid', 'trans_id'], 128) ?? ''
  const type = readSingleParam(params, 'type', 24)?.toLowerCase() ?? ''
  const statusValues = params.getAll('status')
  const status = statusValues.length === 0 ? 'credit' : readSingleParam(params, 'status', 24)?.toLowerCase() ?? ''
  const isCreditStatus = ['credit', 'completed'].includes(status)
  const isReversalStatus = ['reversed', 'reverse', 'reversal', 'chargeback'].includes(status)
  const isRejectionStatus = ['rejected', 'reject'].includes(status)
  const reward = readSingleParam(params, 'reward', 64)
  const signature = readSingleParam(params, 'signature', 128) ?? ''

  console.info('[adslab-postback] Incoming PTC request.', {
    method: request.method,
    path: request.nextUrl.pathname,
    body: null,
    query: {
      keys: Array.from(new Set(params.keys())).slice(0, 30),
      uidFingerprint: uid ? signatureFingerprint(uid) : null,
      pidPresent: Boolean(pid),
      type,
      status,
      rewardPresent: Boolean(reward),
      txidFingerprint: txid ? signatureFingerprint(txid) : null,
      signatureLength: signature.length,
      receivedSignatureFingerprint: signaturePattern.test(signature) ? signatureFingerprint(signature.toLowerCase()) : null,
    },
  })

  if (!secret) {
    console.error('[adslab-postback] PTC callback rejected: ADSLAB_POSTBACK_SECRET is missing.')
    return response('postback unavailable', 503)
  }

  if (!uid || !txid || !status || (isCreditStatus && !reward) || !signature
    || params.getAll('uid').length !== 1
    || params.getAll('txid').length + params.getAll('trans_id').length !== 1
    || statusValues.length > 1
    || (statusValues.length === 1 && !status)
    || params.getAll('reward').length > 1
    || (params.getAll('reward').length === 1 && !reward)
    || (isCreditStatus && params.getAll('reward').length !== 1)
    || params.getAll('signature').length !== 1
    || pidValues.length > 1
    || (pidValues.length === 1 && !pid)
    || params.getAll('type').length > 1
    || (params.getAll('type').length === 1 && !type)) {
    console.warn('[adslab-ptc] Rejected postback with missing or repeated query parameters.', {
      uidPresent: Boolean(uid),
      txidPresent: Boolean(txid),
      statusPresent: Boolean(status),
      rewardPresent: Boolean(reward),
      signaturePresent: Boolean(signature),
    })
    return response('Missing or invalid parameters', 400)
  }

  const txidIsValid = transactionIdPattern.test(txid)
  const signatureIsValidFormat = signaturePattern.test(signature)
  const expectedSha256 = txidIsValid
    ? createHash('sha256').update(`${txid}-${secret}`).digest()
    : null
  const expectedHmacSha256 = txidIsValid
    ? createHmac('sha256', secret).update(txid).digest()
    : null
  const matchesCurrentSha256 = Boolean(expectedSha256 && signatureMatches(signature, expectedSha256))
  const matchesHmacSha256 = Boolean(expectedHmacSha256 && signatureMatches(signature, expectedHmacSha256))

  if (!txidIsValid || !signatureIsValidFormat || !(matchesCurrentSha256 || matchesHmacSha256)) {
    const reason = !txidIsValid
      ? 'invalid_txid'
      : !signatureIsValidFormat
        ? 'invalid_signature_format'
        : 'signature_mismatch'

    console.warn('[adslab-ptc] Rejected postback.', {
      reason,
      paramNames: Array.from(new Set(params.keys()))
        .filter((name) => /^[A-Za-z0-9_.-]{1,64}$/.test(name))
        .slice(0, 20),
      paramCounts: {
        uid: params.getAll('uid').length,
        pid: pidValues.length,
        txid: params.getAll('txid').length,
        trans_id: params.getAll('trans_id').length,
        type: params.getAll('type').length,
        status: params.getAll('status').length,
        reward: params.getAll('reward').length,
        signature: params.getAll('signature').length,
      },
      type,
      status,
      uidIsUuid,
      uidLength: uid.length,
      uidFingerprint: signatureFingerprint(uid),
      pidPresent: Boolean(pid),
      txidFingerprint: txidIsValid ? signatureFingerprint(txid) : null,
      signatureLength: signature.length,
      signatureIsValidFormat,
      receivedSignatureFingerprint: signatureFingerprint(signature.toLowerCase()),
      currentSha256Fingerprint: expectedSha256 ? signatureFingerprint(expectedSha256.toString('hex')) : null,
      hmacSha256Fingerprint: expectedHmacSha256 ? signatureFingerprint(expectedHmacSha256.toString('hex')) : null,
      matchesCurrentSha256,
      matchesHmacSha256,
      rewardPresent: Boolean(reward),
    })

    return response('Unauthorized', 401)
  }

  if (pid && pid !== ADSLAB_PTC_PLACEMENT_ID) {
    console.info('[adslab-ptc] Ignored verified postback for a different placement.', {
      txidFingerprint: signatureFingerprint(txid),
    })
    return response('OK')
  }

  if (type && !['ptc', 'task', 'tasks', 'shortlink', 'shortlinks'].includes(type)) {
    console.info('[adslab-ptc] Ignored verified postback with unsupported type.', {
      type,
      txidFingerprint: signatureFingerprint(txid),
    })
    return response('OK')
  }

  if (isCreditStatus && normalizeAdsLabUsd(reward) === null) {
    return response('Invalid reward', 400)
  }

  if (!isCreditStatus && !isReversalStatus && !isRejectionStatus) {
    console.info('[adslab-ptc] Ignored verified postback with unsupported status.', {
      status,
      txidFingerprint: signatureFingerprint(txid),
    })
    return response('OK')
  }

  const shortlinkTypeRequested = ['shortlink', 'shortlinks'].includes(type)
  const ptcTypeRequested = type === 'ptc'

  if (isReversalStatus) {
    try {
      const result = await db.transaction(async (transaction) => {
        let [click] = await transaction
          .select({ clickId: ptcClicks.clickId, userId: ptcClicks.userId, taskId: ptcClicks.taskId })
          .from(ptcClicks)
          .where(eq(ptcClicks.providerTransactionId, txid))
          .for('update')
          .limit(1)

        if (!click && uuidPattern.test(uid)) {
          ;[click] = await transaction
            .select({ clickId: ptcClicks.clickId, userId: ptcClicks.userId, taskId: ptcClicks.taskId })
            .from(ptcClicks)
            .where(and(
              eq(ptcClicks.clickId, uid.toLowerCase()),
              eq(ptcClicks.status, 'pending'),
            ))
            .for('update')
            .limit(1)

          if (click) {
            const isShortlink = click.taskId.startsWith(ADSLAB_SHORTLINK_TASK_PREFIX)
            if ((shortlinkTypeRequested && !isShortlink) || (ptcTypeRequested && isShortlink)) return 'category_mismatch' as const

            await transaction
              .update(ptcClicks)
              .set({ status: 'rejected', providerTransactionId: txid, updatedAt: new Date() })
              .where(and(eq(ptcClicks.clickId, click.clickId), eq(ptcClicks.status, 'pending')))
            return 'reversed_before_credit' as const
          }
        }

        if (!click) return 'ignored' as const
        if (uid !== click.clickId && uid !== click.userId) {
          const [profile] = await transaction
            .select({ userId: guestProfiles.userId })
            .from(guestProfiles)
            .where(eq(guestProfiles.id, click.userId))
            .limit(1)
          if (!profile || profile.userId !== uid) return 'user_mismatch' as const
        }

        const isShortlink = click.taskId.startsWith(ADSLAB_SHORTLINK_TASK_PREFIX)
        if ((shortlinkTypeRequested && !isShortlink) || (ptcTypeRequested && isShortlink)) return 'category_mismatch' as const

        const earningSource = isShortlink ? 'adslab_shortlink' : 'adslab_ptc'
        const reversalSource = isShortlink ? 'adslab_shortlink_reversal' : 'adslab_ptc_reversal'
        const [credited] = await transaction
          .select({ rewardAtomic: earningEvents.rewardAtomic, tokenSymbol: earningEvents.tokenSymbol })
          .from(earningEvents)
          .where(and(
            eq(earningEvents.guestId, click.userId),
            eq(earningEvents.source, earningSource),
            eq(earningEvents.sourceKey, click.clickId),
          ))
          .for('update')
          .limit(1)
        if (!credited) return 'ignored' as const

        const [debit] = await transaction
          .insert(earningEvents)
          .values({
            id: randomUUID(),
            guestId: click.userId,
            source: reversalSource,
            sourceKey: txid,
            itemId: click.taskId,
            tokenSymbol: credited.tokenSymbol,
            rewardAtomic: -Math.abs(credited.rewardAtomic),
            createdAt: new Date(),
          })
          .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
          .returning({ id: earningEvents.id })

        return debit ? 'reversed' as const : 'duplicate' as const
      })

      if (result === 'user_mismatch') return response('Transaction user mismatch', 409)
      if (result === 'category_mismatch') return response('Transaction type mismatch', 409)

      console.info('[adslab-ptc] Processed verified reversal.', {
        outcome: result,
        uidFingerprint: signatureFingerprint(uid),
        txidFingerprint: signatureFingerprint(txid),
      })
      return response(result === 'duplicate' ? 'DUP' : 'OK')
    } catch {
      console.error('[adslab-ptc] Could not process verified reversal.', {
        txidFingerprint: signatureFingerprint(txid),
      })
      return response('postback error', 500)
    }
  }

  if (isRejectionStatus) {
    try {
      const result = await db.transaction(async (transaction) => {
        const [directPendingClick] = await transaction
          .select({ clickId: ptcClicks.clickId, userId: ptcClicks.userId, taskId: ptcClicks.taskId, status: ptcClicks.status, rewardUsd: ptcClicks.rewardUsd })
          .from(ptcClicks)
          .where(eq(ptcClicks.clickId, uid))
          .for('update')
          .limit(1)
        let pendingClick: typeof directPendingClick | null = directPendingClick ?? null

        if (pendingClick) {
          if (pendingClick.status !== 'pending') return 'ignored' as const
          const isShortlink = pendingClick.taskId.startsWith(ADSLAB_SHORTLINK_TASK_PREFIX)
          if ((shortlinkTypeRequested && !isShortlink) || (ptcTypeRequested && isShortlink)) return 'category_mismatch' as const
        } else {
          let userId: string | null = null
          if (uidIsUuid) {
            const [profileById] = await transaction
              .select({ id: guestProfiles.id })
              .from(guestProfiles)
              .where(eq(guestProfiles.id, uid))
              .limit(1)
            userId = profileById?.id ?? null
          }
          if (!userId) {
            const [profileByAuthId] = await transaction
              .select({ id: guestProfiles.id })
              .from(guestProfiles)
              .where(eq(guestProfiles.userId, uid))
              .limit(1)
            userId = profileByAuthId?.id ?? null
          }
          if (!userId) return 'ignored' as const

          const taskPrefix = shortlinkTypeRequested || !ptcTypeRequested
            ? ADSLAB_SHORTLINK_TASK_PREFIX
            : ADSLAB_PTC_TASK_PREFIX
          const pendingClicks = await transaction
            .select({ clickId: ptcClicks.clickId, userId: ptcClicks.userId, taskId: ptcClicks.taskId, status: ptcClicks.status, rewardUsd: ptcClicks.rewardUsd })
            .from(ptcClicks)
            .where(and(
              eq(ptcClicks.userId, userId),
              eq(ptcClicks.status, 'pending'),
              like(ptcClicks.taskId, `${taskPrefix}%`),
            ))
            .orderBy(asc(ptcClicks.createdAt))
            .for('update')
          pendingClick = reward
            ? pendingClicks.find((candidate) => adsLabPtcRewardMatches(reward, candidate.rewardUsd)) ?? null
            : pendingClicks.length === 1 ? pendingClicks[0] : null
          if (!pendingClick) return 'ignored' as const
        }

        await transaction
          .update(ptcClicks)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(and(eq(ptcClicks.clickId, pendingClick.clickId), eq(ptcClicks.status, 'pending')))
        return 'rejected' as const
      })

      if (result === 'category_mismatch') return response('Transaction type mismatch', 409)
      console.info('[adslab-ptc] Processed verified rejection.', {
        outcome: result,
        uidFingerprint: signatureFingerprint(uid),
        txidFingerprint: signatureFingerprint(txid),
      })
      return response('OK')
    } catch {
      console.error('[adslab-ptc] Could not process verified rejection.', {
        txidFingerprint: signatureFingerprint(txid),
      })
      return response('postback error', 500)
    }
  }

  if (!isCreditStatus) {
    console.info('[adslab-ptc] Ignored verified non-credit postback.', {
      status,
      txidFingerprint: signatureFingerprint(txid),
    })
    return response('OK')
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const [clickIdentity] = await transaction
        .select({ userId: ptcClicks.userId, taskId: ptcClicks.taskId })
        .from(ptcClicks)
        .where(and(
          eq(ptcClicks.clickId, uid),
          or(
            like(ptcClicks.taskId, `${ADSLAB_PTC_TASK_PREFIX}%`),
            like(ptcClicks.taskId, `${ADSLAB_SHORTLINK_TASK_PREFIX}%`),
          ),
        ))
        .limit(1)

      const directClickId = clickIdentity ? uid : null
      let userId = clickIdentity?.userId ?? null

      if (!userId && uidIsUuid) {
        const [profileById] = await transaction
          .select({ id: guestProfiles.id })
          .from(guestProfiles)
          .where(eq(guestProfiles.id, uid))
          .limit(1)
        userId = profileById?.id ?? null
      }

      if (!userId) {
        const [profileByAuthId] = await transaction
          .select({ id: guestProfiles.id })
          .from(guestProfiles)
          .where(eq(guestProfiles.userId, uid))
          .limit(1)
        userId = profileByAuthId?.id ?? null
      }

      const pendingClickLookupId = userId ?? uid
      const [pendingClickOwner] = ptcTypeRequested && uuidPattern.test(pendingClickLookupId)
        ? await transaction
          .select({ userId: ptcClicks.userId })
          .from(ptcClicks)
          .where(and(
            eq(ptcClicks.userId, pendingClickLookupId),
            eq(ptcClicks.status, 'pending'),
            like(ptcClicks.taskId, `${ADSLAB_PTC_TASK_PREFIX}%`),
          ))
          .orderBy(asc(ptcClicks.createdAt))
          .for('update')
          .limit(1)
        : []
      const hasTrustedClickIdentity = Boolean(clickIdentity || pendingClickOwner)
      userId = userId ?? pendingClickOwner?.userId ?? null
      if (!userId) return 'unknown_user_identity' as const

      const [profile] = await transaction
        .select({ id: guestProfiles.id })
        .from(guestProfiles)
        .where(eq(guestProfiles.id, userId))
        .for('update')
        .limit(1)
      if (!profile && !hasTrustedClickIdentity) return 'unknown_user_profile' as const

      const [existingTransaction] = await transaction
        .select({ userId: ptcClicks.userId })
        .from(ptcClicks)
        .where(eq(ptcClicks.providerTransactionId, txid))
        .for('update')
        .limit(1)

      if (existingTransaction) {
        if (existingTransaction.userId !== userId) return 'user_mismatch' as const
        return 'duplicate' as const
      }

      const rewardUsd = normalizeAdsLabUsd(reward)
      const rewardAtomic = parseAdsLabRewardAtomic(reward)
      const grossRewardAtomic = parseAdsLabGrossRewardAtomic(reward)
      if (!rewardUsd || rewardAtomic === null || grossRewardAtomic === null) return 'invalid_reward' as const

      const acceptableLegacyPayouts = new Set([
        formatHomeroPayoutAtomic(rewardAtomic),
        formatHomeroPayoutAtomic(grossRewardAtomic),
      ])
      const clickIdentityIsShortlink = clickIdentity?.taskId.startsWith(ADSLAB_SHORTLINK_TASK_PREFIX) ?? false
      if ((shortlinkTypeRequested && clickIdentity && !clickIdentityIsShortlink)
        || (ptcTypeRequested && clickIdentityIsShortlink)) return 'category_mismatch' as const

      const taskPrefix = clickIdentity
        ? (clickIdentityIsShortlink ? ADSLAB_SHORTLINK_TASK_PREFIX : ADSLAB_PTC_TASK_PREFIX)
        : (shortlinkTypeRequested || !ptcTypeRequested ? ADSLAB_SHORTLINK_TASK_PREFIX : ADSLAB_PTC_TASK_PREFIX)
      const pendingClicks = await transaction
        .select({
          clickId: ptcClicks.clickId,
          taskId: ptcClicks.taskId,
          payout: ptcClicks.payout,
          payoutTokenSymbol: ptcClicks.payoutTokenSymbol,
          rewardUsd: ptcClicks.rewardUsd,
        })
        .from(ptcClicks)
        .where(and(
          eq(ptcClicks.userId, userId),
          eq(ptcClicks.status, 'pending'),
          like(ptcClicks.taskId, `${taskPrefix}%`),
        ))
        .orderBy(asc(ptcClicks.createdAt))
        .for('update')

      const pendingClick = pendingClicks.find((candidate) => {
        if (directClickId && candidate.clickId !== directClickId) return false
        return candidate.payoutTokenSymbol === 'PEPE'
          ? adsLabPtcRewardMatches(reward, candidate.rewardUsd)
          : acceptableLegacyPayouts.has(candidate.payout ?? '')
      })
      if (!pendingClick) return pendingClicks.length ? 'reward_mismatch' as const : 'ignored' as const

      const creditRewardAtomic = pendingClick.payoutTokenSymbol === 'PEPE'
        ? parseHomeroPayoutAtomic(pendingClick.payout)
        : rewardAtomic
      if (creditRewardAtomic === null) return 'invalid_payout' as const

      const now = new Date()
      const completedPayout = pendingClick.payoutTokenSymbol === 'PEPE'
        ? pendingClick.payout
        : formatHomeroPayoutAtomic(rewardAtomic)
      const [completedClick] = await transaction
        .update(ptcClicks)
        .set({ status: 'completed', payout: completedPayout, providerTransactionId: txid, updatedAt: now })
        .where(and(
          eq(ptcClicks.clickId, pendingClick.clickId),
          eq(ptcClicks.userId, userId),
          eq(ptcClicks.status, 'pending'),
        ))
        .returning({ clickId: ptcClicks.clickId })
      if (!completedClick) return 'ignored' as const

      const earningSource = pendingClick.taskId.startsWith(ADSLAB_SHORTLINK_TASK_PREFIX)
        ? 'adslab_shortlink'
        : 'adslab_ptc'
      const [existingCredit] = await transaction
        .select({ rewardAtomic: earningEvents.rewardAtomic })
        .from(earningEvents)
        .where(and(
          eq(earningEvents.guestId, userId),
          eq(earningEvents.source, earningSource),
          eq(earningEvents.sourceKey, pendingClick.clickId),
        ))
        .limit(1)
      if (existingCredit) return 'duplicate' as const

      const [credit] = await transaction
        .insert(earningEvents)
        .values({
          id: randomUUID(),
          guestId: userId,
          source: earningSource,
          sourceKey: pendingClick.clickId,
          itemId: pendingClick.taskId,
          tokenSymbol: pendingClick.payoutTokenSymbol,
          rewardAtomic: creditRewardAtomic,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [earningEvents.guestId, earningEvents.source, earningEvents.sourceKey] })
        .returning({ id: earningEvents.id })
      if (!credit) return 'duplicate' as const

      if (earningSource === 'adslab_ptc') await grantPtcArcadeEnergy(transaction, userId, now)
      else await grantShortlinkArcadeEnergy(transaction, userId, now)
      return 'credited' as const
    })

    if (result !== 'credited' && result !== 'duplicate') {
      console.error('[adslab-ptc] Verified postback was not applied; returning a retryable response.', {
        outcome: result,
        uidFingerprint: signatureFingerprint(uid),
        txidFingerprint: signatureFingerprint(txid),
      })
      return response('Postback not applied; retry required', 503)
    }

    console.info('[adslab-ptc] Processed verified postback.', {
      outcome: result,
      uidFingerprint: signatureFingerprint(uid),
      txidFingerprint: signatureFingerprint(txid),
      rewardPresent: Boolean(reward),
    })

    return response('OK')
  } catch {
    try {
      const [alreadyProcessed] = await db
        .select({ clickId: ptcClicks.clickId })
        .from(ptcClicks)
        .where(eq(ptcClicks.providerTransactionId, txid))
        .limit(1)
      if (alreadyProcessed) {
        console.info('[adslab-ptc] Acknowledged duplicate transaction after retry.', {
          txidFingerprint: signatureFingerprint(txid),
        })
        return response('OK')
      }
    } catch {
      console.error('[adslab-ptc] Could not verify transaction after callback failure.', {
        txidFingerprint: signatureFingerprint(txid),
      })
    }

    console.error('[adslab-ptc] Could not process verified postback.', {
      txidFingerprint: signatureFingerprint(txid),
    })
    return response('postback error', 500)
  }
}
