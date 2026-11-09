import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { auth } from '@/lib/auth'
import { sanitizeNextPath } from '@/lib/auth-navigation'

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next
  const destination = sanitizeNextPath(rawNext)
  const session = await auth.api.getSession({ headers: await headers() })

  if (session?.user) redirect(destination)

  return <AuthForm mode="sign-up" destination={destination} />
}
