'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { BadgeCheck, CircleAlert, ExternalLink, LoaderCircle, RefreshCw, Sparkles, Wallet } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TokenLogo } from '@/components/token-logo'
import { useSiteLanguage } from '@/components/site-language-provider'
import { cn } from '@/lib/utils'

type DepositStatus = 'pending' | 'paid' | 'underpaid' | 'review' | 'cancelled'
type PaymentMethod = 'faucetpay' | 'cwallet'
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
  provider: PaymentMethod
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
type CreateDepositResponse = { deposit: DepositSummary; checkout: CheckoutFields | null; paymentUrl: string | null }
type ApiErrorResponse = { error?: string }
type CreateDepositPayload = { amountUsd: string; requestKey: string; provider: PaymentMethod }
type PepeQuote = { pepeUsd: number; source?: string; network?: string; updatedAt?: string }
type AdvertiserWalletBalance = { advertiserBalanceAtomic: string }

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
  const match = /^(\d{1,9})(?:([.,])(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = BigInt(match[1]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0')
  return cents >= 50n ? cents : null
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

function statusLabel(status: DepositStatus, isRussian: boolean, provider: PaymentMethod) {
  if (status === 'pending' && provider === 'cwallet') return isRussian ? 'Ожидает оплаты Cwallet' : 'Awaiting Cwallet payment'
  if (status === 'paid') return isRussian ? 'Зачислено' : 'Credited'
  if (status === 'cancelled') return isRussian ? 'Отменено' : 'Cancelled'
  if (status === 'underpaid') return isRussian ? 'Сумма ниже счёта' : 'Underpaid'
  if (status === 'review') return isRussian ? 'Нужна проверка' : 'Needs review'
  return isRussian ? 'Ожидает FaucetPay' : 'Awaiting FaucetPay'
}

function statusClasses(status: DepositStatus) {
  if (status === 'paid') return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
  if (status === 'cancelled') return 'border-slate-300/15 bg-slate-300/[0.06] text-slate-300'
  if (status === 'underpaid' || status === 'review') return 'border-amber-300/20 bg-amber-300/10 text-amber-100'
  return 'border-sky-300/20 bg-sky-300/10 text-sky-100'
}

const cwalletPaymentLinks = [
  { amountUsd: 5 },
  { amountUsd: 10 },
  { amountUsd: 25 },
  { amountUsd: 50 },
] as const

function PaymentMethodSelector({
  isRussian,
  selectedMethod,
  onSelect,
}: {
  isRussian: boolean
  selectedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}) {
  return (
    <section aria-labelledby="deposit-method-title" className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/80">{isRussian ? 'Шаг 1 · способ оплаты' : 'Step 1 · payment route'}</p>
          <h2 id="deposit-method-title" className="mt-1 text-lg font-black tracking-tight text-white">
            {isRussian ? 'Выберите один способ пополнения' : 'Choose one way to add funds'}
          </h2>
        </div>
        <Badge variant="outline" className="w-fit rounded-full border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold text-slate-300">
          {isRussian ? '2 способа' : '2 methods'}
        </Badge>
      </header>

      <ToggleGroup
        aria-label={isRussian ? 'Способ пополнения' : 'Top-up method'}
        value={[selectedMethod]}
        onValueChange={(values) => {
          const nextMethod = values[0]
          if (nextMethod === 'faucetpay' || nextMethod === 'cwallet') onSelect(nextMethod)
        }}
        className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <ToggleGroupItem
          value="faucetpay"
          aria-label={isRussian ? 'Выбрать FaucetPay с автоматическим зачислением' : 'Choose FaucetPay with automatic credit'}
          className="group h-auto min-h-28 w-full justify-start rounded-3xl border border-white/10 bg-[#0d1531] p-4 text-left transition hover:border-emerald-200/30 focus-visible:ring-2 focus-visible:ring-emerald-200/50 data-[pressed]:border-emerald-200/50 data-[pressed]:bg-emerald-200/[0.08] sm:p-5"
        >
          <span className="flex w-full items-center gap-5">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center">
              <Image src="/payment-logos/faucetpay.png" alt="" width={40} height={40} className="size-10 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">FaucetPay</span>
                <Badge variant="outline" className="border-emerald-200/20 bg-emerald-200/[0.08] text-[9px] font-bold text-emerald-100">{isRussian ? 'Автоматически' : 'Automatic'}</Badge>
              </span>
            </span>
            <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-emerald-200 opacity-0 transition-opacity group-data-[pressed]:opacity-100" />
          </span>
        </ToggleGroupItem>

        <ToggleGroupItem
          value="cwallet"
          aria-label={isRussian ? 'Выбрать Cwallet с ручной проверкой' : 'Choose Cwallet with manual review'}
          className="group h-auto min-h-28 w-full justify-start rounded-3xl border border-white/10 bg-[#0d1531] p-4 text-left transition hover:border-sky-200/30 focus-visible:ring-2 focus-visible:ring-sky-200/50 data-[pressed]:border-sky-200/50 data-[pressed]:bg-sky-200/[0.08] sm:p-5"
        >
          <span className="flex w-full items-center gap-5">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center">
              <Image src="/payment-logos/cwallet.svg" alt="" width={40} height={40} className="size-10 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">Cwallet</span>
                <Badge variant="outline" className="border-sky-200/20 bg-sky-200/[0.08] text-[9px] font-bold text-sky-100">{isRussian ? 'Ручное зачисление' : 'Manual credit'}</Badge>
              </span>
            </span>
            <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-sky-100 opacity-0 transition-opacity group-data-[pressed]:opacity-100" />
          </span>
        </ToggleGroupItem>
      </ToggleGroup>
    </section>
  )
}

function CwalletPaymentPanel({ isRussian, language, onPay, isPending, pendingAmount }: {
  isRussian: boolean
  language: 'en' | 'ru'
  onPay: (amountUsd: number) => void
  isPending: boolean
  pendingAmount: number | null
}) {
  return (
    <section aria-labelledby="cwallet-panel-title" className="overflow-hidden rounded-[28px] border border-sky-200/20 bg-[#111a35] text-white shadow-xl shadow-black/10">
      <header className="border-b border-sky-200/10 bg-gradient-to-r from-sky-200/[0.08] via-sky-200/[0.03] to-transparent p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl border border-sky-200/15 bg-sky-200/[0.08] text-sky-100">
              <Wallet size={22} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-100/80">Cwallet · {isRussian ? 'ручная проверка' : 'manual review'}</p>
              <h2 id="cwallet-panel-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                {isRussian ? 'Выберите сумму платежа' : 'Choose a payment amount'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {isRussian ? 'Каждая кнопка открывает отдельную ссылку Cwallet с фиксированной суммой.' : 'Each option opens a separate Cwallet link for its fixed amount.'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-sky-200/20 bg-sky-200/[0.08] px-3 py-1 text-[10px] font-bold text-sky-100">
            {isRussian ? '4 фиксированные суммы' : '4 fixed amounts'}
          </Badge>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {cwalletPaymentLinks.map(({ amountUsd }) => {
            const amountLabel = formatUsd(String(amountUsd), language)
            return (
              <button
                key={amountUsd}
                type="button"
                disabled={isPending}
                onClick={() => onPay(amountUsd)}
                aria-label={isRussian ? `Оплатить ${amountLabel} через Cwallet в новой вкладке` : `Pay ${amountLabel} with Cwallet in a new tab`}
                className="group flex min-h-32 flex-col justify-between rounded-[22px] border border-sky-200/15 bg-[#0d1531] p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-200/40 hover:bg-sky-200/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {isRussian ? 'Фиксированный платёж' : 'Fixed payment'}
                  {pendingAmount === amountUsd
                    ? <LoaderCircle data-icon="inline-end" aria-hidden="true" className="animate-spin text-sky-100" />
                    : <ExternalLink data-icon="inline-end" aria-hidden="true" className="text-sky-100 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
                </span>
                <span className="mt-4 font-mono text-3xl font-black tracking-tight text-white">{amountLabel}</span>
                <span className="mt-2 text-xs font-semibold text-sky-100">{isRussian ? 'Открыть Cwallet' : 'Open Cwallet'}</span>
              </button>
            )
          })}
        </div>

        <Alert role="note" className="items-start rounded-2xl border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-amber-100">
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="text-xs leading-5 text-amber-100">
            {isRussian
              ? 'Каждый начатый платёж появится в истории пополнений. После оплаты сохраните чек или ID транзакции и обратитесь в поддержку для ручной сверки и зачисления.'
              : 'Each started payment will appear in your top-up history. After paying, keep the receipt or transaction ID and contact support for manual review and credit.'}
          </AlertDescription>
        </Alert>
      </div>
    </section>
  )
}

export function AdvertiserDepositPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('faucetpay')
  const [amountUsd, setAmountUsd] = useState('10.00')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pendingCwalletAmount, setPendingCwalletAmount] = useState<number | null>(null)
  const requestKeyRef = useRef<{ provider: PaymentMethod; amountUsd: string; key: string } | null>(null)

  const quote = useSWR<PepeQuote>('/api/pepe-price', getJson, { refreshInterval: 35_000, revalidateOnFocus: true })
  const wallet = useSWR<AdvertiserWalletBalance>('/api/advertiser/wallet', getJson, { refreshInterval: 15_000, revalidateOnFocus: true })
  const deposits = useSWR<DepositListResponse>('/api/advertiser/deposits', getJson, { refreshInterval: 5_000, revalidateOnFocus: true })
  const { trigger: createDeposit, isMutating } = useSWRMutation<CreateDepositResponse, Error, string, CreateDepositPayload>(
    '/api/advertiser/deposits',
    (url, { arg }) => postJson<CreateDepositResponse>(url, arg),
  )

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get('payment')
    if (payment === 'returned') {
      void deposits.mutate()
      setFeedback({ type: 'success', message: isRussian ? 'Возврат с FaucetPay получен. Проверяем оплату и обновим статус автоматически.' : 'Returned from FaucetPay. We are verifying the payment and will update its status automatically.' })
    } else if (payment === 'cancelled') {
      void deposits.mutate()
      setFeedback({ type: 'success', message: isRussian ? 'Оплата отменена. Вы можете создать новый платёж.' : 'Payment cancelled. You can start a new payment.' })
    }
  }, [deposits.mutate, isRussian])

  const parsedCents = parseUsdCents(amountUsd)
  const amountNumber = parsedCents === null ? null : Number(parsedCents) / 100
  const minimumPepe = quote.data?.pepeUsd ? estimatePepe(0.5, quote.data.pepeUsd, language) : null
  const estimatedPepe = amountNumber !== null && quote.data?.pepeUsd
    ? estimatePepe(amountNumber, quote.data.pepeUsd, language)
    : null

  async function handleCreatePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (parsedCents === null || !quote.data?.pepeUsd) return

    const normalizedAmount = (Number(parsedCents) / 100).toFixed(2)
    const existing = requestKeyRef.current
    const requestKey = existing?.provider === 'faucetpay' && existing.amountUsd === normalizedAmount ? existing.key : crypto.randomUUID()
    requestKeyRef.current = { provider: 'faucetpay', amountUsd: normalizedAmount, key: requestKey }

    try {
      const result = await createDeposit({ amountUsd: normalizedAmount, requestKey, provider: 'faucetpay' })
      if (!result.checkout) {
        setFeedback({ type: 'error', message: isRussian ? 'Не удалось подготовить страницу оплаты FaucetPay. Попробуйте ещё раз.' : 'Could not prepare the FaucetPay checkout. Please try again.' })
        return
      }

      requestKeyRef.current = null
      const checkoutForm = document.createElement('form')
      checkoutForm.method = 'post'
      checkoutForm.action = result.checkout.actionUrl
      checkoutForm.hidden = true
      const checkoutFields: Array<[string, string]> = [
        ['merchant_username', result.checkout.merchantUsername],
        ['item_description', result.checkout.itemDescription],
        ['amount1', result.checkout.amount1],
        ['currency1', result.checkout.currency1],
        ['custom', result.checkout.custom],
        ['callback_url', result.checkout.callbackUrl],
        ['success_url', result.checkout.successUrl],
        ['cancel_url', result.checkout.cancelUrl],
      ]
      for (const [name, value] of checkoutFields) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        checkoutForm.append(input)
      }
      document.body.append(checkoutForm)
      checkoutForm.submit()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : isRussian ? 'Не удалось создать счёт FaucetPay.' : 'Could not create the FaucetPay invoice.' })
    }
  }

  async function handleCwalletPayment(amount: number) {
    setFeedback(null)
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) {
      setFeedback({ type: 'error', message: isRussian ? 'Разрешите всплывающие окна, чтобы открыть Cwallet.' : 'Allow pop-ups to open Cwallet.' })
      return
    }
    paymentWindow.opener = null
    setPendingCwalletAmount(amount)

    const normalizedAmount = amount.toFixed(2)
    const existing = requestKeyRef.current
    const requestKey = existing?.provider === 'cwallet' && existing.amountUsd === normalizedAmount ? existing.key : crypto.randomUUID()
    requestKeyRef.current = { provider: 'cwallet', amountUsd: normalizedAmount, key: requestKey }

    try {
      const result = await createDeposit({ amountUsd: normalizedAmount, requestKey, provider: 'cwallet' })
      if (!result.paymentUrl) throw new Error(isRussian ? 'Не удалось подготовить ссылку Cwallet.' : 'Could not prepare the Cwallet payment link.')
      requestKeyRef.current = null
      void deposits.mutate()
      paymentWindow.location.replace(result.paymentUrl)
    } catch (error) {
      paymentWindow.close()
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : isRussian ? 'Не удалось создать платёж Cwallet.' : 'Could not create the Cwallet payment.' })
    } finally {
      setPendingCwalletAmount(null)
    }
  }

  return (
    <main id="top" className="dashboard-page-shell flex flex-col gap-5 sm:gap-6">
      <section aria-labelledby="advertiser-deposit-title" className="flex flex-col gap-5">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/20 bg-emerald-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">
              <Sparkles size={13} aria-hidden="true" />
              {isRussian ? 'Рекламный кошелёк' : 'Advertiser wallet'}
            </p>
            <h1 id="advertiser-deposit-title" className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {isRussian ? 'Пополнить баланс' : 'Add funds'}
            </h1>
          </div>
          <aside aria-label={isRussian ? 'Баланс рекламного кошелька' : 'Advertiser wallet balance'} className="flex w-fit items-center gap-3 rounded-[20px] border border-emerald-200/20 bg-[#111a35] px-4 py-3 shadow-lg shadow-black/10">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-200/10 text-emerald-100"><Wallet size={19} /></span>
            <div>
              <p className="text-[10px] font-bold text-slate-400">{isRussian ? 'Баланс рекламного кошелька' : 'Advertiser balance'}</p>
              <p className="mt-1 flex items-center gap-2 font-mono text-lg font-black tracking-tight text-white"><span>{wallet.data ? formatAtomic(wallet.data.advertiserBalanceAtomic, language) : '—'}</span><span className="text-[10px] font-extrabold text-emerald-100">PEPE</span></p>
            </div>
          </aside>
        </header>

        <PaymentMethodSelector
          isRussian={isRussian}
          selectedMethod={paymentMethod}
          onSelect={(method) => {
            setPaymentMethod(method)
            setFeedback(null)
          }}
        />

        {paymentMethod === 'faucetpay' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.8fr)]">
          <form id="advertiser-deposit-form" onSubmit={handleCreatePayment} className="flex flex-col gap-6 rounded-[28px] border border-white/10 bg-[#111a35] p-4 text-white shadow-xl shadow-black/10 sm:p-6">
            <header className="flex flex-col gap-3 border-b border-emerald-200/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/80">{isRussian ? 'Автоматическое зачисление' : 'Automatic credit'}</p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-white">FaucetPay</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">{isRussian ? 'Введите сумму и нажмите «Оплатить» — вы сразу перейдёте на страницу оплаты FaucetPay.' : 'Enter an amount and select Pay to go straight to FaucetPay.'}</p>
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-emerald-200/20 bg-emerald-200/[0.08] px-3 py-1 text-[10px] font-bold text-emerald-100">
                <BadgeCheck data-icon="inline-start" />{isRussian ? 'Подтверждается автоматически' : 'Auto-verified'}
              </Badge>
            </header>

            <section aria-labelledby="deposit-details-title" className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-300 text-[12px] font-black text-[#10213a]">2</span>
                <h2 id="deposit-details-title" className="text-sm font-black text-white">{isRussian ? 'Детали пополнения' : 'Deposit details'}</h2>
              </div>
              <FieldGroup className="gap-3">
                <Field data-invalid={amountUsd.length > 0 && parsedCents === null}>
                  <FieldLabel htmlFor="advertiser-deposit-usd" className="text-xs font-extrabold text-slate-300">{isRussian ? 'Сумма пополнения, USD' : 'Top-up amount, USD'}</FieldLabel>
                  <div className="relative mt-1">
                    <span aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-2xl font-black text-emerald-100">$</span>
                    <Input
                      id="advertiser-deposit-usd"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={amountUsd}
                      onChange={(event) => setAmountUsd(event.target.value)}
                      placeholder="0.50"
                      aria-describedby="advertiser-deposit-minimum advertiser-deposit-estimate"
                      aria-invalid={amountUsd.length > 0 && parsedCents === null}
                      className="h-[5.5rem] rounded-[20px] border border-white/10 bg-[#0d1531] pl-12 pr-4 font-mono text-3xl font-black tracking-tight text-white placeholder:text-slate-500 focus-visible:border-emerald-200/50 focus-visible:ring-emerald-200/15"
                    />
                  </div>
                  <FieldDescription id="advertiser-deposit-minimum" className="mt-1 text-xs leading-5 text-slate-400">
                    {isRussian ? <>Минимум — <strong className="font-mono text-slate-200">$0.50</strong>{minimumPepe ? <> · примерно <strong className="font-mono text-emerald-100">{minimumPepe} PEPE</strong></> : null}</> : <>Minimum <strong className="font-mono text-slate-200">$0.50</strong>{minimumPepe ? <> · about <strong className="font-mono text-emerald-100">{minimumPepe} PEPE</strong></> : null}</>}
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <p className="flex items-start gap-2.5 text-xs leading-5 text-slate-400">
                <BadgeCheck size={17} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden="true" />
                {isRussian ? 'Курс PEPE фиксируется при создании счёта. Отправляйте только точную сумму, указанную FaucetPay.' : 'Your PEPE quote is locked when the invoice is created. Send only the exact amount shown by FaucetPay.'}
              </p>
            </section>
          </form>

          <aside aria-labelledby="deposit-summary-title" className="flex flex-col gap-5 rounded-[28px] border border-white/10 bg-[#111a35] p-5 text-white shadow-xl shadow-black/10 sm:p-6 lg:sticky lg:top-6 lg:self-start">
            <h2 id="deposit-summary-title" className="text-base font-black">{isRussian ? 'Итог платежа' : 'Payment summary'}</h2>
            <dl className="flex flex-col gap-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">{isRussian ? 'Платёжный шлюз' : 'Gateway'}</dt>
                <dd className="text-right font-extrabold text-emerald-100">FaucetPay (PEPE)</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">{isRussian ? 'Комиссия сайта' : 'Site fee'}</dt>
                <dd className="rounded-full border border-emerald-200/20 bg-emerald-200/[0.07] px-2.5 py-1 text-[10px] font-extrabold text-emerald-100">{isRussian ? '0% · бесплатно' : '0% · free'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">{isRussian ? 'Курс PEPE / USD' : 'PEPE / USD rate'}</dt>
                <dd className="flex items-center gap-2 font-mono font-bold text-slate-200">
                  {quote.data?.pepeUsd ? `$${quote.data.pepeUsd.toPrecision(6)}` : '—'}
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={isRussian ? 'Обновить курс' : 'Refresh exchange rate'} disabled={quote.isValidating} onClick={() => void quote.mutate()} className="text-emerald-100 hover:bg-emerald-200/10 hover:text-white">
                    {quote.isLoading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
                  </Button>
                </dd>
              </div>
            </dl>
            <Separator className="bg-white/10" />
            <div className="rounded-[20px] border border-emerald-200/10 bg-[#0d1531] p-4 text-center">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{isRussian ? 'Итого к оплате' : 'Total to pay'}</p>
              <p className="mt-2 font-mono text-3xl font-black tracking-tight text-emerald-100">{amountNumber === null ? '—' : formatUsd(amountNumber.toFixed(2), language)}</p>
              <p id="advertiser-deposit-estimate" className="mt-2 text-xs text-slate-400">{isRussian ? 'Примерно' : 'Estimated'} <strong className="font-mono text-white">{estimatedPepe ?? '—'} PEPE</strong></p>
            </div>
            <Button form="advertiser-deposit-form" type="submit" size="lg" disabled={!quote.data?.pepeUsd || parsedCents === null || isMutating} className="min-h-12 w-full rounded-[16px] bg-gradient-to-r from-[#7ce9cc] via-[#b5f0a1] to-[#ffd166] text-sm font-black text-[#1a2b3e] shadow-[0_5px_0_rgba(68,99,75,0.35)] transition hover:-translate-y-0.5 hover:saturate-125 hover:shadow-[0_7px_0_rgba(68,99,75,0.3)] disabled:hover:translate-y-0">
              {isMutating ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Wallet data-icon="inline-start" />}
              {isMutating ? isRussian ? 'Переходим к оплате…' : 'Redirecting to payment…' : isRussian ? 'Оплатить' : 'Pay'}
            </Button>
            <div className="flex flex-col gap-2 text-[10px] leading-5 text-slate-400">
              <p className="flex items-center gap-2"><BadgeCheck size={14} className="text-emerald-200" aria-hidden="true" />{isRussian ? 'Безопасный платёж через FaucetPay' : 'Secure checkout through FaucetPay'}</p>
              <p className="flex items-center gap-2"><Sparkles size={14} className="text-amber-200" aria-hidden="true" />{isRussian ? 'Зачисление после подтверждения платежа' : 'Credited after payment confirmation'}</p>
            </div>
          </aside>
          </div>
        ) : (
          <CwalletPaymentPanel
            isRussian={isRussian}
            language={language}
            onPay={(amount) => { void handleCwalletPayment(amount) }}
            isPending={isMutating}
            pendingAmount={pendingCwalletAmount}
          />
        )}

        {feedback && <Alert role={feedback.type === 'error' ? 'alert' : 'status'} className={cn('items-start rounded-2xl px-4 py-3 text-sm font-semibold leading-6', feedback.type === 'error' ? 'border-rose-300/20 bg-rose-300/[0.08] text-rose-100' : 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100')}>
          {feedback.type === 'error' ? <CircleAlert /> : <BadgeCheck />}<AlertDescription className="text-sm font-semibold leading-6 text-current">{feedback.message}</AlertDescription>
        </Alert>}
      </section>

      <section aria-labelledby="deposit-history-title" className="rounded-[28px] border border-white/10 bg-[#111a35] p-5 text-white shadow-xl shadow-black/10 sm:p-6">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-emerald-200/15 bg-emerald-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">{isRussian ? 'Платежи' : 'Payments'}</p>
            <h2 id="deposit-history-title" className="mt-2 text-xl font-black tracking-tight text-white">{isRussian ? 'История пополнений' : 'Top-up history'}</h2>
          </div>
          {deposits.isLoading && <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400"><LoaderCircle size={16} className="animate-spin" />{isRussian ? 'Загрузка' : 'Loading'}</span>}
        </header>
        {deposits.error && <p role="alert" className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-100">{deposits.error.message}</p>}
        {deposits.data?.deposits.length ? <ul className="flex flex-col gap-3">
          {deposits.data.deposits.map((deposit) => <li key={deposit.id} className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-[#0d1531] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-sm font-black text-white">{deposit.provider === 'cwallet' ? 'Cwallet' : 'FaucetPay'} · {formatUsd(deposit.amountUsd, language)} · {formatAtomic(deposit.amountAtomic, language)} PEPE</p>
              <p className="mt-1 truncate font-mono text-xs text-slate-400">{new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(deposit.createdAt))} · {deposit.id}</p>
            </div>
            <div className="self-start sm:self-auto">
              <Badge variant="outline" className={cn('h-8 rounded-full px-3 text-xs font-extrabold', statusClasses(deposit.status))}>{statusLabel(deposit.status, isRussian, deposit.provider)}</Badge>
            </div>
          </li>)}
        </ul> : !deposits.isLoading && <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0d1531] px-4 py-10 text-center text-sm leading-6 text-slate-400">{isRussian ? 'Пополнений пока нет. Минимальная сумма — $0.50.' : 'No top-ups yet. The minimum amount is $0.50.'}</div>}
      </section>
    </main>
  )
}
