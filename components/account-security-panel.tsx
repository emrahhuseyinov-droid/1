'use client'

import { useState, type FormEvent } from 'react'
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LocalizedTree } from '@/components/site-language-provider'
import { authClient } from '@/lib/auth-client'

export function AccountSecurityPanel({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')

  const passwordStrength = [
    newPassword.length >= 8,
    newPassword.length >= 12,
    /[a-z]/.test(newPassword),
    /[A-Z]/.test(newPassword),
    /\d/.test(newPassword),
    /[^a-zA-Z0-9]/.test(newPassword),
  ].filter(Boolean).length

  const passwordStrengthLabel = !newPassword
    ? 'Type a password to see strength.'
    : newPassword.length < 8
      ? 'Too short'
      : passwordStrength >= 5
        ? 'Strong'
        : passwordStrength >= 4
          ? 'Good'
          : passwordStrength >= 3
            ? 'Fair'
            : 'Weak'

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isChangingPassword) return

    setPasswordError('')
    setPasswordStatus('')

    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })

      if (result.error) {
        setPasswordError('Could not update the password. Check the current password and try again.')
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStatus('Password updated for this signed-in account.')
    } catch {
      setPasswordError('Could not update the password. Please try again.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <LocalizedTree>
      <div className="flex w-full flex-col gap-6">
        <header className="space-y-1">
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">Security & access</h2>
          <p className="max-w-2xl text-sm leading-6 text-white/65">Protect your account with a password that is unique and hard to guess.</p>
        </header>

        <section className="relative isolate overflow-hidden rounded-[28px] border border-amber-200/20 bg-gradient-to-br from-[#13233a] via-[#101a2b] to-[#171625] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.28)] sm:p-7" aria-labelledby="security-intro-heading">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-cyan-300/[0.09] blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-amber-300/[0.06] blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-gradient-to-br from-amber-300/[0.18] to-cyan-300/[0.08] text-amber-100 shadow-[0_0_28px_rgba(250,204,21,0.1)]">
                <ShieldCheck size={23} aria-hidden="true" />
              </span>
              <div className="max-w-2xl">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">Account protection</p>
                <h3 id="security-intro-heading" className="mt-1 text-lg font-black tracking-tight sm:text-xl">Make your account harder to compromise.</h3>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/65">A unique, longer password is one of the simplest ways to protect your account. Change it whenever you think it may have been exposed.</p>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-2 rounded-full border border-cyan-200/15 bg-black/20 px-3 py-2 text-[10px] font-semibold text-white/70 shadow-inner sm:flex">
              <KeyRound size={14} className="text-amber-200" aria-hidden="true" />
              <span>Password protection</span>
            </div>
          </div>
        </section>

        <div className="w-full">
          <section className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.09] bg-gradient-to-br from-[#111c2d] via-[#0f1725] to-[#151522] p-4 shadow-[0_24px_65px_rgba(0,0,0,0.3)] sm:p-7" aria-labelledby="change-password-heading">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-cyan-300/[0.055] blur-3xl" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/15 bg-amber-300/[0.1] text-amber-100">
                  <KeyRound size={18} aria-hidden="true" />
                </span>
                <div>
                  <h3 id="change-password-heading" className="text-sm font-extrabold">Change password</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Managed by Better Auth</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" aria-pressed={showPasswords} onClick={() => setShowPasswords((visible) => !visible)} className="border-white/10 bg-white/[0.035] text-white/75 hover:border-amber-200/30 hover:bg-amber-200/[0.06] hover:text-amber-100">
                {showPasswords ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
                {showPasswords ? 'Hide passwords' : 'Show passwords'}
              </Button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-white/65">This changes the password only for the signed-in account: <span className="break-all font-semibold text-cyan-100">{email}</span>. Confirm the current password to continue.</p>

            <form onSubmit={handlePasswordChange} className="mt-5">
              <FieldSet>
                <FieldLegend className="sr-only">Change password fields</FieldLegend>
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                    <Input
                      className="h-11 border-white/10 bg-white/[0.035] text-white focus-visible:border-amber-200/45 focus-visible:ring-amber-200/20"
                      id="current-password"
                      name="currentPassword"
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-password">New password</FieldLabel>
                    <Input
                      className="h-11 border-white/10 bg-white/[0.035] text-white focus-visible:border-amber-200/45 focus-visible:ring-amber-200/20"
                      id="new-password"
                      name="newPassword"
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={newPassword}
                      aria-describedby="password-strength-hint"
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                    <FieldDescription id="password-strength-hint" className="mt-2">
                      <span className="flex gap-1" aria-hidden="true">
                        {Array.from({ length: 6 }, (_, index) => (
                          <span key={index} className={`h-1.5 flex-1 rounded-full ${index < passwordStrength ? 'bg-gradient-to-r from-amber-300 to-yellow-200' : 'bg-white/10'}`} />
                        ))}
                      </span>
                      <span className="mt-1 block" aria-live="polite">{passwordStrengthLabel}</span>
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}>
                    <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                    <Input
                      className="h-11 border-white/10 bg-white/[0.035] text-white focus-visible:border-amber-200/45 focus-visible:ring-amber-200/20"
                      id="confirm-password"
                      name="confirmPassword"
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmPassword}
                      aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                      <FieldError>The new passwords do not match.</FieldError>
                    )}
                  </Field>
                </FieldGroup>
                {passwordError && <FieldError>{passwordError}</FieldError>}
                {passwordStatus && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2.5 text-xs leading-relaxed text-emerald-100">{passwordStatus}</p>}
                <Button type="submit" size="lg" disabled={isChangingPassword} className="mt-1 h-11 w-full border-0 bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 font-extrabold text-slate-950 shadow-[0_10px_28px_rgba(245,158,11,0.17)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101827] disabled:opacity-60 sm:w-auto sm:min-w-48">
                  {isChangingPassword ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Updating…</> : 'Update password'}
                </Button>
              </FieldSet>
            </form>
          </section>

        </div>
      </div>
    </LocalizedTree>
  )
}
