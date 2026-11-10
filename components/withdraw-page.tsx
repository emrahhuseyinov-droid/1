'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowDownToLine, Check, CircleAlert, Clock3, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { TokenLogo } from '@/components/token-logo'
import { AdsLabBanner } from '@/components/adslab-banner'
import { LocalizedTree } from '@/components/site-language-provider'
import { parsePepeAmountToAtomic } from '@/lib/pepe-amount'
import { DAILY_WITHDRAWAL_LIMIT_ATOMIC, DAILY_WITHDRAWAL_LIMIT_PEPE, MIN_WITHDRAWAL_ATOMIC, MIN_WITHDRAWAL_PEPE, PEPE_ATOMIC_UNITS } from '@/lib/withdrawal-constants'
import type { WithdrawalRequestView, WithdrawalSnapshot } from '@/lib/withdrawal-types'

type Props = { balance: number }

async function fetchWithdrawals(url: string): Promise<WithdrawalSnapshot> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error ?? 'Could not load withdrawal data.')
  return result as WithdrawalSnapshot
}

function formatAtomic(value: string | number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(Number(value) / PEPE_ATOMIC_UNITS)
}

function formatAtomicInput(value: string) {
  return (Number(value) / PEPE_ATOMIC_UNITS).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function getStatusDetails(status: WithdrawalRequestView['status']) {
  if (status === 'paid') return { label: 'Paid', detail: 'FaucetPay confirmed the automatic payout.', classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
  if (status === 'rejected') return { label: 'Rejected', detail: 'FaucetPay declined the payout and the PEPE was returned to your balance.', classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' }
  return { label: 'Pending', detail: 'No final payout confirmation is recorded. Your PEPE remains reserved; do not submit this request again.', classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
}

export function WithdrawPage({ balance }: Props) {
  const router = useRouter()
  const requestKeyRef = useRef<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<WithdrawalSnapshot>('/api/withdrawals', fetchWithdrawals, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const [amount, setAmount] = useState('')
  const [faucetPayEmail, setFaucetPayEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const availableAtomic = BigInt(data?.availableBalanceAtomic ?? String(Math.max(0, Math.round(balance * PEPE_ATOMIC_UNITS))))
  const dailyRemainingAtomic = BigInt(data?.dailyRemainingAtomic ?? String(DAILY_WITHDRAWAL_LIMIT_ATOMIC))
  const parsedAmountAtomic = parsePepeAmountToAtomic(amount)
  const amountBigInt = parsedAmountAtomic === null ? 0n : BigInt(parsedAmountAtomic)
  const canSubmitAmount = parsedAmountAtomic !== null
    && amountBigInt >= BigInt(MIN_WITHDRAWAL_ATOMIC)
    && amountBigInt <= availableAtomic
    && amountBigInt <= dailyRemainingAtomic
  const maxRequestAtomic = availableAtomic < dailyRemainingAtomic ? availableAtomic : dailyRemainingAtomic
  const dailyUsedAtomic = BigInt(data?.todayUsedAtomic ?? '0')
  const dailyLimitAtomic = BigInt(data?.dailyLimitAtomic ?? String(DAILY_WITHDRAWAL_LIMIT_ATOMIC))
  const dailyProgress = dailyLimitAtomic > 0n ? Math.min(100, Number((dailyUsedAtomic * 10_000n) / dailyLimitAtomic) / 100) : 0

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !data) return
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!canSubmitAmount) {
      setErrorMessage('Check the 1,000 PEPE minimum, your available balance, and the remaining daily limit.')
      return
    }

    const requestKey = requestKeyRef.current ?? crypto.randomUUID()
    requestKeyRef.current = requestKey
    setSubmitting(true)

    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, faucetPayEmail, requestKey }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? 'Could not submit your withdrawal request.')

      requestKeyRef.current = null
      setAmount('')
      if (result?.status === 'paid') {
        setSuccessMessage(result.paymentReference ? `Payout sent automatically. FaucetPay reference: ${result.paymentReference}.` : 'Payout sent automatically and confirmed by FaucetPay.')
      } else if (result?.status === 'rejected') {
        setErrorMessage('FaucetPay declined the payout. Your PEPE has been returned to your balance.')
      } else {
        setSuccessMessage('The request was saved, but FaucetPay did not confirm the result. Your PEPE remains reserved; do not submit it again.')
      }
      await mutate()
      router.refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit your withdrawal request.')
    } finally {
      setSubmitting(false)
    }
  }

  function setMaxAmount() {
    if (maxRequestAtomic >= BigInt(MIN_WITHDRAWAL_ATOMIC)) setAmount(formatAtomicInput(maxRequestAtomic.toString()))
  }

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-1 ring-inset ring-white/15 sm:size-14"><ArrowDownToLine size={21} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">PEPE payouts</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Withdraw PEPE</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">PEPE is sent automatically through FaucetPay after your request is accepted.</p>
          </div>
        </div>
        <AdsLabBanner id="unit-g09b379xl" container="adslab-banner-unit-g09b379xl" alignment="right" />
      </header>

      <section aria-label="Available PEPE balance and withdrawal limits" className="relative isolate overflow-hidden rounded-[28px] border border-blue-300/25 bg-gradient-to-br from-blue-600 via-blue-800 to-indigo-950 p-5 text-white shadow-xl shadow-blue-950/25 ring-1 ring-inset ring-white/10 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full border-[32px] border-white/[0.05]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-5 top-12 size-40 rounded-full bg-blue-300/10 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-100/75"><Wallet size={12} />Available PEPE balance</p>
            <p className="mt-2 flex items-center gap-2 font-mono text-3xl font-black tracking-tight sm:text-4xl"><TokenLogo symbol="PEPE" size={28} />{formatAtomic(availableAtomic.toString())}</p>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-blue-100/75">Your balance is reserved while the app sends PEPE to your verified FaucetPay account.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:min-w-[290px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-blue-100/60">Minimum request</p>
              <p className="mt-1.5 font-mono text-sm font-black">{MIN_WITHDRAWAL_PEPE.toLocaleString('en-US')} PEPE</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-blue-100/60">Daily limit</p>
              <p className="mt-1.5 font-mono text-sm font-black">{DAILY_WITHDRAWAL_LIMIT_PEPE.toLocaleString('en-US')} PEPE</p>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-xs font-semibold text-rose-600 dark:text-rose-300"><CircleAlert size={15} />{error.message}</div>}
      {successMessage && <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check size={15} className="mt-0.5 shrink-0" />{successMessage}</div>}
      {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-xs font-semibold text-rose-600 dark:text-rose-300"><CircleAlert size={15} className="mt-0.5 shrink-0" />{errorMessage}</div>}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section aria-labelledby="withdraw-form-title" className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-[#111a2b] sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h2 id="withdraw-form-title" className="text-lg font-extrabold tracking-tight">Request an automatic payout</h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">One FaucetPay email and one PEPE amount per request.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-500/10 bg-blue-500/[0.07] px-3 py-1.5 text-[10px] font-extrabold text-blue-700 dark:text-blue-300"><TokenLogo symbol="PEPE" size={12} />PEPE only</span>
          </div>

          <form onSubmit={submitRequest} className="space-y-4">
            <div>
              <label htmlFor="faucetpay-email" className="mb-2 block text-xs font-bold">FaucetPay account email</label>
              <input
                id="faucetpay-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={faucetPayEmail}
                onChange={(event) => setFaucetPayEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={submitting || !data}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/50"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">We&apos;ll verify this email with FaucetPay before creating the request. It must belong to a registered, verified account.</p>
            </div>

            <div>
              <label htmlFor="withdraw-amount" className="mb-2 block text-xs font-bold">Amount to withdraw</label>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-900/50">
                <input
                  id="withdraw-amount"
                  type="number"
                  min={MIN_WITHDRAWAL_PEPE}
                  max={Math.max(0, Number(maxRequestAtomic) / PEPE_ATOMIC_UNITS)}
                  step="0.00000001"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="1,000 or more"
                  disabled={submitting || !data}
                  className="withdraw-amount-input min-w-0 flex-1 appearance-none bg-transparent px-1 py-1 font-mono text-sm font-bold outline-none placeholder:font-sans placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-500"><TokenLogo symbol="PEPE" size={13} />PEPE</span>
                <button type="button" onClick={setMaxAmount} disabled={!data || submitting || maxRequestAtomic < BigInt(MIN_WITHDRAWAL_ATOMIC)} className="rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">MAX</button>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Available today: {formatAtomic(maxRequestAtomic.toString())} PEPE. The daily cap resets at 00:00 UTC.</p>
            </div>

            <div className="rounded-2xl border border-blue-200/70 bg-blue-50/70 px-4 py-3.5 dark:border-blue-400/15 dark:bg-blue-400/[0.045]">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-300">Daily limit used</span>
                <span className="font-mono text-[11px] font-extrabold text-slate-800 dark:text-slate-100">{formatAtomic(data?.todayUsedAtomic ?? '0')} / {formatAtomic(data?.dailyLimitAtomic ?? String(DAILY_WITHDRAWAL_LIMIT_ATOMIC))} PEPE</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-slate-800" role="progressbar" aria-label="Daily withdrawal limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dailyProgress}><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width]" style={{ width: `${dailyProgress}%` }} /></div>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200/60 bg-white/70 px-3 py-2.5 dark:border-blue-300/10 dark:bg-white/[0.025]">
                <Clock3 size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">Pending and paid requests count toward today&apos;s limit. Rejected requests release both the reserved balance and daily quota.</p>
              </div>
            </div>

            <button type="submit" disabled={submitting || !data || !canSubmitAmount || !faucetPayEmail.trim()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-900/10 transition hover:-translate-y-0.5 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
              {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />}
              {submitting ? 'Verifying & sending payout...' : 'Send automatic payout'}
            </button>
          </form>
        </section>

        <section aria-labelledby="withdraw-steps-title" className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-[#111a2b] sm:p-7">
          <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><Sparkles size={17} aria-hidden="true" /></span><h2 id="withdraw-steps-title" className="text-lg font-extrabold tracking-tight">What happens next</h2></div>
          <ol className="mt-6 space-y-5">
            <li className="flex gap-3.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-black text-blue-600 dark:text-blue-300">1</span><div><p className="text-sm font-bold">Request received</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Your PEPE is reserved and the request is added to your payout history.</p></div></li>
            <li className="flex gap-3.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-black text-blue-600 dark:text-blue-300">2</span><div><p className="text-sm font-bold">Automatic FaucetPay transfer</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">The app sends PEPE to the verified FaucetPay email you entered.</p></div></li>
            <li className="flex gap-3.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-black text-blue-600 dark:text-blue-300">3</span><div><p className="text-sm font-bold">Status appears in your history</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">FaucetPay confirms successful payouts automatically. If it declines a payout, the PEPE returns to your available balance.</p></div></li>
          </ol>
          <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
            <LockKeyhole size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">If FaucetPay does not return a clear result, the balance stays reserved and the app will not retry automatically, preventing an accidental duplicate transfer.</p>
          </div>
        </section>
      </div>

      <section aria-labelledby="withdraw-history-title" className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-[#111a2b]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 dark:border-slate-800 sm:px-7">
          <div><h2 id="withdraw-history-title" className="text-lg font-extrabold tracking-tight">Your requests</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Track every request from pending to confirmed.</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Clock3 size={11} />{data?.requests.length ?? 0} total</span>
        </header>
        {isLoading && !data ? <div className="flex items-center justify-center gap-2 px-5 py-8 text-xs font-semibold text-slate-400"><LoaderCircle size={15} className="animate-spin" />Loading requests...</div> : data?.requests.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.requests.map((request) => {
              const status = getStatusDetails(request.status)
              return <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 gap-3">
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${request.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : request.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'}`}>{request.status === 'paid' ? <Check size={14} /> : request.status === 'pending' ? <Clock3 size={14} /> : <ShieldCheck size={14} />}</span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-extrabold">{status.label}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${status.classes}`}>{request.status}</span></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{status.detail}</p><p className="mt-1 truncate text-[10px] text-slate-400">{request.faucetPayEmail} <span aria-hidden="true">·</span> {formatDate(request.createdAt)}</p>{request.paymentReference && <p className="mt-1 break-all font-mono text-[9px] text-slate-400">Reference: {request.paymentReference}</p>}{request.adminNote && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Note: {request.adminNote}</p>}</div>
                </div>
                <p className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-black text-slate-800 dark:text-slate-100"><TokenLogo symbol="PEPE" size={13} />{formatAtomic(request.amountAtomic)} PEPE</p>
              </li>
            })}
          </ul>
        ) : <div className="flex flex-col items-center px-5 py-8 text-center"><span className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Clock3 size={18} /></span><p className="mt-3 text-xs font-bold">No payout requests yet</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Your submitted requests and payment confirmations will appear here.</p></div>}
      </section>

    </main>
    </LocalizedTree>
  )
}
