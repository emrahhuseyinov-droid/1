'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeftRight, CheckCircle2, CircleAlert, Coins, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LocalizedTree } from '@/components/site-language-provider'
import { AdsLabBanner } from '@/components/adslab-banner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { calculatePepeSwapFeeAtomic, formatPepeAtomic, parsePepeAmountToAtomic, PEPE_SWAP_FEE_PERCENT } from '@/lib/pepe-amount'
import { MARKET_PRICE_REFRESH_INTERVAL_MS } from '@/lib/wallet-assets'

type SwapSnapshot = {
  balancesAtomic: { HOMERO: number; PEPE: number }
  reserveAvailableAtomic: string
  initialReserveSeeded: boolean
  isReserveAdmin: boolean
}

type PepeQuote = {
  pepeUsd: number
  homeroUsdReference: number
  homeroToPepeReferenceRate: number
  source: string
  network: string
}

type ApiError = { error?: string }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'Request failed. Please try again.'
    throw new Error(message)
  }
  return payload as T
}

function formatUsdPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumSignificantDigits: 8,
  }).format(value)
}

function formatUsdValue(value: number) {
  if (value === 0) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 0.01 ? 10 : 2,
  }).format(value)
}

function preventImeSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
    event.preventDefault()
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed. Please try again.'
}

