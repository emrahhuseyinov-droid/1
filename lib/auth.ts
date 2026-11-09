import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { emailOTP } from 'better-auth/plugins'
import { sendAuthCodeEmail } from '@/lib/send-auth-code'
import { sql } from 'drizzle-orm'
import { db, pool } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { unverifiedEmailRecoveryPlugin } from '@/lib/unverified-email-recovery'

const v0PreviewIframeOrigin =
  'https://vm-website-development-2-l6kx59jv.vusercontent.net'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL ??
          (process.env.NODE_ENV === 'development'
            ? v0PreviewIframeOrigin
            : 'https://pepe.casa')),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 60, max: 5 },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      sendVerificationOTP: sendAuthCodeEmail,
    }),
    unverifiedEmailRecoveryPlugin,
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (createdUser) => {
          const nickname = createdUser.name.trim()
          if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(nickname)) {
            throw new APIError('BAD_REQUEST', {
              message: 'Use 3–24 letters, numbers, underscores, or hyphens for your nickname.',
            })
          }

          const [existingUser] = await db
            .select({ id: user.id })
            .from(user)
            .where(sql`lower(${user.name}) = ${nickname.toLowerCase()}`)
            .limit(1)

          if (existingUser) {
            throw new APIError('BAD_REQUEST', { message: 'That nickname is already in use.' })
          }

          return { data: { ...createdUser, name: nickname } }
        },
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          // The iframe Origin differs from V0_RUNTIME_URL; keep this exact host dev-only.
          v0PreviewIframeOrigin,
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          'https://pepe.casa',
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      validateSchema: false,
    },
    ipAddress: {
      ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip'],
    },
    ...(process.env.NODE_ENV === 'development'
      ? {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        }
      : {}),
  },
})
