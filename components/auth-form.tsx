'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'
import { authClient } from '@/lib/auth-client'

type AuthFormProps = {
  mode: 'sign-in' | 'sign-up'
  destination: string
}

export function AuthForm({ mode, destination }: AuthFormProps) {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignUp = mode === 'sign-up'
  const otherModeHref = `${isSignUp ? '/sign-in' : '/sign-up'}?next=${encodeURIComponent(destination)}`
  const forgotPasswordHref = `/forgot-password?next=${encodeURIComponent(destination)}`
  const verificationHref = `/verify-email?${email.trim() ? `email=${encodeURIComponent(email.trim().toLowerCase())}&` : ''}next=${encodeURIComponent(destination)}`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const normalizedNickname = nickname.trim()
      if (isSignUp) {
        if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(normalizedNickname)) {
          setErrorMessage('Use 3–24 letters, numbers, underscores, or hyphens.')
          return
        }

        const availabilityResponse = await fetch(
          `/api/account?nickname=${encodeURIComponent(normalizedNickname)}`,
          { cache: 'no-store' },
        )
        const availability = await availabilityResponse.json().catch(() => null) as { available?: boolean } | null
        if (!availabilityResponse.ok || !availability) {
          setErrorMessage('Could not verify your nickname. Try again.')
          return
        }
        if (!availability.available) {
          setErrorMessage('That nickname is already in use. Choose another.')
          return
        }
      }

      const normalizedEmail = email.trim().toLowerCase()
      const result = isSignUp
        ? await authClient.signUp.email({
            name: normalizedNickname,
            email: normalizedEmail,
            password,
          })
        : await authClient.signIn.email({
            email: normalizedEmail,
            password,
          })

      if (result.error) {
        setErrorMessage(isSignUp
          ? 'Could not create the account. Check your details and try again.'
          : 'Could not sign in. Check your email and password.')
        return
      }

      try {
        await fetch('/api/account/bootstrap', { method: 'POST' })
      } catch {
        // The protected page retries profile linking if this request is interrupted.
      }

      router.replace(destination)
      router.refresh()
    } catch {
      setErrorMessage(isSignUp
        ? 'Could not create the account. Please try again.'
        : 'Could not sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <LocalizedTree>
    <main className="cartoon-auth-shell relative flex min-h-dvh items-center justify-center bg-[#111431] px-4 py-10 text-slate-100">
      <div className="fixed right-4 top-4 z-50"><LanguageSwitcher compact /></div>
      <div className="w-full max-w-md">
        <Link href="/" aria-label="pepe.casa home" className="mx-auto mb-8 flex w-fit items-center">
          <PepeCasaLogo size={40} textClassName="text-xl text-white" />
        </Link>

        <section className="cartoon-auth-card rounded-[32px] border-2 border-violet-200/20 bg-[#1a2044] p-6 shadow-2xl shadow-indigo-950/40 sm:p-8">
          <div className="mb-7">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Account access</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {isSignUp ? 'Sign up with email and password to keep your profile and existing ledger together.' : 'Sign in to continue to your account and saved reward ledger.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="auth-nickname" className="mb-1.5 block text-xs font-bold text-slate-300">Nickname</label>
                <input
                  id="auth-nickname"
                  name="nickname"
                  type="text"
                  autoComplete="nickname"
                  required
                  minLength={3}
                  maxLength={24}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="cartoon-auth-input w-full rounded-2xl border-2 border-violet-200/15 bg-[#111735] px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                  placeholder="Choose a unique nickname"
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-xs font-bold text-slate-300">Email</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="cartoon-auth-input w-full rounded-2xl border-2 border-violet-200/15 bg-[#111735] px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-bold text-slate-300">Password</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="cartoon-auth-input w-full rounded-2xl border-2 border-violet-200/15 bg-[#111735] px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
              />
              {!isSignUp && (
                <Link href={forgotPasswordHref} className="mt-2 inline-flex text-xs font-bold text-blue-300 transition hover:text-blue-200">
                  Forgot password?
                </Link>
              )}
            </div>

            {errorMessage && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-300">
                <CircleAlert size={15} className="mt-0.5 shrink-0" />{errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="cartoon-auth-submit flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/35 bg-gradient-to-r from-[#ffd166] to-[#ffad80] py-3 text-sm font-black text-[#282047] shadow-lg shadow-amber-950/20 transition hover:-translate-y-0.5 hover:saturate-125 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? <><LoaderCircle size={16} className="animate-spin" />Working…</> : <>{isSignUp ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            {isSignUp ? 'Already have an account?' : 'New to pepe.casa?'}{' '}
            <Link href={otherModeHref} className="font-extrabold text-cyan-200 transition hover:text-cyan-100">
              {isSignUp ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          {!isSignUp && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Need a verification code?{' '}
              <Link href={verificationHref} className="font-extrabold text-cyan-200 transition hover:text-cyan-100">Verify email</Link>
            </p>
          )}
        </section>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] leading-5 text-slate-500">
          <ShieldCheck size={13} className="shrink-0 text-blue-400" />Your account uses a secure server-managed session. Existing guest balances are preserved when linked.
        </p>
      </div>
    </main>
    </LocalizedTree>
  )
}
