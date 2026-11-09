export function sanitizeNextPath(value: unknown, fallback = '/dashboard') {
  if (
    typeof value !== 'string'
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || value.startsWith('/api/account/bootstrap')
    || value === '/sign-in'
    || value === '/sign-up'
  ) {
    return fallback
  }

  return value
}
