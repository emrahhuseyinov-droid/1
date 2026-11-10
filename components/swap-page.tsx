'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeftRight, CheckCircle2, CircleAlert, Coins, LockKeyhole, ShieldCheck } from 'lucide-react'
import { AdsLabBanner } from '@/components/adslab-banner'
import { LocalizedTree } from '@/components/site-language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { calculatePepeSwapFeeAtomic, formatPepeAtomic, parsePepeAmountToAtomic, PEPE_SWAP_FEE_PERCENT } from '@/lib/pepe-amount'
import { MARKET_PRICE_REFRESH_INTERVAL_MS } from '@/lib/wallet-assets'

type SwapToken = 'HOMERO' | 'PEPE'
type SwapDirection = 'HOMERO_TO_PEPE' | 'PEPE_TO_HOMERO'
type ReserveAction = 'initialize' | 'initialize_homero' | 'initialize_amm' | 'fund'

type SwapSnapshot = {
  balancesAtomic: { HOMERO: string; PEPE: string }
  reserveAvailableAtomic: string
  initialReserveSeeded: boolean
  homeroTreasuryAvailableAtomic: string
  homeroRemainingSupplyAtomic: string
  homeroTreasurySeeded: boolean
  homeroAmmSeeded: boolean
  homeroPoolReserveAtomic: string
  pepePoolReserveAtomic: string
  homeroToPepeRate: number
  isReserveAdmin: boolean
  swapQuote: SwapQuote | null
}

type SwapQuote = {
  direction: SwapDirection
  amountAtomic: string
  grossOutputAtomic: string
  feePepeAtomic: string
  netOutputAtomic: string
  homeroReserveAtomic: string
  pepeReserveAtomic: string
  homeroToPepeRate: number
  expiresAt: string
  quoteToken: string
}

type MarketQuote = {
  pepeUsd: number
  homeroUsdReference: number
  homeroToPepeReferenceRate: number
  homeroAmmSeeded: boolean
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

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 0.01 ? 10 : 2,
    minimumFractionDigits: value < 0.01 ? 4 : 2,
  }).format(value)
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 }).format(value)
}

function preventImeSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed. Please try again.'
}

function getTokens(from: SwapToken) {
  const to = from === 'HOMERO' ? 'PEPE' : 'HOMERO'
  const direction: SwapDirection = from === 'HOMERO' ? 'HOMERO_TO_PEPE' : 'PEPE_TO_HOMERO'
  return { from, to, direction }
}

