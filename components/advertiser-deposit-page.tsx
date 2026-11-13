'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { BadgeCheck, CircleAlert, Clock3, ExternalLink, LoaderCircle, RefreshCw, Sparkles, Wallet } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TokenLogo } from '@/components/token-logo'
import { useSiteLanguage } from '@/components/site-language-provider'

type DepositStatus = 'pending' | 'paid' | 'underpaid' | 'review'
type CheckoutFields = {
  actionUrl: string
  merchantUsername: string
  itemDescription: string
  amount1: string
  currency1: 'PEPE'
  custom: string
  callbackUrl: string
  successUrl: string
  cancelUrl: string
}
type DepositSummary = {
  id: string
  status: DepositStatus
  amountUsd: string
  pepeUsdPrice: string
  amountAtomic: string
  actualAmountAtomic: string | null
  createdAt: string
  paidAt: string | null
  checkout?: CheckoutFields | null
}
type DepositListResponse = { deposits: DepositSummary[] }
type CreateDepositResponse = { deposit: DepositSummary; checkout: CheckoutFields | null }
type ApiErrorResponse = { error?: string }
type CreateDepositPayload = { amountUsd: string; requestKey: string }
type PepeQuote = { pepeUsd: number; source?: string; network?: string; updatedAt?: string }

const atomicUnitsPerPepe = 100_000_000n
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as (ApiErrorResponse & T) | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load advertiser top-ups.')
  return result as T
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null) as (ApiErrorResponse & T) | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not create the payment request.')
  return result as T
}

function parseUsdCents(value: string) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return cents >= 1n ? cents : null
}

function formatAtomic(value: string, language: 'en' | 'ru') {
  const atomic = BigInt(value)
  const whole = atomic / atomicUnitsPerPepe
  const fraction = (atomic % atomicUnitsPerPepe).toString().padStart(8, '0').replace(/0+$/, '')
  const integer = new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(whole)
  return `${integer}${fraction ? `${language === 'ru' ? ',' : '.'}${fraction}` : ''}`
}

function estimatePepe(usd: number, pepeUsd: number, language: 'en' | 'ru') {
  if (!Number.isFinite(usd) || !Number.isFinite(pepeUsd) || pepeUsd <= 0) return null
  const roundedUp = Math.ceil((usd / pepeUsd) * Number(atomicUnitsPerPepe)) / Number(atomicUnitsPerPepe)
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 8 }).format(roundedUp)
}

