import 'server-only'

import { APIError, createAuthEndpoint } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'
import { verifyPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { account, session, user } from '@/lib/db/schema'

const emailRecoveryPath = '/email-otp/change-unverified-email'
const recoveryFailureMessage = 'Unable to update this email. Check the current address and password, then try again.'

function recoveryFailure() {
  return new APIError('BAD_REQUEST', { message: recoveryFailureMessage })
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

export const unverifiedEmailRecoveryPlugin = {
  id: 'unverified-email-recovery',
  endpoints: {
    changeUnverifiedEmail: createAuthEndpoint(
      emailRecoveryPath,
      {
        method: 'POST',
        body: z.object({
          currentEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
          newEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
          password: z.string().min(1).max(128),
        }),
      },
      async (ctx) => {
        const { currentEmail, newEmail, password } = ctx.body
        if (currentEmail === newEmail) throw recoveryFailure()

        const [candidate] = await db
          .select({ id: user.id, emailVerified: user.emailVerified, passwordHash: account.password })
          .from(user)
          .innerJoin(account, eq(account.userId, user.id))
          .where(and(
            sql`lower(${user.email}) = ${currentEmail}`,
            eq(account.providerId, 'credential'),
          ))
          .limit(1)

        if (!candidate || candidate.emailVerified || !candidate.passwordHash) throw recoveryFailure()

        const passwordIsValid = await verifyPassword({ hash: candidate.passwordHash, password })
        if (!passwordIsValid) throw recoveryFailure()

        try {
          const updated = await db.transaction(async (tx) => {
            const [changedUser] = await tx
              .update(user)
              .set({ email: newEmail, emailVerified: false, updatedAt: new Date() })
              .where(and(
                eq(user.id, candidate.id),
                eq(user.emailVerified, false),
                sql`lower(${user.email}) = ${currentEmail}`,
              ))
              .returning({ id: user.id })

            if (!changedUser) return false

            await tx.delete(session).where(eq(session.userId, candidate.id))
            return true
          })

          if (!updated) throw recoveryFailure()
        } catch (error) {
          if (isUniqueViolation(error)) throw recoveryFailure()
          throw error
        }

        return ctx.json({ success: true })
      },
    ),
  },
  rateLimit: [
    {
      pathMatcher: (path) => path === emailRecoveryPath,
      window: 15 * 60,
      max: 5,
    },
  ],
} satisfies BetterAuthPlugin