export function SwapPage() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [topUpAmount, setTopUpAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [isFunding, setIsFunding] = useState(false)
  const [swapAttempt, setSwapAttempt] = useState<{ idempotencyKey: string; amount: string } | null>(null)
  const [fundingAttempt, setFundingAttempt] = useState<{ idempotencyKey: string; amount: string } | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [reserveNotice, setReserveNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const {
    data: snapshot,
    error: snapshotError,
    isLoading: snapshotLoading,
    mutate: refreshSnapshot,
  } = useSWR<SwapSnapshot>('/api/referrals/swap', fetchJson, { refreshInterval: 30_000, revalidateOnFocus: true })
  const {
    data: quote,
    error: quoteError,
    isLoading: quoteLoading,
  } = useSWR<PepeQuote>('/api/pepe-price', fetchJson, {
    refreshInterval: MARKET_PRICE_REFRESH_INTERVAL_MS,
    revalidateOnFocus: true,
  })

  const amountAtomic = amount ? parsePepeAmountToAtomic(amount) : null
  const exchangeFeeAtomic = amountAtomic === null ? 0n : calculatePepeSwapFeeAtomic(amountAtomic)
  const pepeReceiveAtomic = amountAtomic === null ? 0n : BigInt(amountAtomic) - exchangeFeeAtomic
  const currentHomeroAtomic = Math.max(0, snapshot?.balancesAtomic.HOMERO ?? 0)
  const homeroBalanceAtomic = BigInt(Number.isSafeInteger(currentHomeroAtomic) ? currentHomeroAtomic : 0)
  const availableReserveAtomic = BigInt(snapshot?.reserveAvailableAtomic ?? '0')
  const maxSwapAtomic = homeroBalanceAtomic < availableReserveAtomic ? homeroBalanceAtomic : availableReserveAtomic
  const maxSwapAmount = maxSwapAtomic > 0n ? formatPepeAtomic(maxSwapAtomic.toString()) : ''
  const retryingSameSwap = swapAttempt?.amount === amount
  const amountIsInvalid = amount.length > 0 && amountAtomic === null
  const topUpAmountIsInvalid = topUpAmount.length > 0 && parsePepeAmountToAtomic(topUpAmount) === null
  const insufficientHomero = amountAtomic !== null && BigInt(amountAtomic) > BigInt(currentHomeroAtomic)
  const insufficientReserve = amountAtomic !== null && BigInt(amountAtomic) > availableReserveAtomic
  const canSwap = Boolean(
    snapshot && amountAtomic !== null && amountAtomic > 0 && !isSwapping &&
    (retryingSameSwap || (!insufficientHomero && !insufficientReserve)),
  )
  const estimatedUsd = amountAtomic !== null && quote
    ? (Number(pepeReceiveAtomic) / 100_000_000) * quote.pepeUsd
    : null

  async function handleSwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSwap || amountAtomic === null) return

    const attempt = swapAttempt?.amount === amount
      ? swapAttempt
      : { idempotencyKey: crypto.randomUUID(), amount }
    setSwapAttempt(attempt)
    setNotice(null)
    setIsSwapping(true)

    try {
      const response = await fetch('/api/referrals/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, idempotencyKey: attempt.idempotencyKey }),
      })
      const payload = await response.json().catch(() => null) as (ApiError & { homeroDebitedAtomic?: number; pepeCreditedAtomic?: number; feeAtomic?: number }) | null
      if (!response.ok) {
        if (response.status < 500) setSwapAttempt(null)
        throw new Error(payload?.error ?? 'The swap could not be completed.')
      }

      const homeroDebited = payload?.homeroDebitedAtomic ?? amountAtomic
      const pepeCredited = payload?.pepeCreditedAtomic ?? amountAtomic
      const fee = payload?.feeAtomic ?? Number(calculatePepeSwapFeeAtomic(homeroDebited))
      setNotice({
        kind: 'success',
        text: `Exchanged ${formatPepeAtomic(homeroDebited)} HOMERO for ${formatPepeAtomic(pepeCredited)} PEPE. Fee: ${formatPepeAtomic(fee)} PEPE, credited to the admin balance.`,
      })
      setAmount('')
      setSwapAttempt(null)
      await refreshSnapshot().catch(() => undefined)
      router.refresh()
    } catch (error) {
      setNotice({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSwapping(false)
    }
  }

  async function handleReserveAction(action: 'initialize' | 'fund', event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!snapshot?.isReserveAdmin || isFunding) return

    const parsedTopUp = action === 'fund' ? parsePepeAmountToAtomic(topUpAmount) : null
    if (action === 'fund' && parsedTopUp === null) {
      setReserveNotice({ kind: 'error', text: 'Enter a positive PEPE amount with up to 8 decimal places.' })
      return
    }

    const attempt = action === 'fund'
      ? fundingAttempt?.amount === topUpAmount
        ? fundingAttempt
        : { idempotencyKey: crypto.randomUUID(), amount: topUpAmount }
      : null

    if (attempt) setFundingAttempt(attempt)
    setReserveNotice(null)
    setIsFunding(true)
    try {
      const response = await fetch('/api/referrals/swap/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'initialize'
          ? { action }
          : { action, amount: topUpAmount, idempotencyKey: attempt?.idempotencyKey }),
      })
      const payload = await response.json().catch(() => null) as ApiError | null
      if (!response.ok) {
        if (response.status < 500 && action === 'fund') setFundingAttempt(null)
        throw new Error(payload?.error ?? 'The exchange balance could not be updated.')
      }

      setReserveNotice({
        kind: 'success',
        text: action === 'initialize' ? 'The exchange balance is ready.' : 'PEPE was added to the exchange balance.',
      })
      if (action === 'fund') {
        setTopUpAmount('')
        setFundingAttempt(null)
      }
      await refreshSnapshot().catch(() => undefined)
    } catch (error) {
      setReserveNotice({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsFunding(false)
    }
  }

  const pageError = snapshotError ? getErrorMessage(snapshotError) : quoteError ? getErrorMessage(quoteError) : null
  const swapButtonLabel = isSwapping
    ? 'Exchanging…'
    : swapAttempt
      ? 'Retry same exchange'
      : !snapshot
        ? 'Loading balances…'
        : !amount
          ? 'Enter an amount to exchange'
          : amountIsInvalid
            ? 'Check amount format'
            : insufficientHomero
              ? 'Insufficient HOMERO'
              : insufficientReserve
                ? 'Insufficient exchange balance'
                : 'Exchange HOMERO for PEPE'

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">TOKEN EXCHANGE</p>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[28px]">
            <span className="flex size-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><ArrowLeftRight size={17} /></span>
            HOMERO to PEPE
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{`One-way internal exchange at a 1:1 reference rate. A ${PEPE_SWAP_FEE_PERCENT}% fee is deducted from PEPE received and credited to the admin balance.`}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          {quote ? `PEPE/USD ${formatUsdPrice(quote.pepeUsd)}` : quoteLoading ? 'Loading PEPE/USD���' : 'PEPE/USD unavailable'}
        </span>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section aria-labelledby="swap-card-title" className="rounded-[26px] border border-blue-500/15 bg-dashboard-surface p-5 shadow-lg shadow-black/5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="swap-card-title" className="text-sm font-extrabold">Convert internal balance</h2>
              <p className="mt-1 text-[10px] text-dashboard-muted">1 HOMERO = 1 PEPE · no reverse swaps</p>
            </div>
            <Badge variant="secondary">{`${PEPE_SWAP_FEE_PERCENT}% exchange fee`}</Badge>
          </div>

          <form onSubmit={handleSwap} className="mt-5 flex flex-col gap-3">
            <div className={cn('rounded-2xl border bg-dashboard-surface-raised p-4', swapAttempt ? 'border-amber-500/40' : 'border-dashboard-outline')}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-dashboard-muted">You send</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-dashboard-muted">{`Available ${snapshot ? formatPepeAtomic(snapshot.balancesAtomic.HOMERO) : '—'} HOMERO`}</span>
                  <button
                    type="button"
                    disabled={!maxSwapAmount || Boolean(swapAttempt)}
                    onClick={() => { setAmount(maxSwapAmount); setNotice(null) }}
                    aria-label="Set the maximum exchangeable HOMERO amount"
                    className="rounded-lg px-2 py-1 text-[9px] font-bold text-blue-600 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
                  >
                    Max
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <FieldGroup className="min-w-0 flex-1 gap-0">
                  <Field className="gap-0" data-invalid={amountIsInvalid}>
                    <FieldLabel htmlFor="homero-swap-amount" className="sr-only">HOMERO amount to exchange</FieldLabel>
                    <Input
                      id="homero-swap-amount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00000000"
                      value={amount}
                      disabled={Boolean(swapAttempt)}
                      aria-invalid={amountIsInvalid}
                      aria-describedby="swap-amount-hint"
                      onKeyDown={preventImeSubmit}
                      onChange={(event) => { setAmount(event.target.value); setNotice(null) }}
                      className="h-auto border-0 bg-transparent px-0 py-0 font-mono text-2xl font-black tracking-tight shadow-none focus-visible:ring-0"
                    />
                    <FieldError>{amountIsInvalid ? 'Enter a positive amount with up to 8 decimal places.' : undefined}</FieldError>
                  </Field>
                </FieldGroup>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-extrabold text-blue-600 dark:text-blue-300"><Coins size={14} />HOMERO</span>
              </div>
            </div>
            <p id="swap-amount-hint" className="-mt-1 px-1 text-[9px] leading-relaxed text-dashboard-muted">{`Enter a positive amount or choose Max. The ${PEPE_SWAP_FEE_PERCENT}% fee is deducted from PEPE received.`}</p>

            <div className="flex items-center justify-center" aria-hidden="true">
              <span className="flex size-8 items-center justify-center rounded-full border border-dashboard-outline bg-dashboard-surface text-blue-500"><ArrowLeftRight size={14} /></span>
            </div>

            <div className="rounded-2xl border border-dashboard-outline bg-dashboard-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-dashboard-muted">You receive</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-mono text-2xl font-black tracking-tight">{amountAtomic === null ? '0.00000000' : formatPepeAtomic(pepeReceiveAtomic.toString())}</p>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300"><Coins size={14} />PEPE</span>
              </div>
              <p className="mt-1 text-[9px] text-dashboard-muted">{PEPE_SWAP_FEE_PERCENT}% fee: {formatPepeAtomic(exchangeFeeAtomic.toString())} PEPE</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] dark:bg-slate-900/60">
              <span className="text-dashboard-muted">{`Estimated value received · ${quote?.source ?? 'live market feed'}`}</span>
              <span className="font-mono font-bold">{estimatedUsd === null ? '—' : formatUsdValue(estimatedUsd)}</span>
            </div>

            {insufficientHomero && <p role="status" className="text-[10px] text-rose-600">Amount exceeds your available HOMERO balance.</p>}
            {insufficientReserve && <p role="status" className="text-[10px] text-rose-600">This amount exceeds the available exchange balance.</p>}
            {snapshot && availableReserveAtomic <= 0n && !amount && <p role="status" className="text-[10px] text-dashboard-muted">The exchange balance is not available yet.</p>}

            {swapAttempt && <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">The last request may still be processing. Retry the same amount to safely confirm it without a duplicate swap.</p>}
            {notice && <Alert role={notice.kind === 'error' ? 'alert' : 'status'} variant={notice.kind === 'error' ? 'destructive' : 'default'}><AlertDescription>{notice.text}</AlertDescription></Alert>}

            <Button type="submit" size="lg" disabled={!canSwap} className="h-auto w-full py-3">
              {swapButtonLabel}
              {!isSwapping && <ArrowLeftRight data-icon="inline-end" />}
            </Button>
          </form>

          <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-slate-400"><ShieldCheck size={12} className="mt-0.5 shrink-0 text-blue-500" />This changes internal site balances only. It does not send or withdraw on-chain PEPE.</p>
        </section>

        <div className="flex flex-col gap-4">
          <section aria-label="Exchange details" className="rounded-[26px] border border-dashboard-outline bg-dashboard-surface p-5 shadow-sm shadow-black/5 sm:p-6">
            <h2 className="text-sm font-extrabold">Exchange details</h2>
            <dl className="mt-4 flex flex-col gap-3 text-[10px]">
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Direction</dt><dd className="font-bold">HOMERO <span className="text-blue-500">→</span> PEPE</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Reference rate</dt><dd className="font-mono font-bold">1 HOMERO = 1 PEPE</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">PEPE/USD</dt><dd className="font-mono font-bold">{quote ? formatUsdPrice(quote.pepeUsd) : quoteLoading ? 'Loading…' : 'Unavailable'}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Live source</dt><dd className="font-bold">{quote ? `${quote.source} · ${quote.network}` : 'DEX Screener'}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Reverse PEPE → HOMERO</dt><dd className="inline-flex items-center gap-1 font-bold text-rose-500"><LockKeyhole size={11} />Unavailable</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Exchange fee</dt><dd className="font-bold">{PEPE_SWAP_FEE_PERCENT}%</dd></div>
            </dl>
            <p className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-3 py-2.5 text-[9px] leading-relaxed text-dashboard-muted">{`The ${PEPE_SWAP_FEE_PERCENT}% fee is deducted from the PEPE output and recorded separately in the configured admin's PEPE balance. This exchange updates internal balances only, not blockchain holdings.`}</p>
          </section>

          <AdsLabBanner id="unit-j32z8abjg" container="adslab-banner-unit-j32z8abjg" alignment="center" />
          <AdsLabBanner
            id="unit-n4lvvnn6m"
            container="adslab-banner-unit-n4lvvnn6m"
            alignment="center"
            format="large-rectangle"
          />

          {snapshot?.isReserveAdmin && (
            <section aria-labelledby="reserve-title" className="rounded-[26px] border border-amber-500/20 bg-amber-500/[0.035] p-5 shadow-sm shadow-black/5 sm:p-6">
              <header className="flex items-start justify-between gap-3">
                <div><p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">Admin only</p><h2 id="reserve-title" className="mt-1 text-sm font-extrabold">Exchange balance</h2></div>
                <Badge variant="outline"><LockKeyhole data-icon="inline-start" />Internal ledger</Badge>
              </header>
              <p className="mt-3 font-mono text-xl font-black tracking-tight">{snapshot ? formatPepeAtomic(snapshot.reserveAvailableAtomic) : '—'} <span className="text-xs font-bold text-dashboard-muted">PEPE</span></p>
              <p className="mt-1 text-[9px] leading-relaxed text-dashboard-muted">Internal exchange funds for PEPE provided to the site. No blockchain transfer occurs here.</p>

              {!snapshot.initialReserveSeeded && (
                <form onSubmit={(event) => handleReserveAction('initialize', event)} className="mt-4">
                  <Button type="submit" variant="secondary" size="lg" disabled={isFunding} className="h-auto w-full py-2.5">
                    {isFunding ? 'Initializing…' : 'Initialize exchange balance'}
                  </Button>
                </form>
              )}

              {snapshot.initialReserveSeeded && (
                <form onSubmit={(event) => handleReserveAction('fund', event)} className="mt-4 flex flex-col gap-2">
                  <FieldGroup className="gap-2">
                    <Field data-invalid={topUpAmountIsInvalid}>
                      <FieldLabel htmlFor="pepe-reserve-topup">Add PEPE to exchange balance</FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          id="pepe-reserve-topup"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Amount"
                          value={topUpAmount}
                          disabled={Boolean(fundingAttempt)}
                          aria-invalid={topUpAmountIsInvalid}
                          onKeyDown={preventImeSubmit}
                          onChange={(event) => setTopUpAmount(event.target.value)}
                          className="min-w-0 flex-1 font-mono"
                        />
                        <Button type="submit" variant="secondary" disabled={isFunding || parsePepeAmountToAtomic(topUpAmount) === null}>
                          {isFunding ? 'Adding…' : 'Add PEPE'}
                        </Button>
                      </div>
                      <FieldError>{topUpAmountIsInvalid ? 'Enter a positive amount with up to 8 decimal places.' : undefined}</FieldError>
                    </Field>
                  </FieldGroup>
                </form>
              )}
              {reserveNotice && <Alert role={reserveNotice.kind === 'error' ? 'alert' : 'status'} variant={reserveNotice.kind === 'error' ? 'destructive' : 'default'} className="mt-3"><AlertDescription>{reserveNotice.text}</AlertDescription></Alert>}
            </section>
          )}
        </div>
      </div>

      {pageError && !snapshot && !snapshotLoading && <Alert variant="destructive"><CircleAlert /><AlertDescription>{pageError}</AlertDescription></Alert>}
      {snapshotLoading && <p role="status" className="text-center text-[10px] text-dashboard-muted">Loading internal balances…</p>}
      {snapshot && snapshot.isReserveAdmin && snapshot.initialReserveSeeded && <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[9px] text-slate-400"><CheckCircle2 size={12} className="text-emerald-500" />Only HOMERO → PEPE swaps are enabled. PEPE cannot be exchanged back to HOMERO.</p>}
      {snapshot && !snapshot.isReserveAdmin && <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[9px] text-slate-400"><ShieldCheck size={12} className="text-blue-500" />One-way internal exchange. No withdrawals or on-chain transfers are performed here.</p>}
      {!snapshot && snapshotError && <p role="status" className="sr-only">{getErrorMessage(snapshotError)}</p>}
      {quoteError && !quote && <Alert><CircleAlert /><AlertDescription>Live market quote unavailable. Swaps still use the fixed 1 HOMERO = 1 PEPE internal rate.</AlertDescription></Alert>}
    </main>
    </LocalizedTree>
  )
}
