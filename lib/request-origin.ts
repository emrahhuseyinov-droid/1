import type { NextRequest } from 'next/server'

function toOrigin(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getConfiguredOrigins() {
  const values = [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          process.env.V0_RUNTIME_URL,
          process.env.V0_DEV_APP_URL,
          process.env.V0_BUILD_URL,
          process.env.V0_SANDBOX_URL,
        ]
      : []),
  ]

  return new Set(values.map(toOrigin).filter((origin): origin is string => Boolean(origin)))
}

export function isTrustedRequestOrigin(request: NextRequest) {
  const origin = toOrigin(request.headers.get('origin'))
  if (!origin) return false

  if (getConfiguredOrigins().has(origin)) return true
  return origin === new URL(request.url).origin
}
