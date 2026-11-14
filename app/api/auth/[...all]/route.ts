import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { and, eq, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { signupIpClaims } from '@/lib/db/schema'

export const runtime = 'nodejs'

const authHandlers = toNextJsHandler(auth)
const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

function normalizeIpAddress(value: string): string | null {
  let address = value.trim().replace(/^\[|\]$/g, '')
  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1]
  const ipv4Address = mappedIpv4 ?? address

  if (isIP(ipv4Address) === 4) {
    return ipv4Address.split('.').map((part) => String(Number(part))).join('.')
  }

  const embeddedIpv4 = address.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (embeddedIpv4) {
    const octets = embeddedIpv4.split('.').map(Number)
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
    const ipv4Tail = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
    address = address.slice(0, -embeddedIpv4.length) + ipv4Tail
  }

  if (isIP(address) !== 6) return null

  const [left = '', right = '', ...extra] = address.toLowerCase().split('::')
  if (extra.length > 0) return null
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const missingParts = 8 - leftParts.length - rightParts.length
  if ((address.includes('::') && missingParts < 1) || (!address.includes('::') && missingParts !== 0)) return null

  const parts = [...leftParts, ...Array(Math.max(0, missingParts)).fill('0'), ...rightParts]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  const values = parts.map((part) => Number.parseInt(part, 16))
  if (values.slice(0, 5).every((part) => part === 0) && values[5] === 0xffff) {
    return `${values[6] >> 8}.${values[6] & 255}.${values[7] >> 8}.${values[7] & 255}`
  }
  return values.map((part) => part.toString(16).padStart(4, '0')).join(':')
}

function getClientIp(request: NextRequest): string | null {
  const trustedHeader = request.headers.get('x-vercel-forwarded-for')
  const forwardedHeader = process.env.NODE_ENV === 'production'
    ? request.headers.get('x-forwarded-for')
    : request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')
  const forwardedAddress = (trustedHeader ?? forwardedHeader)?.split(',')[0]

  if (forwardedAddress) return normalizeIpAddress(forwardedAddress)
  return process.env.NODE_ENV === 'production' ? null : '127.0.0.1'
}

function hashSignupValue(label: 'ip' | 'email', value: string, secret: string) {
  return createHmac('sha256', secret).update(`${label}:${value}`).digest('hex')
}

export const GET = authHandlers.GET

export async function POST(request: NextRequest) {
  if (!new URL(request.url).pathname.endsWith('/sign-up/email')) {
    return authHandlers.POST(request)
  }

  const body: unknown = await request.clone().json().catch(() => null)
  const email = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).email
    : null
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const clientIp = getClientIp(request)
  const secret = process.env.BETTER_AUTH_SECRET

  if (!clientIp) {
    return NextResponse.json({ code: 'IP_ADDRESS_UNAVAILABLE', message: 'Could not verify your network address. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
  if (!normalizedEmail || normalizedEmail.length > 254 || !secret) {
    if (!secret) console.error('[auth] Signup IP enforcement is missing its HMAC secret.')
    return NextResponse.json({ code: 'INVALID_SIGNUP_REQUEST', message: 'Could not create the account. Check your details and try again.' }, { status: secret ? 400 : 503, headers: noStoreHeaders })
  }

  const ipHash = hashSignupValue('ip', clientIp, secret)
  const emailHash = hashSignupValue('email', normalizedEmail, secret)

  try {
    const [claim] = await db.insert(signupIpClaims).values({ ipHash, emailHash, status: 'pending' })
      .onConflictDoUpdate({
        target: signupIpClaims.ipHash,
        set: {
          emailHash,
          status: sql`case when ${signupIpClaims.status} = 'claimed' then 'claimed' else 'pending' end`,
          updatedAt: new Date(),
        },
        setWhere: or(
          eq(signupIpClaims.emailHash, emailHash),
          and(
            eq(signupIpClaims.status, 'pending'),
            sql`${signupIpClaims.updatedAt} < now() - interval '15 minutes'`,
          ),
        ),
      })
      .returning({ ipHash: signupIpClaims.ipHash })

    if (!claim) {
      return NextResponse.json({ code: 'SIGNUP_IP_LIMIT', message: 'Only one account per network IP is allowed.' }, { status: 429, headers: noStoreHeaders })
    }

    const response = await authHandlers.POST(request)
    if (response.ok) {
      await db.update(signupIpClaims)
        .set({ status: 'claimed', updatedAt: new Date() })
        .where(and(eq(signupIpClaims.ipHash, ipHash), eq(signupIpClaims.emailHash, emailHash)))
    }
    return response
  } catch (error) {
    console.error('[auth] Could not enforce signup IP limit:', error)
    return NextResponse.json({ code: 'SIGNUP_IP_CHECK_FAILED', message: 'Could not verify your registration. Please try again.' }, { status: 503, headers: noStoreHeaders })
  }
}
