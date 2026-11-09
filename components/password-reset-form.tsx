'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'
import { authClient } from '@/lib/auth-client'

type PasswordResetFormProps = {
  destination: string
}

export function PasswordResetForm({ destination }: PasswordResetFormProps) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [isComplete, setIsComplete] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const signInHref = `/sign-in?next=${encodeURIComponent(destination)}`

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const result = await authClient.emailOtp.requestPasswordReset({ email: email.trim().toLowerCase() })
      if (result.error) {
        setErrorMessage('Could not request a reset code. Please try again later.')
        return
      }

      setStep('reset')
      setStatusMessage('If an account matches this address, a reset code has been sent.')
    } catch {
      setErrorMessage('Could not request a reset code. Please try again later.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleResendCode() {
    if (isBusy) return
    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const result = await authClient.emailOtp.requestPasswordReset({ email: email.trim().toLowerCase() })
      if (result.error) {
        setErrorMessage('Could not send a new code. Please try again later.')
        return
      }

      setStatusMessage('If an account matches this address, a new reset code has been sent.')
    } catch {
      setErrorMessage('Could not send a new code. Please try again later.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return
    if (password !== passwordConfirmation) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const result = await authClient.emailOtp.resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        password,
      })

      if (result.error) {
        setErrorMessage('That code may be invalid or expired. Check it and try again.')
        return
      }

      setIsComplete(true)
    } catch {
      setErrorMessage('Could not reset your password. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <LocalizedTree>
      <main className="relative flex min-h-dvh items-center justify-center bg-[#090e19] px-4 py-10 text-slate-100">
        <div className="fixed right-4 top-4 z-50"><LanguageSwitcher compact /></div>
        <div className="w-full max-w-md">
          <Link href="/" aria-label="pepe.casa home" className="mx-auto mb-8 flex w-fit items-center">
            <PepeCasaLogo size={40} textClassName="text-xl text-white" />
          </Link>

          <section className="rounded-[28px] border border-slate-800 bg-[#111a2b] p-6 shadow-2xl shadow-black/25 sm:p-8">
            <div className="mb-7">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-400">Account recovery</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Reset your password</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">We&apos;ll email you a one-time code so you can choose a new password.</p>
            </div>

            {isComplete ? (
              <div className="space-y-5">
                <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm leading-6 text-emerald-200">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0" />Your password has been updated. You can now sign in with it.
                </p>
                <Link href={signInHref} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500">
                  Continue to sign in <ArrowRight size={16} />
                </Link>
              </div>
            ) : step === 'request' ? (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="mb-1.5 block text-xs font-bold text-slate-300">Email</label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="you@example.com"
                  />
                </div>

                {errorMessage && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-300">
                    <CircleAlert size={15} className="mt-0.5 shrink-0" />{errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {isBusy ? <><LoaderCircle size={16} className="animate-spin" />Sending…</> : <>Send reset code <ArrowRight size={16} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-code" className="mb-1.5 block text-xs font-bold text-slate-300">Six-digit code</label>
                  <input
                    id="reset-code"
                    name="one-time-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                    minLength={6}
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-center text-lg font-bold tracking-[0.35em] outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="000000"
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-xs font-bold text-slate-300">New password</label>
                  <input
                    id="new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-bold text-slate-300">Confirm new password</label>
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Enter the password again"
                  />
                </div>

                {errorMessage && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-300">
                    <CircleAlert size={15} className="mt-0.5 shrink-0" />{errorMessage}
                  </p>
                )}
                {statusMessage && <p role="status" className="text-xs leading-5 text-emerald-300">{statusMessage}</p>}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {isBusy ? <><LoaderCircle size={16} className="animate-spin" />Updating…</> : <>Update password <ArrowRight size={16} /></>}
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <button type="button" onClick={handleResendCode} disabled={isBusy} className="font-bold text-blue-300 hover:text-blue-200 disabled:opacity-60">Resend code</button>
                  <button type="button" onClick={() => { setStep('request'); setErrorMessage(''); setStatusMessage('') }} className="text-slate-400 hover:text-white">Use another email</button>
                </div>
              </form>
            )}
          </section>

          {!isComplete && <p className="mt-5 text-center text-xs text-slate-400">Remember your password? <Link href={signInHref} className="font-bold text-blue-300 hover:text-blue-200">Sign in</Link></p>}
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] leading-5 text-slate-500">
            <ShieldCheck size={13} className="shrink-0 text-blue-400" />Reset codes expire after 10 minutes and can only be used once.
          </p>
        </div>
      </main>
    </LocalizedTree>
  )
}
