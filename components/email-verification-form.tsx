'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react'
import { PepeCasaLogo } from '@/components/pepe-casa-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LocalizedTree } from '@/components/site-language-provider'
import { authClient } from '@/lib/auth-client'

type EmailVerificationFormProps = {
  initialEmail: string
  destination: string
}

export function EmailVerificationForm({ initialEmail, destination }: EmailVerificationFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const signInHref = `/sign-in?next=${encodeURIComponent(destination)}`
  const signUpHref = `/sign-up?next=${encodeURIComponent(destination)}`

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      })

      if (result.error) {
        setErrorMessage('That code is invalid or expired. Request a new one and try again.')
        return
      }

      setIsVerified(true)
    } catch {
      setErrorMessage('Could not verify your email. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleResend() {
    if (isBusy) return
    if (!email.trim()) {
      setErrorMessage('Enter your email address first.')
      return
    }

    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: 'email-verification',
      })

      if (result.error) {
        setErrorMessage('Could not send a new code. Please try again later.')
        return
      }

      setStatusMessage('If this account needs verification, a new code has been sent.')
    } catch {
      setErrorMessage('Could not send a new code. Please try again later.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleChangeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    const updatedEmail = newEmail.trim().toLowerCase()
    setErrorMessage('')
    setStatusMessage('')
    setIsBusy(true)

    try {
      const response = await fetch('/api/auth/email-otp/change-unverified-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentEmail: email.trim().toLowerCase(),
          newEmail: updatedEmail,
          password: currentPassword,
        }),
      })

      if (!response.ok) {
        setErrorMessage('Could not update this email. Check the current address and password, then try again.')
        return
      }

      setEmail(updatedEmail)
      setOtp('')
      setNewEmail('')
      setCurrentPassword('')
      setIsEmailChangeOpen(false)

      try {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: updatedEmail,
          type: 'email-verification',
        })
        setStatusMessage(result.error
          ? 'Your email was updated, but we could not send a code. Select Resend code to try again.'
          : 'Your email address has been updated. A verification code has been sent to your new address.')
      } catch {
        setStatusMessage('Your email was updated, but we could not send a code. Select Resend code to try again.')
      }
    } catch {
      setErrorMessage('Could not update this email. Check the current address and password, then try again.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <LocalizedTree>
      <main className="relative flex min-h-dvh items-center justify-center bg-[#090e19] px-4 py-10 text-slate-100">
        <div className="fixed right-4 top-4 z-50"><LanguageSwitcher compact /></div>
        <div className="my-auto w-full max-w-md">
          <Link href="/" aria-label="pepe.casa home" className="mx-auto mb-8 flex w-fit items-center">
            <PepeCasaLogo size={40} textClassName="text-xl text-white" />
          </Link>

          <section className="rounded-[28px] border border-slate-800 bg-[#111a2b] p-6 shadow-2xl shadow-black/25 sm:p-8">
            <div className="mb-7">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-400">Email verification</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Verify your email</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">Enter the six-digit code we sent after sign-up. The code expires in 10 minutes.</p>
            </div>

            {isVerified ? (
              <div className="space-y-5">
                <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm leading-6 text-emerald-200">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0" />Your email is verified. Sign in to continue to your account.
                </p>
                <Link href={signInHref} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500">
                  Continue to sign in <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <>
                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label htmlFor="verify-email" className="mb-1.5 block text-xs font-bold text-slate-300">Email</label>
                    <input
                      id="verify-email"
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
                  <div>
                    <label htmlFor="verify-code" className="mb-1.5 block text-xs font-bold text-slate-300">Six-digit code</label>
                    <input
                      id="verify-code"
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
                    {isBusy ? <><LoaderCircle size={16} className="animate-spin" />Checking…</> : <>Verify email <ArrowRight size={16} /></>}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isBusy}
                  className="mt-4 w-full rounded-xl border border-slate-700 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEmailChangeOpen((open) => !open)
                    setErrorMessage('')
                    setStatusMessage('')
                  }}
                  disabled={isBusy}
                  aria-expanded={isEmailChangeOpen}
                  aria-controls="email-change-form"
                  className="mt-3 w-full text-center text-xs font-bold text-blue-300 transition hover:text-blue-200 disabled:opacity-60"
                >
                  Can&apos;t receive a code at this address? Change it
                </button>

                {isEmailChangeOpen && (
                  <form
                    id="email-change-form"
                    onSubmit={handleChangeEmail}
                    className="mt-4 space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-4"
                  >
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-100">Change email address</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-400">Use your current password to keep this account and nickname.</p>
                    </div>
                    <div>
                      <label htmlFor="new-email" className="mb-1.5 block text-xs font-bold text-slate-300">New email address</label>
                      <input
                        id="new-email"
                        name="newEmail"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="email-change-password" className="mb-1.5 block text-xs font-bold text-slate-300">Current password</label>
                      <input
                        id="email-change-password"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                        maxLength={128}
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isBusy ? <><LoaderCircle size={16} className="animate-spin" />Updating…</> : 'Update email and send code'}
                    </button>
                  </form>
                )}
                <p className="mt-5 text-center text-xs text-slate-400">
                  Already verified?{' '}
                  <Link href={signInHref} className="font-bold text-blue-300 transition hover:text-blue-200">Sign in</Link>
                </p>
              </>
            )}
          </section>

          <p className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] leading-5 text-slate-500">
            <ShieldCheck size={13} className="shrink-0 text-blue-400" />Your account remains protected until your email is verified.
          </p>
          {!isVerified && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Need to start over? <Link href={signUpHref} className="font-bold text-blue-300 hover:text-blue-200">Create an account</Link>
            </p>
          )}
        </div>
      </main>
    </LocalizedTree>
  )
}
