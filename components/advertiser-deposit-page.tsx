'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { BadgeCheck, CircleAlert, Clock3, ExternalLink, LoaderCircle, RefreshCw, Wallet } from 'lucide-react'
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
  return cents >= 500n ? cents : null
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
  if (status === 'paid') return 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100'
  if (status === 'underpaid' || status === 'review') return 'border-amber-200/20 bg-amber-300/10 text-amber-100'
  return 'border-cyan-200/20 bg-cyan-300/10 text-cyan-100'
}

export function AdvertiserDepositPage() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [amountUsd, setAmountUsd] = useState('5.00')
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
  const minimumPepe = quote.data?.pepeUsd ? estimatePepe(5, quote.data.pepeUsd, language) : null
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
    <main className="space-y-5">
      <section aria-labelledby="advertiser-deposit-title" className="relative overflow-hidden rounded-[26px] border border-cyan-200/15 bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-br from-cyan-400/[0.09] via-indigo-400/[0.05] to-transparent" />
        <header className="relative flex flex-col gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl border border-cyan-200/15 bg-cyan-300/10 text-cyan-100"><Wallet size={20} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/75">{isRussian ? 'Рекламный кошелёк' : 'Advertiser wallet'}</p>
              <h1 id="advertiser-deposit-title" className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">{isRussian ? 'Пополнить баланс' : 'Add funds'}</h1>
              <p className="mt-1 max-w-2xl text-[10px] leading-5 text-slate-300 sm:text-xs">{isRussian ? 'Оплата через FaucetPay в PEPE. Зачисление выполняется только после серверного подтверждения транзакции.' : 'Pay in PEPE through FaucetPay. Funds are credited only after server-side payment verification.'}</p>
            </div>
          </div>
          <Badge variant="outline" className="h-8 w-fit gap-2 rounded-full border-emerald-200/15 bg-emerald-300/[0.07] px-3 text-[10px] font-extrabold text-emerald-100"><BadgeCheck data-icon="inline-start" />FaucetPay · PEPE</Badge>
        </header>

        <div className="relative mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]">
          <form onSubmit={handleCreatePayment} className="flex flex-col gap-4 rounded-[22px] border border-white/[0.07] bg-[#111a35]/85 p-4 sm:p-5">
            <FieldGroup className="gap-2">
              <Field data-invalid={amountUsd.length > 0 && parsedCents === null}>
                <FieldLabel htmlFor="advertiser-deposit-usd" className="text-xs font-extrabold text-slate-100">{isRussian ? 'Сумма пополнения, USD' : 'Top-up amount, USD'}</FieldLabel>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-xl font-black text-slate-400">$</span>
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
                    placeholder="5.00"
                    aria-describedby="advertiser-deposit-minimum advertiser-deposit-estimate"
                    aria-invalid={amountUsd.length > 0 && parsedCents === null}
                    className="h-[4.25rem] rounded-[18px] border-white/10 bg-[#141e3d] pl-10 pr-4 font-mono text-2xl font-black tracking-tight text-white placeholder:text-slate-500 focus-visible:border-cyan-200/60 focus-visible:ring-cyan-200/10"
                  />
                </div>
                <FieldDescription id="advertiser-deposit-minimum" className="text-[10px] leading-5 text-slate-400">{isRussian ? <>Минимум — <strong className="font-mono text-white">$5.00</strong>{minimumPepe ? <> · примерно <strong className="font-mono text-cyan-100">{minimumPepe} PEPE</strong></> : null}</> : <>Minimum <strong className="font-mono text-white">$5.00</strong>{minimumPepe ? <> · about <strong className="font-mono text-cyan-100">{minimumPepe} PEPE</strong></> : null}</>}</FieldDescription>
              </Field>
            </FieldGroup>

            <div id="advertiser-deposit-estimate" className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-200/10 bg-cyan-300/[0.045] p-3.5">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-cyan-100/70">{isRussian ? 'К оплате в FaucetPay' : 'FaucetPay amount'}</p>
                <p className="mt-1 font-mono text-lg font-black text-white">{estimatedPepe ?? '—'} <span className="text-xs text-cyan-100">PEPE</span></p>
              </div>
              <TokenLogo symbol="PEPE" size={28} />
            </div>

            <Button type="submit" size="lg" disabled={!quote.data?.pepeUsd || parsedCents === null || isMutating} className="min-h-12 w-full rounded-[16px] text-xs font-black">
              {isMutating ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Wallet data-icon="inline-start" />}
              {isMutating ? isRussian ? 'Создаём счёт…' : 'Creating invoice…' : isRussian ? 'Создать счёт FaucetPay' : 'Create FaucetPay invoice'}
            </Button>
            <p className="flex items-start gap-2 text-[10px] leading-5 text-slate-400"><BadgeCheck size={14} className="mt-0.5 shrink-0 text-emerald-200" />{isRussian ? 'Курс PEPE фиксируется при создании счёта. Не отправляйте сумму, отличную от указанной FaucetPay.' : 'The PEPE quote is locked when the invoice is created. Pay the exact amount shown by FaucetPay.'}</p>
          </form>

          <aside className="flex flex-col gap-3 rounded-[22px] border border-white/[0.07] bg-gradient-to-br from-[#152347] to-[#121a34] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{isRussian ? 'Курс PEPE / USD' : 'PEPE / USD rate'}</p>
                <p className="mt-1 font-mono text-xl font-black text-white">{quote.data?.pepeUsd ? `$${quote.data.pepeUsd.toPrecision(6)}` : '—'}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.07] text-cyan-100">{quote.isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}</span>
            </div>
            <div className="h-px bg-white/[0.07]" />
            <dl className="grid grid-cols-2 gap-3 text-[10px]">
              <div><dt className="text-slate-400">{isRussian ? 'Источник' : 'Source'}</dt><dd className="mt-1 font-bold text-slate-100">{quote.data?.source ?? 'DEX Screener'}</dd></div>
              <div><dt className="text-slate-400">{isRussian ? 'Сеть курса' : 'Quote network'}</dt><dd className="mt-1 font-bold text-slate-100">{quote.data?.network ?? 'Ethereum'}</dd></div>
            </dl>
            <p className="text-[10px] leading-5 text-slate-400">{isRussian ? 'Эквивалент в PEPE рассчитывается по ликвидной рыночной паре и округляется вверх до 8 знаков после запятой.' : 'The PEPE equivalent uses the most liquid market pair and rounds up to 8 decimal places.'}</p>
          </aside>
        </div>

        {feedback && <Alert role={feedback.type === 'error' ? 'alert' : 'status'} className={`relative mt-4 items-start rounded-xl px-3.5 py-3 text-[10px] font-semibold leading-5 ${feedback.type === 'error' ? 'border-rose-200/15 bg-rose-300/[0.06] text-rose-100' : 'border-emerald-200/15 bg-emerald-300/[0.06] text-emerald-100'}`}>
          {feedback.type === 'error' ? <CircleAlert /> : <BadgeCheck />}<AlertDescription className="text-[10px] font-semibold leading-5 text-current">{feedback.message}</AlertDescription>
        </Alert>}

        {selectedDeposit && <section aria-labelledby="active-deposit-title" className="relative mt-5 rounded-[22px] border border-cyan-200/15 bg-[#101a35]/90 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{isRussian ? 'Текущий счёт' : 'Selected invoice'}</p>
              <h2 id="active-deposit-title" className="mt-1 text-sm font-black text-white">{formatUsd(selectedDeposit.amountUsd, language)} · {formatAtomic(selectedDeposit.amountAtomic, language)} PEPE</h2>
              <p className="mt-1 break-all font-mono text-[9px] text-slate-500">{selectedDeposit.id}</p>
            </div>
            <Badge variant="outline" className={`h-6 w-fit gap-1.5 rounded-full px-2.5 text-[9px] font-extrabold ${statusClasses(selectedDeposit.status)}`}>
              {selectedDeposit.status === 'paid' ? <BadgeCheck data-icon="inline-start" /> : selectedDeposit.status === 'pending' ? <Clock3 data-icon="inline-start" /> : <CircleAlert data-icon="inline-start" />}{statusLabel(selectedDeposit.status, isRussian)}
            </Badge>
          </div>

          {selectedDeposit.status === 'pending' && selectedCheckout && <form action={selectedCheckout.actionUrl} method="post" target="_blank" rel="noopener noreferrer" className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="merchant_username" value={selectedCheckout.merchantUsername} />
            <input type="hidden" name="item_description" value={selectedCheckout.itemDescription} />
            <input type="hidden" name="amount1" value={selectedCheckout.amount1} />
            <input type="hidden" name="currency1" value={selectedCheckout.currency1} />
            <input type="hidden" name="custom" value={selectedCheckout.custom} />
            <input type="hidden" name="callback_url" value={selectedCheckout.callbackUrl} />
            <input type="hidden" name="success_url" value={selectedCheckout.successUrl} />
            <input type="hidden" name="cancel_url" value={selectedCheckout.cancelUrl} />
            <p className="max-w-lg text-[10px] leading-5 text-slate-400">{isRussian ? 'После оплаты вернитесь на эту страницу. Статус обновляется автоматически после проверки FaucetPay.' : 'Return to this page after checkout. Status updates automatically after FaucetPay verification.'}</p>
            <Button type="submit" size="lg" variant="outline" className="min-h-10 shrink-0 rounded-xl border-emerald-200/20 bg-emerald-300/10 text-[10px] font-extrabold text-emerald-100 hover:bg-emerald-300/15">{isRussian ? 'Продолжить в FaucetPay' : 'Continue to FaucetPay'}<ExternalLink data-icon="inline-end" /></Button>
          </form>}

          {selectedDeposit.status === 'underpaid' && <p className="mt-3 text-[10px] leading-5 text-amber-100">{isRussian ? 'Подтверждённая сумма ниже суммы счёта и не зачислена. Обратитесь в поддержку, указав ID счёта.' : 'The verified payment was below the invoice amount and was not credited. Contact support with this invoice ID.'}</p>}
          {selectedDeposit.status === 'review' && <p className="mt-3 text-[10px] leading-5 text-amber-100">{isRussian ? 'Платёж подтверждён, но его нельзя автоматически зачислить. Обратитесь в поддержку с ID счёта.' : 'The payment is verified but could not be credited automatically. Contact support with this invoice ID.'}</p>}
          {selectedDeposit.status === 'paid' && <p className="mt-3 text-[10px] leading-5 text-emerald-100">{isRussian ? 'PEPE зачислены в рекламный кошелёк.' : 'PEPE has been credited to your advertiser wallet.'}</p>}
        </section>}
      </section>

      <section aria-labelledby="deposit-history-title" className="rounded-[26px] border border-white/[0.07] bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/75">{isRussian ? 'Платежи' : 'Payments'}</p>
            <h2 id="deposit-history-title" className="mt-1 text-base font-black text-white">{isRussian ? 'История пополнений' : 'Top-up history'}</h2>
          </div>
          {deposits.isLoading && <span role="status" className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-slate-400"><LoaderCircle size={13} className="animate-spin" />{isRussian ? 'Загрузка' : 'Loading'}</span>}
        </header>
        {deposits.error && <p role="alert" className="mb-3 rounded-xl border border-rose-200/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100">{deposits.error.message}</p>}
        {deposits.data?.deposits.length ? <ul className="flex flex-col gap-2">
          {deposits.data.deposits.map((deposit) => <li key={deposit.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs font-extrabold text-white">{formatUsd(deposit.amountUsd, language)} · {formatAtomic(deposit.amountAtomic, language)} PEPE</p>
              <p className="mt-1 truncate font-mono text-[9px] text-slate-500">{new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(deposit.createdAt))} · {deposit.id}</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge variant="outline" className={`h-6 rounded-full px-2.5 text-[8px] font-extrabold ${statusClasses(deposit.status)}`}>{statusLabel(deposit.status, isRussian)}</Badge>
              {deposit.status === 'pending' && <button type="button" onClick={() => selectDeposit(deposit)} className="min-h-7 rounded-lg border border-white/10 px-2 text-[8px] font-bold text-slate-200 transition hover:bg-white/[0.06]">{isRussian ? 'Открыть' : 'Open'}</button>}
            </div>
          </li>)}
        </ul> : !deposits.isLoading && <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-[10px] leading-5 text-slate-400">{isRussian ? 'Пополнений пока нет. Минимальная сумма — $5.00.' : 'No top-ups yet. The minimum amount is $5.00.'}</div>}
      </section>
    </main>
  )
}
