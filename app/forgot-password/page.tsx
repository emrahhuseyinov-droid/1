import { PasswordResetForm } from '@/components/password-reset-form'
import { sanitizeNextPath } from '@/lib/auth-navigation'

type SearchParams = {
  next?: string | string[]
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next

  return <PasswordResetForm destination={sanitizeNextPath(rawNext)} />
}