function formatUsd(value: string, language: 'en' | 'ru') {
  const amount = Number(value)
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function statusLabel(status: DepositStatus, isRussian: boolean) {
  if (status === 'paid') return isRussian ? 'Зачислено' : 'Credited'
  if (status === 'underpaid') return isRussian ? 'Сумма ниже счёта' : 'Underpaid'
  if (status === 'review') return isRussian ? 'Нужна проверка' : 'Needs review'
  return isRussian ? 'Ожидает FaucetPay' : 'Awaiting FaucetPay'
}

function statusClasses(status: DepositStatus) {
  if (status === 'paid') return 'border-emerald-700/15 bg-emerald-100 text-emerald-900'
  if (status === 'underpaid' || status === 'review') return 'border-amber-700/15 bg-amber-100 text-amber-950'
  return 'border-sky-700/15 bg-sky-100 text-sky-950'
}

export function AdvertiserDepositPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [amountUsd, setAmountUsd] = useState('0.01')
  const [activeDepositId, setActiveDepositId] = useState<string | null>(null)
  const [createdDeposit, setCreatedDeposit] = useState<DepositSummary | null>(null)
  const [activeCheckout, setActiveCheckout] = useState<CheckoutFields | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const requestKeyRef = useRef<{ amountUsd: string; key: string } | null>(null)

  const quote = useSWR<PepeQuote>('/api/pepe-price', getJson, { refreshInterval: 35_000, revalidateOnFocus: true })
  const deposits = useSWR<DepositListResponse>('/api/advertiser/deposits', getJson, { refreshInterval: 5_000, revalidateOnFocus: true })
  const { trigger: createDeposit, isMutating } = useSWRMutation<CreateDepositResponse, Error, string, CreateDepositPayload>(
    '/api/advertiser/deposits',
    (url, { arg }) => postJson<CreateDepositResponse>(url, arg),
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const depositId = params.get('deposit')
    if (depositId && uuidPattern.test(depositId)) setActiveDepositId(depositId)
    if (params.get('payment') === 'returned') {
      setFeedback({ type: 'success', message: isRussian ? 'Возврат с FaucetPay получен. Проверяем оплату и обновим статус автоматически.' : 'Returned from FaucetPay. We are verifying the payment and will update its status automatically.' })
    } else if (params.get('payment') === 'cancelled') {
      setFeedback({ type: 'success', message: isRussian ? 'Оплата не завершена. Можно продолжить её ниже или создать новый счёт.' : 'Checkout was not completed. You can resume it below or create a new invoice.' })
    }
  }, [isRussian])

  const parsedCents = parseUsdCents(amountUsd)
  const amountNumber = parsedCents === null ? null : Number(parsedCents) / 100
  const minimumPepe = quote.data?.pepeUsd ? estimatePepe(0.01, quote.data.pepeUsd, language) : null
  const estimatedPepe = amountNumber !== null && quote.data?.pepeUsd
    ? estimatePepe(amountNumber, quote.data.pepeUsd, language)
    : null
  const listedDeposit = deposits.data?.deposits.find((deposit) => deposit.id === activeDepositId)
  const selectedDeposit = listedDeposit
    ?? (activeDepositId === createdDeposit?.id ? createdDeposit : null)
    ?? deposits.data?.deposits.find((deposit) => deposit.status === 'pending')
    ?? deposits.data?.deposits[0]
    ?? createdDeposit
  const selectedCheckout = activeCheckout
    ?? selectedDeposit?.checkout
    ?? null

  async function handleCreatePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (parsedCents === null || !quote.data?.pepeUsd) return

    const normalizedAmount = (Number(parsedCents) / 100).toFixed(2)
    const existing = requestKeyRef.current
    const requestKey = existing?.amountUsd === normalizedAmount ? existing.key : crypto.randomUUID()
    requestKeyRef.current = { amountUsd: normalizedAmount, key: requestKey }

    try {
      const result = await createDeposit({ amountUsd: normalizedAmount, requestKey })
      requestKeyRef.current = null
      setCreatedDeposit(result.deposit)
      setActiveDepositId(result.deposit.id)
      setActiveCheckout(result.checkout)
      await deposits.mutate()
      setFeedback({
        type: 'success',
        message: result.deposit.status === 'pending'
          ? isRussian ? 'Счёт создан. Продолжите оплату через FaucetPay ниже.' : 'Invoice created. Continue to FaucetPay below.'
          : isRussian ? 'У этого запроса уже есть статус. Проверьте историю платежей ниже.' : 'This request already has a status. Check the payment history below.',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : isRussian ? 'Не удалось создать счёт FaucetPay.' : 'Could not create the FaucetPay invoice.' })
    }
  }

  function selectDeposit(deposit: DepositSummary) {
    setActiveDepositId(deposit.id)
    setCreatedDeposit(deposit)
    setActiveCheckout(deposit.checkout ?? null)
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-1 pb-8 sm:px-2">
      <section aria-labelledby="advertiser-deposit-title" className="relative isolate overflow-hidden rounded-[32px] border-2 border-[#365579] bg-[#10213a] p-4 text-white shadow-[0_18px_50px_rgba(6,18,34,0.25)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-[#55d6a3]/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-[#f5cd65]/10 blur-3xl" />

        <header className="relative flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-[20px] border-2 border-[#e8f6ba] bg-[#c7ec72] text-[#16334a] shadow-[0_5px_0_#8ea952]">
              <Wallet size={24} />
            </span>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[#80ddbd]/25 bg-[#80ddbd]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#a8efd4]">
                <Sparkles size={13} aria-hidden="true" />
                {isRussian ? 'Рекламный кошелёк' : 'Advertiser wallet'}
              </p>
              <h1 id="advertiser-deposit-title" className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {isRussian ? 'Пополнить баланс' : 'Add funds'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7d7e6]">
                {isRussian ? 'Пополняй баланс в PEPE и запускай новые кампании. Зачисление — после подтверждения платежа FaucetPay.' : 'Top up in PEPE and get your next campaign moving. Funds are credited after FaucetPay confirms the payment.'}
              </p>
            </div>
          </div>
          <a
            href="https://faucetpay.io"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={isRussian ? 'Открыть FaucetPay в новой вкладке' : 'Open FaucetPay in a new tab'}
            className="inline-flex w-fit items-center gap-3 self-end rounded-[20px] border border-white/15 bg-[#183451] px-4 py-3 shadow-[0_5px_0_rgba(4,16,31,0.2)] transition hover:-translate-y-0.5 hover:bg-[#204365] sm:self-auto"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#b6cadb]">{isRussian ? 'Оплата через' : 'Powered by'}</span>
            <img src="https://faucetpay.io/logo.svg" alt="FaucetPay" width="124" height="30" className="h-6 w-auto" />
          </a>
        </header>

        <div className="relative mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
          <form onSubmit={handleCreatePayment} className="flex flex-col gap-5 rounded-[28px] border-2 border-[#ffe7a3] bg-[#fff7df] p-5 text-[#17324a] shadow-[0_8px_0_rgba(7,23,40,0.18)] sm:p-6">
            <FieldGroup className="gap-3">
              <Field data-invalid={amountUsd.length > 0 && parsedCents === null}>
                <FieldLabel htmlFor="advertiser-deposit-usd" className="text-sm font-black text-[#17324a]">{isRussian ? 'Сумма пополнения, USD' : 'Top-up amount, USD'}</FieldLabel>
                <div className="relative mt-1">
                  <span aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-2xl font-black text-[#5a7286]">$</span>
                  <Input
                    id="advertiser-deposit-usd"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    value={amountUsd}
                    onChange={(event) => {
                      setAmountUsd(event.target.value)
                      setActiveCheckout(null)
                    }}
                    placeholder="0.01"
                    aria-describedby="advertiser-deposit-minimum advertiser-deposit-estimate"
                    aria-invalid={amountUsd.length > 0 && parsedCents === null}
                    className="h-16 rounded-[20px] border-2 border-[#d9e0c8] bg-white pl-12 pr-4 font-mono text-2xl font-black tracking-tight text-[#17324a] placeholder:text-[#9aabba] focus-visible:border-[#55b991] focus-visible:ring-[#55b991]/20"
                  />
                </div>
                <FieldDescription id="advertiser-deposit-minimum" className="mt-1 text-sm leading-6 text-[#587084]">
                  {isRussian ? <>Минимум — <strong className="font-mono text-[#17324a]">$0.01</strong>{minimumPepe ? <> · примерно <strong className="font-mono text-[#1b8067]">{minimumPepe} PEPE</strong></> : null}</> : <>Minimum <strong className="font-mono text-[#17324a]">$0.01</strong>{minimumPepe ? <> · about <strong className="font-mono text-[#1b8067]">{minimumPepe} PEPE</strong></> : null}</>}
                </FieldDescription>
              </Field>
            </FieldGroup>

            <div id="advertiser-deposit-estimate" className="flex items-center justify-between gap-4 rounded-[22px] border-2 border-[#a8d878] bg-[#e4f7c3] p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#52733c]">{isRussian ? 'К оплате в FaucetPay' : 'Pay through FaucetPay'}</p>
                <p className="mt-1 font-mono text-2xl font-black tracking-tight text-[#173b43]">{estimatedPepe ?? '—'} <span className="text-sm text-[#386a5e]">PEPE</span></p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-white bg-white shadow-sm">
                <TokenLogo symbol="PEPE" size={34} />
              </span>
            </div>

            <Button type="submit" size="lg" disabled={!quote.data?.pepeUsd || parsedCents === null || isMutating} className="min-h-14 w-full rounded-[18px] text-sm font-black shadow-[0_5px_0_rgba(19,53,88,0.22)] transition hover:-translate-y-0.5">
              {isMutating ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Wallet data-icon="inline-start" />}
              {isMutating ? isRussian ? 'Создаём счёт…' : 'Creating invoice…' : isRussian ? 'Создать счёт' : 'Create invoice'}
            </Button>
            <p className="flex items-start gap-2.5 text-xs leading-5 text-[#597084]">
              <BadgeCheck size={17} className="mt-0.5 shrink-0 text-[#26886c]" aria-hidden="true" />
              {isRussian ? 'Курс PEPE фиксируется при создании счёта. Отправляйте только точную сумму, указанную FaucetPay.' : 'Your PEPE quote is locked when the invoice is created. Send only the exact amount shown by FaucetPay.'}
            </p>
          </form>

          <aside className="relative isolate flex min-h-[19rem] flex-col overflow-hidden rounded-[28px] border-2 border-[#a6d9ae] bg-[#dff4df] p-5 text-[#17324a] shadow-[0_8px_0_rgba(7,23,40,0.14)] sm:p-6">
            <Image
              src="/images/topup-frog-mascot.png"
              alt=""
              aria-hidden="true"
              width={220}
              height={220}
              priority
              className="pointer-events-none absolute -bottom-5 -right-5 z-0 hidden size-52 object-contain mix-blend-multiply sm:block lg:size-56"
            />
            <div className="relative z-10 flex h-full flex-col gap-5 sm:max-w-[68%] sm:pr-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#547d65]">{isRussian ? 'Курс PEPE / USD' : 'PEPE / USD rate'}</p>
                  <p className="mt-2 font-mono text-3xl font-black tracking-tight text-[#173b43] sm:text-4xl">{quote.data?.pepeUsd ? `$${quote.data.pepeUsd.toPrecision(6)}` : '—'}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={isRussian ? 'Обновить курс' : 'Refresh exchange rate'}
                  disabled={quote.isValidating}
                  onClick={() => void quote.mutate()}
                  className="shrink-0 rounded-full border-2 border-[#a6cdaa] bg-white/80 text-[#1d4c57] hover:bg-white"
                >
                  {quote.isLoading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl border border-white/70 bg-white/55 p-3">
                  <dt className="text-[#617b84]">{isRussian ? 'Источник курса' : 'Rate source'}</dt>
                  <dd className="mt-1 font-extrabold text-[#173b43]">{quote.data?.source ?? 'DEX Screener'}</dd>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/55 p-3">
                  <dt className="text-[#617b84]">{isRussian ? 'Сеть' : 'Network'}</dt>
                  <dd className="mt-1 font-extrabold text-[#173b43]">{quote.data?.network ?? 'Ethereum'}</dd>
                </div>
              </dl>
              <p className="max-w-md text-xs leading-5 text-[#55716e]">{isRussian ? 'Эквивалент PEPE рассчитывается по рыночному курсу и округляется вверх до 8 знаков после запятой.' : 'PEPE is calculated from the live market quote and rounded up to 8 decimal places.'}</p>
            </div>
            <p className="relative z-10 mt-auto pt-5 text-[11px] font-extrabold text-[#417363]">{isRussian ? 'Курс обновляется автоматически' : 'Rate updates automatically'}</p>
          </aside>
        </div>

        {feedback && <Alert role={feedback.type === 'error' ? 'alert' : 'status'} className={`relative mt-5 items-start rounded-2xl px-4 py-3 text-sm font-semibold leading-6 ${feedback.type === 'error' ? 'border-rose-200/20 bg-rose-300/10 text-rose-100' : 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100'}`}>
          {feedback.type === 'error' ? <CircleAlert /> : <BadgeCheck />}<AlertDescription className="text-sm font-semibold leading-6 text-current">{feedback.message}</AlertDescription>
        </Alert>}

        {selectedDeposit && <section aria-labelledby="active-deposit-title" className="relative mt-6 rounded-[26px] border-2 border-[#f0d58d] bg-[#fff5dc] p-5 text-[#17324a] shadow-[0_7px_0_rgba(7,23,40,0.14)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex rounded-full bg-[#f5df9c] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#725d2f]">{isRussian ? 'Текущий счёт' : 'Current invoice'}</p>
              <h2 id="active-deposit-title" className="mt-3 text-lg font-black tracking-tight text-[#17324a] sm:text-xl">{formatUsd(selectedDeposit.amountUsd, language)} · {formatAtomic(selectedDeposit.amountAtomic, language)} PEPE</h2>
              <p className="mt-1 break-all font-mono text-xs text-[#62758a]">{selectedDeposit.id}</p>
            </div>
            <Badge variant="outline" className={`h-8 w-fit shrink-0 gap-1.5 rounded-full px-3 text-xs font-extrabold ${statusClasses(selectedDeposit.status)}`}>
              {selectedDeposit.status === 'paid' ? <BadgeCheck data-icon="inline-start" /> : selectedDeposit.status === 'pending' ? <Clock3 data-icon="inline-start" /> : <CircleAlert data-icon="inline-start" />}{statusLabel(selectedDeposit.status, isRussian)}
            </Badge>
          </div>

          {selectedDeposit.status === 'pending' && selectedCheckout && <form action={selectedCheckout.actionUrl} method="post" target="_blank" rel="noopener noreferrer" className="mt-5 flex flex-col gap-4 border-t border-[#e8dcb9] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="merchant_username" value={selectedCheckout.merchantUsername} />
            <input type="hidden" name="item_description" value={selectedCheckout.itemDescription} />
            <input type="hidden" name="amount1" value={selectedCheckout.amount1} />
            <input type="hidden" name="currency1" value={selectedCheckout.currency1} />
            <input type="hidden" name="custom" value={selectedCheckout.custom} />
            <input type="hidden" name="callback_url" value={selectedCheckout.callbackUrl} />
            <input type="hidden" name="success_url" value={selectedCheckout.successUrl} />
            <input type="hidden" name="cancel_url" value={selectedCheckout.cancelUrl} />
            <p className="max-w-lg text-sm leading-6 text-[#5e7286]">{isRussian ? 'После оплаты вернитесь сюда. Статус обновится автоматически после проверки FaucetPay.' : 'Return here after payment. The status updates automatically after FaucetPay verifies it.'}</p>
            <Button type="submit" size="lg" variant="outline" className="min-h-12 shrink-0 rounded-2xl border-2 border-[#a6cdaa] bg-white px-5 text-sm font-extrabold text-[#173b43] hover:bg-[#eef8e9]">{isRussian ? 'Перейти в FaucetPay' : 'Continue to FaucetPay'}<ExternalLink data-icon="inline-end" /></Button>
          </form>}

          {selectedDeposit.status === 'underpaid' && <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm leading-6 text-amber-950">{isRussian ? 'Подтверждённая сумма ниже суммы счёта и не зачислена. Обратитесь в поддержку с ID счёта.' : 'The verified payment was below the invoice amount and was not credited. Contact support with this invoice ID.'}</p>}
          {selectedDeposit.status === 'review' && <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm leading-6 text-amber-950">{isRussian ? 'Платёж подтверждён, но его нельзя зачислить автоматически. Обратитесь в поддержку с ID счёта.' : 'The payment is verified but could not be credited automatically. Contact support with this invoice ID.'}</p>}
          {selectedDeposit.status === 'paid' && <p className="mt-4 rounded-2xl bg-emerald-100 px-4 py-3 text-sm leading-6 text-emerald-950">{isRussian ? 'PEPE зачислены в рекламный кошелёк.' : 'PEPE has been credited to your advertiser wallet.'}</p>}
        </section>}
      </section>

      <section aria-labelledby="deposit-history-title" className="rounded-[30px] border-2 border-[#385879] bg-[#fff8e8] p-5 text-[#17324a] shadow-[0_12px_34px_rgba(6,18,34,0.18)] sm:p-6">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-[#d9f2cf] px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] text-[#39725d]">{isRussian ? 'Платежи' : 'Payments'}</p>
            <h2 id="deposit-history-title" className="mt-2 text-xl font-black tracking-tight text-[#17324a]">{isRussian ? 'История пополнений' : 'Top-up history'}</h2>
          </div>
          {deposits.isLoading && <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-[#63788b]"><LoaderCircle size={16} className="animate-spin" />{isRussian ? 'Загрузка' : 'Loading'}</span>}
        </header>
        {deposits.error && <p role="alert" className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{deposits.error.message}</p>}
        {deposits.data?.deposits.length ? <ul className="flex flex-col gap-3">
          {deposits.data.deposits.map((deposit) => <li key={deposit.id} className="flex flex-col gap-3 rounded-[22px] border border-[#e7dec4] bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-sm font-black text-[#17324a]">{formatUsd(deposit.amountUsd, language)} · {formatAtomic(deposit.amountAtomic, language)} PEPE</p>
              <p className="mt-1 truncate font-mono text-xs text-[#718396]">{new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(deposit.createdAt))} · {deposit.id}</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge variant="outline" className={`h-8 rounded-full px-3 text-xs font-extrabold ${statusClasses(deposit.status)}`}>{statusLabel(deposit.status, isRussian)}</Badge>
              {deposit.status === 'pending' && <Button type="button" size="sm" variant="outline" onClick={() => selectDeposit(deposit)} aria-label={isRussian ? `Открыть счёт ${deposit.id}` : `Open invoice ${deposit.id}`} className="min-h-9 rounded-full border-[#bfd2d0] bg-white px-4 font-bold text-[#17324a] hover:bg-[#eef8e9]">{isRussian ? 'Открыть' : 'Open'}</Button>}
            </div>
          </li>)}
        </ul> : !deposits.isLoading && <div className="rounded-[22px] border-2 border-dashed border-[#cfdbbd] bg-[#f2f8e8] px-4 py-10 text-center text-sm leading-6 text-[#587084]">{isRussian ? 'Пополнений пока нет. Минимальная сумма — $0.01.' : 'No top-ups yet. The minimum amount is $0.01.'}</div>}
      </section>
    </main>
  )
}
