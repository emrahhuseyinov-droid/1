import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountForRequest, guestCookieName } from '@/lib/account-profile'
import { db } from '@/lib/db'
import { advertiserDeposits } from '@/lib/db/schema'

export const runtime = 'nodejs'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noStoreHeaders = { 'Cache-Control': 'no-store' }

function redirectToDeposit(request: NextRequest, payment?: 'cancelled' | 'returned', depositId?: string) {
  const destination = new URL('/advertiser/deposit', request.url)
  if (payment) destination.searchParams.set('payment', payment)
  if (depositId) destination.searchParams.set('deposit', depositId)
  return NextResponse.redirect(destination, { status: 303, headers: noStoreHeaders })
}

export async function GET(request: NextRequest) {
  const depositId = request.nextUrl.searchParams.get('deposit')?.toLowerCase() ?? ''
  const signature = request.nextUrl.searchParams.get('signature') ?? ''
  if (!uuidPattern.test(depositId) || !/^[0-9a-f]{64}$/i.test(signature)) return redirectToDeposit(request)

  const account = await getAccountForRequest(request.headers, request.cookies.get(guestCookieName)?.value)
  if (!account) return redirectToDeposit(request)

  try {
    const [existingDeposit] = await db.select({ id: advertiserDeposits.id, requestKey: advertiserDeposits.requestKey, status: advertiserDeposits.status })
      .from(advertiserDeposits)
      .where(and(
        eq(advertiserDeposits.id, depositId),
        eq(advertiserDeposits.userId, account.session.user.id),
        eq(advertiserDeposits.guestId, account.profile.id),
        eq(advertiserDeposits.provider, 'faucetpay'),
      ))
      .limit(1)
    if (!existingDeposit) return redirectToDeposit(request)

    const expectedSignature = createHmac('sha256', existingDeposit.requestKey).update(existingDeposit.id).digest()
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), expectedSignature)) return redirectToDeposit(request)

    const [cancelledDeposit] = await db.update(advertiserDeposits)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(advertiserDeposits.id, depositId),
        eq(advertiserDeposits.userId, account.session.user.id),
        eq(advertiserDeposits.guestId, account.profile.id),
        eq(advertiserDeposits.provider, 'faucetpay'),
        eq(advertiserDeposits.status, 'pending'),
      ))
      .returning({ id: advertiserDeposits.id })

    if (cancelledDeposit) return redirectToDeposit(request, 'cancelled', cancelledDeposit.id)
    if (existingDeposit.status === 'cancelled') return redirectToDeposit(request, 'cancelled', existingDeposit.id)
    return redirectToDeposit(request, 'returned', existingDeposit.id)
  } catch (error) {
    console.error('[faucetpay-cancel] Could not cancel the payment:', error)
    return NextResponse.json({ error: 'Could not update the payment status.' }, { status: 500, headers: noStoreHeaders })
  }
}