export function SwapPage() {
  const router = useRouter()
  const [from, setFrom] = useState<SwapToken>('HOMERO')
  const [amount, setAmount] = useState('')
  const [topUpAmount, setTopUpAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [isFunding, setIsFunding] = useState(false)
  const [swapAttempt, setSwapAttempt] = useState<{ idempotencyKey: string; amount: string; direction: SwapDirection } | null>(null)
  const [fundingAttempt, setFundingAttempt] = useState<{ idempotencyKey: string; amount: string } | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [reserveNotice, setReserveNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const { to, direction } = getTokens(from)
  const amountAtomic = amount ? parsePepeAmountToAtomic(amount) : null
  const amountIsInvalid = amount.length > 0 && amountAtomic === null
  const topUpAmountIsInvalid = topUpAmount.length > 0 && parsePepeAmountToAtomic(topUpAmount) === null
  const query = new URLSearchParams({ from, to })
  if (amountAtomic !== null && amountAtomic > 0) query.set('amount', amount)

  const {
    data: snapshot,
    error: snapshotError,
    isLoading: snapshotLoading,
    mutate: refreshSnapshot,
  } = useSWR<SwapSnapshot>(`/api/referrals/swap?${query.toString()}`, fetchJson, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  })
  const {
    data: marketQuote,
    error: marketError,
  } = useSWR<MarketQuote>('/api/pepe-price', fetchJson, {
    refreshInterval: MARKET_PRICE_REFRESH_INTERVAL_MS,
    revalidateOnFocus: true,
  })

  const quote = snapshot?.swapQuote
  const availableBalanceAtomic = BigInt(snapshot?.balancesAtomic[from] ?? '0')
  const positiveBalanceAtomic = availableBalanceAtomic > 0n ? availableBalanceAtomic : 0n
  const quoteMatchesInput = Boolean(
    quote && amountAtomic !== null && quote.direction === direction && quote.amountAtomic === String(amountAtomic),
  )
  const quoteExpiresAt = quote ? Date.parse(quote.expiresAt) : 0
  const quoteExpired = !quoteMatchesInput || quoteExpiresAt <= Date.now()
  const insufficientBalance = amountAtomic !== null && BigInt(amountAtomic) > positiveBalanceAtomic
  const retryingSameSwap = swapAttempt?.amount === amount && swapAttempt.direction === direction
  const canSwap = Boolean(
    snapshot?.homeroAmmSeeded && quoteMatchesInput && !quoteExpired && amountAtomic !== null &&
    amountAtomic > 0 && !insufficientBalance && !isSwapping,
  )
  const displayedOutputAtomic = quoteMatchesInput ? quote?.netOutputAtomic ?? '0' : '0'
  const displayedFeeAtomic = quoteMatchesInput ? quote?.feePepeAtomic ?? '0' : '0'
  const outputUsd = quoteMatchesInput && marketQuote
    ? to === 'PEPE'
      ? (Number(displayedOutputAtomic) / 100_000_000) * marketQuote.pepeUsd
      : (Number(displayedOutputAtomic) / 100_000_000) * marketQuote.homeroUsdReference
    : null
  const maxSwapAtomic = positiveBalanceAtomic < BigInt(Number.MAX_SAFE_INTEGER)
    ? positiveBalanceAtomic
    : BigInt(Number.MAX_SAFE_INTEGER)
  const maxSwapAmount = maxSwapAtomic > 0n ? formatPepeAtomic(maxSwapAtomic.toString()) : ''
  const poolHasLiquidity = Boolean(snapshot?.homeroAmmSeeded && BigInt(snapshot.homeroPoolReserveAtomic) > 0n && BigInt(snapshot.pepePoolReserveAtomic) > 0n)

  async function handleSwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSwap || amountAtomic === null || !quote) return

    const attempt = retryingSameSwap
      ? swapAttempt
      : { idempotencyKey: crypto.randomUUID(), amount, direction }
    setSwapAttempt(attempt)
    setNotice(null)
    setIsSwapping(true)

    try {
      const response = await fetch('/api/referrals/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          amount,
          idempotencyKey: attempt.idempotencyKey,
          quoteToken: quote.quoteToken,
        }),
      })
      const payload = await response.json().catch(() => null) as (ApiError & { inputAtomic?: number; outputAtomic?: number; feePepeAtomic?: number }) | null
      if (!response.ok) {
        if (response.status < 500) setSwapAttempt(null)
        throw new Error(payload?.error ?? 'The swap could not be completed.')
      }

      setNotice({
        kind: 'success',
        text: `Exchanged ${formatPepeAtomic(payload?.inputAtomic ?? amountAtomic)} ${from} for ${formatPepeAtomic(payload?.outputAtomic ?? 0)} ${to}. PEPE fee: ${formatPepeAtomic(payload?.feePepeAtomic ?? 0)}.`,
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

  async function handleReserveAction(action: ReserveAction, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
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
        body: JSON.stringify(action === 'fund'
          ? { action, amount: topUpAmount, idempotencyKey: attempt?.idempotencyKey }
          : { action }),
      })
      const payload = await response.json().catch(() => null) as ApiError | null
      if (!response.ok) {
        if (response.status < 500 && action === 'fund') setFundingAttempt(null)
        throw new Error(payload?.error ?? 'The exchange balance could not be updated.')
      }

      const successText = action === 'initialize'
        ? 'The PEPE reserve is ready.'
        : action === 'initialize_homero'
          ? 'The HOMERO treasury is ready.'
          : action === 'initialize_amm'
            ? 'The AMM pool is initialized at the seeded reserve ratio.'
            : 'PEPE was added to the reserve.'
      setReserveNotice({ kind: 'success', text: successText })
      if (action === 'fund') {
        setTopUpAmount('')
        setFundingAttempt(null)
      }
      await refreshSnapshot()
    } catch (error) {
      setReserveNotice({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsFunding(false)
    }
  }

  const pageError = snapshotError ? getErrorMessage(snapshotError) : marketError ? getErrorMessage(marketError) : null
  const swapButtonLabel = isSwapping
    ? 'Swapping…'
    : retryingSameSwap
      ? 'Retry same swap'
      : !snapshot
        ? 'Loading exchange…'
        : !snapshot.homeroAmmSeeded
          ? 'Pool not initialized'
          : !amount
            ? 'Enter an amount'
            : amountIsInvalid
              ? 'Check amount format'
              : insufficientBalance
                ? `Insufficient ${from}`
                : quoteExpired
                  ? 'Waiting for a fresh quote…'
                  : `Swap ${from} for ${to}`

  const priceLabel = marketQuote
    ? `PEPE/USD ${formatUsd(marketQuote.pepeUsd)}`
    : 'PEPE/USD unavailable'

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Internal token exchange</p>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[28px]">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><ArrowLeftRight aria-hidden="true" /></span>
              HOMERO / PEPE AMM
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Two-way swaps use the live internal liquidity pool. HOMERO is an in-app balance, not a blockchain asset.</p>
          </div>
          <Badge variant={snapshot?.homeroAmmSeeded ? 'secondary' : 'outline'} className="px-3 py-1.5">
            {snapshot?.homeroAmmSeeded ? 'AMM pool active' : 'Pool awaiting admin seed'}
          </Badge>
        </header>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section aria-labelledby="swap-card-title" className="rounded-[26px] border border-blue-500/15 bg-dashboard-surface p-5 shadow-lg shadow-black/5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="swap-card-title" className="text-sm font-extrabold">Swap tokens</h2>
                <p className="mt-1 text-[10px] text-dashboard-muted">Constant-product pricing · live pool reserves</p>
              </div>
              <Badge variant="secondary">{PEPE_SWAP_FEE_PERCENT}% fee in PEPE</Badge>
            </div>

            <div role="group" aria-label="Choose swap direction" className="mt-5 grid grid-cols-2 gap-2">
              {(['HOMERO', 'PEPE'] as const).map((token) => (
                <Button
                  key={token}
                  type="button"
                  variant={from === token ? 'default' : 'outline'}
                  aria-pressed={from === token}
                  disabled={isSwapping}
                  onClick={() => { setFrom(token); setNotice(null) }}
                  className="h-10"
                >
                  {token} {token === 'HOMERO' ? '→ PEPE' : '→ HOMERO'}
                </Button>
              ))}
            </div>

            <form onSubmit={handleSwap} className="mt-4 flex flex-col gap-3">
              <div className={`rounded-2xl border bg-dashboard-surface-raised p-4 ${swapAttempt && retryingSameSwap ? 'border-amber-500/40' : 'border-dashboard-outline'}`}>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="amm-swap-amount" className="text-[9px] font-bold uppercase tracking-[0.14em] text-dashboard-muted">You send</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-dashboard-muted">{`Available ${snapshot ? formatPepeAtomic(snapshot.balancesAtomic[from]) : '—'} ${from}`}</span>
                    <button
                      type="button"
                      disabled={!maxSwapAmount || isSwapping}
                      onClick={() => { setAmount(maxSwapAmount); setNotice(null) }}
                      aria-label={`Set the maximum exchangeable ${from} amount`}
                      className="rounded-lg px-2 py-1 text-[9px] font-bold text-blue-600 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
                    >Max</button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <FieldGroup className="min-w-0 flex-1 gap-0">
                    <Field className="gap-0" data-invalid={amountIsInvalid}>
                      <FieldLabel htmlFor="amm-swap-amount" className="sr-only">{`${from} amount to exchange`}</FieldLabel>
                      <Input
                        id="amm-swap-amount"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00000000"
                        value={amount}
                        aria-invalid={amountIsInvalid}
                        aria-describedby="amm-swap-amount-hint"
                        onKeyDown={preventImeSubmit}
                        onChange={(event) => { setAmount(event.target.value); setNotice(null) }}
                        className="h-auto border-0 bg-transparent px-0 py-0 font-mono text-2xl font-black tracking-tight shadow-none focus-visible:ring-0"
                      />
                      <FieldError>{amountIsInvalid ? 'Enter a positive amount with up to 8 decimal places.' : undefined}</FieldError>
                    </Field>
                  </FieldGroup>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-extrabold text-blue-600 dark:text-blue-300"><Coins aria-hidden="true" />{from}</span>
                </div>
              </div>
              <p id="amm-swap-amount-hint" className="-mt-1 px-1 text-[9px] leading-relaxed text-dashboard-muted">The quote updates with the pool. Each trade is subject to a 1% PEPE commission.</p>

              <div className="flex items-center justify-center" aria-hidden="true">
                <span className="flex size-8 items-center justify-center rounded-full border border-dashboard-outline bg-dashboard-surface text-blue-500"><ArrowLeftRight /></span>
              </div>

              <div className="rounded-2xl border border-dashboard-outline bg-dashboard-surface-raised p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-dashboard-muted">You receive (estimated)</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-mono text-2xl font-black tracking-tight">{quoteMatchesInput ? formatPepeAtomic(displayedOutputAtomic) : '0.00000000'}</p>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300"><Coins aria-hidden="true" />{to}</span>
                </div>
                <p className="mt-1 text-[9px] text-dashboard-muted">{quoteMatchesInput ? `PEPE fee: ${formatPepeAtomic(displayedFeeAtomic)}` : 'Fee shown when a quote is ready'}</p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] dark:bg-slate-900/60">
                <span className="text-dashboard-muted">Estimated value received</span>
                <span className="font-mono font-bold">{outputUsd === null ? '—' : formatUsd(outputUsd)}</span>
              </div>

              {insufficientBalance && <p role="status" className="text-[10px] text-rose-600">The amount exceeds your available {from} balance.</p>}
              {!snapshot?.homeroAmmSeeded && <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">The exchange is paused until the administrator explicitly seeds the initial liquidity.</p>}
              {snapshot?.homeroAmmSeeded && !poolHasLiquidity && <p role="status" className="text-[10px] text-rose-600">The AMM pool currently has insufficient liquidity.</p>}
              {quoteMatchesInput && <p className="flex items-center justify-between gap-2 text-[9px] text-dashboard-muted"><span>Quote expires</span><time dateTime={quote?.expiresAt}>{new Date(quoteExpiresAt).toLocaleTimeString()}</time></p>}
              {quoteMatchesInput && from === 'PEPE' && <p className="text-[9px] text-dashboard-muted">The fee is taken from PEPE sent before calculating HOMERO output.</p>}
              {retryingSameSwap && <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">The last request may still be processing. Retry the same amount and direction to confirm it without a duplicate swap.</p>}
              {notice && <Alert role={notice.kind === 'error' ? 'alert' : 'status'} variant={notice.kind === 'error' ? 'destructive' : 'default'}><AlertDescription>{notice.text}</AlertDescription></Alert>}
              {snapshotError && <Alert role="alert" variant="destructive"><AlertDescription>{getErrorMessage(snapshotError)}</AlertDescription></Alert>}
              {!snapshotError && quoteExpired && amount && !amountIsInvalid && snapshot?.homeroAmmSeeded && <p role="status" className="text-[9px] text-dashboard-muted">{snapshotLoading ? 'Refreshing the signed quote…' : 'A fresh quote is required to swap.'}</p>}

              <Button type="submit" size="lg" disabled={!canSwap} className="h-auto w-full py-3">
                {swapButtonLabel}
                {!isSwapping && <ArrowLeftRight data-icon="inline-end" />}
              </Button>
            </form>

            <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-slate-400"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-blue-500" />Swaps only change internal site balances. HOMERO is not withdrawn or transferred on-chain.</p>
          </section>

          <div className="flex flex-col gap-4">
            <section aria-label="AMM market details" className="rounded-[26px] border border-dashboard-outline bg-dashboard-surface p-5 shadow-sm shadow-black/5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-sm font-extrabold">Pool details</h2><p className="mt-1 text-[10px] text-dashboard-muted">{marketQuote?.source ?? 'Live market feed'}</p></div>
                <Badge variant={poolHasLiquidity ? 'secondary' : 'outline'}>{poolHasLiquidity ? 'Liquidity available' : 'No active liquidity'}</Badge>
              </div>
              <dl className="mt-4 flex flex-col gap-3 text-[10px]">
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Spot rate</dt><dd className="font-mono font-bold">{snapshot?.homeroAmmSeeded ? `1 HOMERO = ${formatRate(snapshot.homeroToPepeRate)} PEPE` : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Reverse spot rate</dt><dd className="font-mono font-bold">{snapshot?.homeroAmmSeeded && snapshot.homeroToPepeRate > 0 ? `1 PEPE = ${formatRate(1 / snapshot.homeroToPepeRate)} HOMERO` : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">PEPE pool</dt><dd className="font-mono font-bold">{snapshot ? `${formatPepeAtomic(snapshot.pepePoolReserveAtomic)} PEPE` : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">HOMERO pool</dt><dd className="font-mono font-bold">{snapshot ? `${formatPepeAtomic(snapshot.homeroPoolReserveAtomic)} HOMERO` : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">PEPE/USD</dt><dd className="font-mono font-bold">{marketQuote ? formatUsd(marketQuote.pepeUsd) : 'Unavailable'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Estimated HOMERO/USD</dt><dd className="font-mono font-bold">{marketQuote?.homeroAmmSeeded ? formatUsd(marketQuote.homeroUsdReference) : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">Swap fee</dt><dd className="font-bold">{PEPE_SWAP_FEE_PERCENT}% in PEPE</dd></div>
              </dl>
              <p className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-3 py-2.5 text-[9px] leading-relaxed text-dashboard-muted">The displayed rate is the pool spot price; trade output also reflects constant-product slippage. Quotes are signed, expire after 30 seconds, and become stale when pool reserves change.</p>
            </section>

            <AdsLabBanner id="unit-n4lvvnn6m" container="adslab-banner-unit-n4lvvnn6m" alignment="center" format="large-rectangle" />

            {snapshot?.isReserveAdmin && (
              <section aria-labelledby="reserve-title" className="rounded-[26px] border border-amber-500/20 bg-amber-500/[0.035] p-5 shadow-sm shadow-black/5 sm:p-6">
                <header className="flex items-start justify-between gap-3">
                  <div><p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">Administrator controls</p><h2 id="reserve-title" className="mt-1 text-sm font-extrabold">Initialize exchange funds</h2></div>
                  <LockKeyhole aria-hidden="true" className="text-amber-500" />
                </header>
                <p className="mt-2 text-[10px] leading-relaxed text-dashboard-muted">Funds move only after an explicit action. The initial pool uses 100M PEPE and 500M HOMERO from the two admin reserves.</p>
                <dl className="mt-4 flex flex-col gap-2 text-[10px]">
                  <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">PEPE base reserve</dt><dd className="font-mono font-bold">{formatPepeAtomic(snapshot.reserveAvailableAtomic)} PEPE</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">HOMERO treasury</dt><dd className="font-mono font-bold">{formatPepeAtomic(snapshot.homeroTreasuryAvailableAtomic)} HOMERO</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-dashboard-muted">AMM status</dt><dd className="font-bold">{snapshot.homeroAmmSeeded ? 'Initialized' : 'Not seeded'}</dd></div>
                </dl>

                <div className="mt-4 flex flex-col gap-2">
                  {!snapshot.initialReserveSeeded && <Button type="button" variant="outline" disabled={isFunding} onClick={() => void handleReserveAction('initialize')}>Initialize 100M PEPE reserve</Button>}
                  {!snapshot.homeroTreasurySeeded && <Button type="button" variant="outline" disabled={isFunding} onClick={() => void handleReserveAction('initialize_homero')}>Initialize 10B HOMERO treasury</Button>}
                  {!snapshot.homeroAmmSeeded && <Button type="button" disabled={isFunding || !snapshot.initialReserveSeeded || !snapshot.homeroTreasurySeeded} onClick={() => void handleReserveAction('initialize_amm')}>Initialize 100M / 500M AMM pool</Button>}
                </div>

                <form onSubmit={(event) => void handleReserveAction('fund', event)} className="mt-4 flex flex-col gap-2">
                  <FieldGroup>
                    <Field data-invalid={topUpAmountIsInvalid}>
                      <FieldLabel htmlFor="pepe-reserve-top-up">Add PEPE to base reserve</FieldLabel>
                      <Input
                        id="pepe-reserve-top-up"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00000000"
                        value={topUpAmount}
                        aria-invalid={topUpAmountIsInvalid}
                        onKeyDown={preventImeSubmit}
                        onChange={(event) => { setTopUpAmount(event.target.value); setReserveNotice(null) }}
                      />
                      <FieldError>{topUpAmountIsInvalid ? 'Enter a positive amount with up to 8 decimal places.' : undefined}</FieldError>
                    </Field>
                  </FieldGroup>
                  <Button type="submit" variant="outline" disabled={isFunding || !topUpAmount || topUpAmountIsInvalid}>{isFunding ? 'Updating reserve…' : 'Add PEPE reserve funds'}</Button>
                </form>

                {reserveNotice && <Alert className="mt-3" role={reserveNotice.kind === 'error' ? 'alert' : 'status'} variant={reserveNotice.kind === 'error' ? 'destructive' : 'default'}><AlertDescription>{reserveNotice.text}</AlertDescription></Alert>}
                <p className="mt-3 text-[9px] text-dashboard-muted">{`HOMERO treasury available: ${formatPepeAtomic(snapshot.homeroTreasuryAvailableAtomic)} · remaining supply cap: ${formatPepeAtomic(snapshot.homeroRemainingSupplyAtomic)}.`}</p>
              </section>
            )}

            {pageError && !snapshotError && <Alert role="alert" variant="destructive"><AlertDescription>{pageError}</AlertDescription></Alert>}
          </div>
        </div>
      </main>
    </LocalizedTree>
  )
}
