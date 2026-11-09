import { EmailVerificationForm } from '@/components/email-verification-form'
import { sanitizeNextPath } from '@/lib/auth-navigation'

type SearchParams = {
  email?: string | string[]
  next?: string | string[]
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const rawEmail = Array.isArray(params.email) ? params.email[0] : params.email
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next

  return (
    <EmailVerificationForm
      initialEmail={rawEmail ?? ''}
      destination={sanitizeNextPath(rawNext)}
    />
  )
}
