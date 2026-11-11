'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import {
  ArrowDownUp,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  LoaderCircle,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import { LocalizedTree, useSiteLanguage } from '@/components/site-language-provider'
import { TokenLogo } from '@/components/token-logo'
import { YoutubeCampaignForm } from '@/components/youtube-campaign-form'
import { getYouTubeVideoId, getYouTubeWatchUrl } from '@/lib/youtube-ads'
import {
  CAMPAIGN_COMMISSION_ATOMIC,
  CAMPAIGN_COMMISSION_PEPE,
  CAMPAIGN_DURATION_SECONDS,
  CAMPAIGN_PROMOTION_DURATION_HOURS,
  CAMPAIGN_PROMOTION_FEE_ATOMIC,
  CAMPAIGN_PROMOTION_FEE_PEPE,
  CAMPAIGN_REWARD_HOMERO,
  CAMPAIGN_REWARD_HOMERO_ATOMIC,
  getYouTubeCampaignPricing,
  YOUTUBE_CAMPAIGN_MAX_TASKS,
  parsePepeAmountToAtomic,
} from '@/lib/pepe-amount'

type CampaignStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type AdvertiserPageView = 'overview' | 'fund' | 'create' | 'campaigns' | 'activity'

type AdvertiserCampaign = {
  id: string
  campaignType: 'ptc' | 'youtube'
  title: string
  description: string
  targetUrl: string
  rewardPerTaskAtomic: number
  commissionPerTaskAtomic: number
  commissionCollectedAtomic: number
  promotionFeeAtomic: number
  promotionStartedAt: string | null
  promotionExpiresAt: string | null
  totalBudgetAtomic: number
  totalTasks: number
  remainingTasks: number
  durationSeconds: number
  status: CampaignStatus
  createdAt: string
  updatedAt: string
}

type AdvertiserWalletActivity = {
  id: string
  source: string
  amountAtomic: string
  createdAt: string
}

type AdvertiserWalletSnapshot = {
  publisherBalanceAtomic: string
  advertiserBalanceAtomic: string
  activity: AdvertiserWalletActivity[]
}

type CampaignSnapshot = {
  balanceAtomic: string
  campaigns: AdvertiserCampaign[]
}

type ApiErrorResponse = { error?: string }
type CampaignPayload = {
  campaignId: string
  campaignType: 'ptc' | 'youtube'
  title: string
  description: string
  targetUrl: string
  totalTasks: number
  promote: boolean
  durationSeconds?: 30 | 60
}
type CampaignActionPayload = { campaignId: string; status: CampaignStatus }

const atomicUnitsPerPepe = 100_000_000n
const perTaskCostAtomic = BigInt(CAMPAIGN_REWARD_HOMERO_ATOMIC) + BigInt(CAMPAIGN_COMMISSION_ATOMIC)

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json().catch(() => null) as ApiErrorResponse | null
  if (!response.ok) throw new Error(result?.error ?? 'Could not load advertiser data.')
  return result as T
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null) as ApiErrorResponse | null
  if (!response.ok) throw new Error(result?.error ?? 'The request could not be completed.')
  return result as T
}

async function patchJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null) as ApiErrorResponse | null
  if (!response.ok) throw new Error(result?.error ?? 'The campaign could not be updated.')
  return result as T
}

function formatAtomic(value: string | number | bigint, language: 'en' | 'ru') {
  let amount: bigint
  try {
    amount = BigInt(value)
  } catch {
    amount = 0n
  }
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const whole = absolute / atomicUnitsPerPepe
  const fraction = (absolute % atomicUnitsPerPepe).toString().padStart(8, '0').replace(/0+$/, '')
  const integer = new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(whole)
  return `${negative ? '−' : ''}${integer}${fraction ? `${language === 'ru' ? ',' : '.'}${fraction}` : ''}`
}

function formatDate(value: string, language: 'en' | 'ru') {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getCampaignCostAtomic(totalTasks: number, promote: boolean) {
  if (!Number.isSafeInteger(totalTasks) || totalTasks < 1 || totalTasks > 100_000) return 0n
  return perTaskCostAtomic * BigInt(totalTasks) + (promote ? BigInt(CAMPAIGN_PROMOTION_FEE_ATOMIC) : 0n)
}

function getStatusLabel(status: CampaignStatus, isRussian: boolean) {
  if (status === 'active') return isRussian ? 'Активна' : 'Active'
  if (status === 'paused') return isRussian ? 'Приостановлена' : 'Paused'
  if (status === 'completed') return isRussian ? 'Завершена' : 'Completed'
  return isRussian ? 'Отменена' : 'Cancelled'
}

function getActivityLabel(source: string, isRussian: boolean) {
  const labels: Record<string, { en: string; ru: string }> = {
    advertiser_wallet_transfer_in: { en: 'Funds received from Publisher', ru: 'Средства получены с Publisher' },
    advertiser_wallet_campaign_charge: { en: 'Campaign budget reserved', ru: 'Зарезервирован бюджет кампании' },
    advertiser_wallet_campaign_refund: { en: 'Unused campaign budget returned', ru: 'Возвращён неиспользованный бюджет' },
    advertiser_wallet_promotion_charge: { en: 'Pro promotion charged', ru: 'Списана оплата продвижения Pro' },
    advertiser_wallet_promotion_refund: { en: 'Unused Pro promotion refunded', ru: 'Возвращена оплата неиспользованного продвижения Pro' },
  }
  return labels[source]?.[isRussian ? 'ru' : 'en'] ?? (isRussian ? 'Операция кошелька' : 'Advertiser wallet activity')
}

function CampaignCard({
  campaign,
  language,
  busy,
  onStatusChange,
}: {
  campaign: AdvertiserCampaign
  language: 'en' | 'ru'
  busy: boolean
  onStatusChange: (campaign: AdvertiserCampaign, status: CampaignStatus) => void
}) {
  const isRussian = language === 'ru'
  const unusedBudget = (BigInt(campaign.rewardPerTaskAtomic) + BigInt(campaign.commissionPerTaskAtomic)) * BigInt(campaign.remainingTasks)
  const isPromoted = Boolean(campaign.promotionExpiresAt && Date.parse(campaign.promotionExpiresAt) > Date.now())
  const safeTargetUrl = (() => {
    try {
      const target = new URL(campaign.targetUrl)
      return target.protocol === 'https:' ? target.toString() : null
    } catch {
      return null
    }
  })()
  const statusClasses = campaign.status === 'active'
    ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
    : campaign.status === 'paused'
      ? 'border-amber-300/20 bg-amber-400/10 text-amber-200'
      : campaign.status === 'completed'
        ? 'border-blue-300/20 bg-blue-400/10 text-blue-200'
        : 'border-slate-300/15 bg-slate-400/10 text-slate-300'

  return (
    <article className="rounded-[24px] border border-white/10 bg-[#111a35] p-4 shadow-lg shadow-black/10 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-extrabold ${statusClasses}`}>{getStatusLabel(campaign.status, isRussian)}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-extrabold ${campaign.campaignType === 'youtube' ? 'border-red-200/15 bg-red-300/[0.07] text-red-100' : 'border-cyan-200/15 bg-cyan-300/[0.07] text-cyan-100'}`}>{campaign.campaignType === 'youtube' ? 'YouTube' : 'PTC'} · {campaign.durationSeconds}s</span>
            {isPromoted && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/20 bg-amber-300/10 px-2.5 py-1 text-[9px] font-extrabold text-amber-100"><BadgeCheck size={11} />{isRussian ? 'Приоритет Pro' : 'Pro priority'}</span>}
          </div>
          <h3 className="mt-3 break-words text-base font-extrabold text-white">{campaign.title}</h3>
          {campaign.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{campaign.description}</p>}
          {safeTargetUrl && <a href={safeTargetUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[10px] font-semibold text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{safeTargetUrl}<ArrowUpRight size={12} className="shrink-0" /><span className="sr-only">{isRussian ? 'Откроется в новой вкладке' : 'opens in a new tab'}</span></a>}
        </div>
        <p className="shrink-0 text-[10px] text-slate-400">{formatDate(campaign.createdAt, language)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <dt className="text-[9px] text-slate-400">{isRussian ? 'Награда / просмотр' : 'Reward per view'}</dt>
          <dd className="mt-1 font-mono text-xs font-extrabold text-white">{formatAtomic(campaign.rewardPerTaskAtomic, language)} {campaign.campaignType === 'youtube' ? 'PEPE' : 'HOMERO'}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <dt className="text-[9px] text-slate-400">{isRussian ? 'Комиссия / просмотр' : 'Commission per view'}</dt>
          <dd className="mt-1 font-mono text-xs font-extrabold text-white">{formatAtomic(campaign.commissionPerTaskAtomic, language)} PEPE</dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <dt className="text-[9px] text-slate-400">{isRussian ? 'Заданий осталось' : 'Tasks remaining'}</dt>
          <dd className="mt-1 font-mono text-xs font-extrabold text-white">{campaign.remainingTasks.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')} / {campaign.totalTasks.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <dt className="text-[9px] text-slate-400">{isRussian ? 'Резерв бюджета' : 'Reserved budget'}</dt>
          <dd className="mt-1 font-mono text-xs font-extrabold text-white">{formatAtomic(unusedBudget, language)} PEPE</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <p className="text-[10px] text-slate-400">{isRussian ? 'Комиссия начислена:' : 'Commission earned:'} <span className="font-mono font-bold text-slate-200">{formatAtomic(campaign.commissionCollectedAtomic, language)} PEPE</span></p>
        {(campaign.status === 'active' || campaign.status === 'paused') && <div className="flex flex-wrap gap-2">
          {campaign.status === 'active'
            ? <button type="button" disabled={busy} onClick={() => onStatusChange(campaign, 'paused')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"><Pause size={12} />{isRussian ? 'Пауза' : 'Pause'}</button>
            : <button type="button" disabled={busy} onClick={() => onStatusChange(campaign, 'active')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"><Play size={12} />{isRussian ? 'Возобновить' : 'Resume'}</button>}
          <button type="button" disabled={busy} onClick={() => onStatusChange(campaign, 'cancelled')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-300/20 bg-rose-400/[0.06] px-3 text-[10px] font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={12} />{isRussian ? 'Отменить и вернуть остаток' : 'Cancel and refund'}</button>
        </div>}
      </div>
    </article>
  )
}

export function AdvertiserPage({ view = 'overview' }: { view?: AdvertiserPageView }) {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const wallet = useSWR<AdvertiserWalletSnapshot>('/api/advertiser/wallet', getJson, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const campaigns = useSWR<CampaignSnapshot>('/api/advertiser/campaigns', getJson, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const pepeQuote = useSWR<{ pepeUsd: number }>('/api/pepe-price', getJson, { refreshInterval: 60_000, revalidateOnFocus: true })
  const { trigger: transferFunds, isMutating: transferring } = useSWRMutation<AdvertiserWalletSnapshot, Error, string, { amount: string; transferId: string }>(
    '/api/advertiser/wallet/transfer',
    (_key, { arg }) => postJson<AdvertiserWalletSnapshot>('/api/advertiser/wallet', arg),
  )
  const { trigger: createCampaign, isMutating: creatingCampaign } = useSWRMutation<{ campaign: AdvertiserCampaign; balanceAtomic: string }, Error, string, CampaignPayload>(
    '/api/advertiser/campaigns/create',
    (url, { arg }) => postJson<{ campaign: AdvertiserCampaign; balanceAtomic: string }>(url.replace('/create', ''), arg),
  )
  const { trigger: updateCampaign, isMutating: updatingCampaign } = useSWRMutation<{ campaign: AdvertiserCampaign; refundAtomic: number; promotionRefundAtomic: number }, Error, string, CampaignActionPayload>(
    '/api/advertiser/campaigns/update',
    (_key, { arg }) => patchJson(`/api/advertiser/campaigns/${encodeURIComponent(arg.campaignId)}`, { status: arg.status }),
  )

  const [transferAmount, setTransferAmount] = useState('')
  const [title, setTitle] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [description, setDescription] = useState('')
  const [taskCount, setTaskCount] = useState('1')
  const [promote, setPromote] = useState(false)
  const [youtubeTitle, setYoutubeTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeDescription, setYoutubeDescription] = useState('')
  const [youtubeTaskCount, setYoutubeTaskCount] = useState('1')
  const [youtubeDuration, setYoutubeDuration] = useState<30 | 60>(30)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null)
  const transferIdRef = useRef<{ amount: string; id: string } | null>(null)
  const campaignIdRef = useRef<{ signature: string; id: string } | null>(null)

  const publisherBalanceAtomic = BigInt(wallet.data?.publisherBalanceAtomic ?? '0')
  const advertiserBalanceAtomic = BigInt(campaigns.data?.balanceAtomic ?? wallet.data?.advertiserBalanceAtomic ?? '0')
  const parsedTransferAmount = parsePepeAmountToAtomic(transferAmount)
  const isTransferAmountAvailable = parsedTransferAmount !== null && BigInt(parsedTransferAmount) <= publisherBalanceAtomic
  const parsedTaskCount = /^\d+$/.test(taskCount) ? Number(taskCount) : 0
  const isTaskCountValid = Number.isSafeInteger(parsedTaskCount) && parsedTaskCount >= 1 && parsedTaskCount <= 100_000
  const campaignCostAtomic = getCampaignCostAtomic(parsedTaskCount, promote)
  const hasEnoughCampaignFunds = campaignCostAtomic > 0n && advertiserBalanceAtomic >= campaignCostAtomic
  const parsedYoutubeTaskCount = /^\d+$/.test(youtubeTaskCount) ? Number(youtubeTaskCount) : 0
  const isYoutubeTaskCountValid = Number.isSafeInteger(parsedYoutubeTaskCount) && parsedYoutubeTaskCount >= 1 && parsedYoutubeTaskCount <= YOUTUBE_CAMPAIGN_MAX_TASKS
  const youtubePricing = getYouTubeCampaignPricing(youtubeDuration)
  const youtubeRewardAtomic = BigInt(youtubePricing.rewardAtomic)
  const youtubeCommissionAtomic = BigInt(youtubePricing.commissionAtomic)
  const youtubeCostPerTaskAtomic = youtubeRewardAtomic + youtubeCommissionAtomic
  const youtubeCampaignCostAtomic = isYoutubeTaskCountValid ? youtubeCostPerTaskAtomic * BigInt(parsedYoutubeTaskCount) : 0n
  function formatUsdEstimate(amountAtomic: bigint) {
    const price = pepeQuote.data?.pepeUsd
    if (!price || !Number.isFinite(price)) return null
    return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(amountAtomic) / Number(atomicUnitsPerPepe) * price)
  }

  const hasEnoughYoutubeFunds = youtubeCampaignCostAtomic > 0n && advertiserBalanceAtomic >= youtubeCampaignCostAtomic
  const hasCampaignsData = Boolean(campaigns.data && wallet.data)
  const pageTitle = isRussian
    ? { overview: 'Кабинет рекламодателя', fund: 'Пополнение кошелька', create: 'Создать кампанию', campaigns: 'Рекламные кампании', activity: 'Операции кошелька' }[view]
    : { overview: 'Advertiser workspace', fund: 'Fund wallet', create: 'Create campaign', campaigns: 'Advertiser campaigns', activity: 'Wallet activity' }[view]

  async function refreshBalances() {
    await Promise.all([wallet.mutate(), campaigns.mutate()])
  }

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (!wallet.data || parsedTransferAmount === null) return
    if (!isTransferAmountAvailable) {
      setFeedback({ type: 'error', message: isRussian ? 'Сумма превышает доступный баланс Publisher.' : 'Amount is greater than your available Publisher balance.' })
      return
    }

    const amount = transferAmount.trim()
    const existing = transferIdRef.current
    const transferId = existing?.amount === amount ? existing.id : crypto.randomUUID()
    transferIdRef.current = { amount, id: transferId }

    try {
      await transferFunds({ amount, transferId })
      transferIdRef.current = null
      setTransferAmount('')
      setFeedback({ type: 'success', message: isRussian ? 'PEPE переведены в рекламный кошелёк.' : 'PEPE transferred to your Advertiser wallet.' })
      void refreshBalances().catch(() => undefined)
    } catch (error) {
      setFeedback({ type: 'error', message: isRussian ? 'Не удалось перевести PEPE. Проверьте баланс и повторите ту же сумму.' : error instanceof Error ? error.message : 'Could not transfer PEPE.' })
    }
  }

  async function handleCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (!hasCampaignsData || !isTaskCountValid || !hasEnoughCampaignFunds) return

    let parsedUrl: URL
    try {
      parsedUrl = new URL(targetUrl.trim())
    } catch {
      setFeedback({ type: 'error', message: isRussian ? 'Введите корректный HTTPS-адрес.' : 'Enter a valid HTTPS URL.' })
      return
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      setFeedback({ type: 'error', message: isRussian ? 'Используйте безопасную HTTPS-ссылку без логина и пароля.' : 'Use a secure HTTPS URL without embedded credentials.' })
      return
    }
    if (title.trim().length < 3 || title.trim().length > 80) {
      setFeedback({ type: 'error', message: isRussian ? 'Название должно содержать от 3 до 80 символов.' : 'The title must be between 3 and 80 characters.' })
      return
    }
    if (description.trim().length > 500) {
      setFeedback({ type: 'error', message: isRussian ? 'Описание должно содержать не более 500 символов.' : 'The description must be 500 characters or fewer.' })
      return
    }

    const payload = {
      campaignType: 'ptc' as const,
      title: title.trim(),
      targetUrl: parsedUrl.toString(),
      description: description.trim(),
      totalTasks: parsedTaskCount,
      promote,
    }
    const signature = JSON.stringify(payload)
    const existing = campaignIdRef.current
    const campaignId = existing?.signature === signature ? existing.id : crypto.randomUUID()
    campaignIdRef.current = { signature, id: campaignId }

    try {
      await createCampaign({ ...payload, campaignId })
      campaignIdRef.current = null
      setTitle('')
      setTargetUrl('')
      setDescription('')
      setTaskCount('1')
      setPromote(false)
      setFeedback({ type: 'success', message: isRussian ? 'Кампания запущена и появилась в заданиях «Просмотр рекламы».' : 'Campaign launched and added to View Ads tasks.' })
      void refreshBalances().catch(() => undefined)
    } catch (error) {
      setFeedback({ type: 'error', message: isRussian ? 'Не удалось запустить кампанию. Проверьте данные и баланс рекламного кошелька.' : error instanceof Error ? error.message : 'Could not launch the campaign.' })
    }
  }

  async function handleCreateYoutubeCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (!hasCampaignsData || !isYoutubeTaskCountValid || !hasEnoughYoutubeFunds) return

    const videoId = getYouTubeVideoId(youtubeUrl.trim())
    if (!videoId) {
      setFeedback({ type: 'error', message: isRussian ? 'Введите действительную HTTPS-ссылку на видео YouTube.' : 'Enter a valid HTTPS YouTube video URL.' })
      return
    }
    if (youtubeTitle.trim().length < 3 || youtubeTitle.trim().length > 80 || youtubeDescription.trim().length > 500) {
      setFeedback({ type: 'error', message: isRussian ? 'Проверьте название и описание кампании.' : 'Check the campaign title and description.' })
      return
    }

    const payload = {
      campaignType: 'youtube' as const,
      title: youtubeTitle.trim(),
      targetUrl: getYouTubeWatchUrl(videoId),
      description: youtubeDescription.trim(),
      totalTasks: parsedYoutubeTaskCount,
      durationSeconds: youtubeDuration,
      promote: false,
    }
    const signature = JSON.stringify(payload)
    const existing = campaignIdRef.current
    const campaignId = existing?.signature === signature ? existing.id : crypto.randomUUID()
    campaignIdRef.current = { signature, id: campaignId }

    try {
      await createCampaign({ ...payload, campaignId })
      campaignIdRef.current = null
      setYoutubeTitle('')
      setYoutubeUrl('')
      setYoutubeDescription('')
      setYoutubeTaskCount('1')
      setFeedback({ type: 'success', message: isRussian ? 'YouTube-кампания запущена. Каждый пользователь сможет выполнить только одну кампанию вашего аккаунта.' : 'YouTube campaign launched. Each user can complete only one campaign from your account.' })
      void refreshBalances().catch(() => undefined)
    } catch (error) {
      setFeedback({ type: 'error', message: isRussian ? 'Не удалось запустить YouTube-кампанию. Проверьте данные и баланс.' : error instanceof Error ? error.message : 'Could not launch the YouTube campaign.' })
    }
  }

  async function handleCampaignStatusChange(campaign: AdvertiserCampaign, status: CampaignStatus) {
    if (status === 'cancelled') {
      const confirmed = window.confirm(isRussian
        ? 'Отменить кампанию и вернуть неиспользованный бюджет заданий и оставшееся время продвижения?'
        : 'Cancel this campaign and refund unused task budget and remaining promotion time?')
      if (!confirmed) return
    }

    setFeedback(null)
    setBusyCampaignId(campaign.id)
    try {
      const result = await updateCampaign({ campaignId: campaign.id, status })
      const message = status === 'cancelled'
        ? isRussian
          ? `Кампания отменена. Возвращено ${formatAtomic(result.refundAtomic, language)} PEPE${result.promotionRefundAtomic > 0 ? ` и ${formatAtomic(result.promotionRefundAtomic, language)} PEPE за продвижение` : ''}.`
          : `Campaign cancelled. Refunded ${formatAtomic(result.refundAtomic, language)} PEPE${result.promotionRefundAtomic > 0 ? ` plus ${formatAtomic(result.promotionRefundAtomic, language)} PEPE for promotion` : ''}.`
        : status === 'paused'
          ? isRussian ? 'Кампания приостановлена.' : 'Campaign paused.'
          : isRussian ? 'Кампания возобновлена.' : 'Campaign resumed.'
      setFeedback({ type: 'success', message })
      void refreshBalances().catch(() => undefined)
    } catch (error) {
      setFeedback({ type: 'error', message: isRussian ? 'Не удалось обновить кампанию.' : error instanceof Error ? error.message : 'Could not update the campaign.' })
    } finally {
      setBusyCampaignId(null)
    }
  }

  const loadingError = wallet.error ?? campaigns.error
  const activity = wallet.data?.activity ?? []

  return (
    <LocalizedTree>
      <main id="top" className="dashboard-page-shell flex flex-col gap-5 sm:gap-6">
        <header className="relative isolate overflow-hidden rounded-[30px] border border-cyan-200/15 bg-gradient-to-br from-[#132e50] via-[#1b2750] to-[#321f50] p-5 text-white shadow-xl shadow-indigo-950/20 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border-[24px] border-white/[0.05]" />
          <div className="relative flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"><Megaphone size={22} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/75">{isRussian ? 'рекламные кампании' : 'campaign management'}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{pageTitle}</h1>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-blue-50/75">{isRussian ? 'Создавайте и управляйте PTC- и YouTube-кампаниями' : 'Create and manage PTC and YouTube campaigns'}. {isRussian ? `PTC-просмотр длится ${CAMPAIGN_DURATION_SECONDS} секунд и приносит ${CAMPAIGN_REWARD_HOMERO} HOMERO. YouTube: награда 950 PEPE + комиссия 380 PEPE за 30 секунд; 1 900 + 760 PEPE за 60 секунд.` : `PTC views last ${CAMPAIGN_DURATION_SECONDS} seconds and pay ${CAMPAIGN_REWARD_HOMERO} HOMERO. YouTube rewards are 950 PEPE plus a 380 PEPE commission for 30 seconds, or 1,900 plus 760 PEPE for 60 seconds.`}</p>
            </div>
          </div>
        </header>

        {loadingError && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs font-semibold text-rose-200"><CircleAlert size={15} className="mt-0.5 shrink-0" />{isRussian ? 'Не удалось загрузить данные рекламодателя. Обновите страницу и попробуйте снова.' : loadingError.message}</div>}
        {feedback && <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold ${feedback.type === 'error' ? 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200'}`}>
          {feedback.type === 'error' ? <CircleAlert size={15} className="mt-0.5 shrink-0" /> : <Check size={15} className="mt-0.5 shrink-0" />}{feedback.message}
        </div>}

        {view === 'overview' && <section aria-label={isRussian ? 'Разделы рекламодателя' : 'Advertiser sections'} className="grid gap-4 sm:grid-cols-2">
          {[
            { href: '/advertiser/fund', title: isRussian ? 'Пополнить кошелёк' : 'Fund wallet', description: isRussian ? 'Перевод PEPE из баланса Publisher.' : 'Transfer PEPE from your Publisher balance.' },
            { href: '/advertiser/create', title: isRussian ? 'Создать кампанию' : 'Create campaign', description: isRussian ? 'Запустите PTC- или YouTube-кампанию.' : 'Launch a PTC or YouTube campaign.' },
            { href: '/advertiser/campaigns', title: isRussian ? 'Мои кампании' : 'My campaigns', description: isRussian ? `${campaigns.data?.campaigns.length ?? '—'} кампаний · управление статусом и возвратом.` : `${campaigns.data?.campaigns.length ?? '—'} campaigns · manage status and refunds.` },
            { href: '/advertiser/activity', title: isRussian ? 'Операции кошелька' : 'Wallet activity', description: isRussian ? 'История переводов, списаний и возвратов.' : 'History of transfers, charges, and refunds.' },
          ].map((item) => <Link key={item.href} href={item.href} className="group rounded-[24px] border border-white/[0.08] bg-[#0d142c] p-5 transition hover:border-cyan-200/25 hover:bg-[#111a35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-white">{item.title}</h2><ArrowUpRight size={16} className="text-cyan-200 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
            <p className="mt-2 text-[10px] leading-5 text-slate-400">{item.description}</p>
          </Link>)}
        </section>}

        {(view === 'fund' || view === 'create') && <div className="grid min-w-0 gap-4">
          {view === 'fund' && <section id="advertiser-fund" aria-labelledby="advertiser-fund-title" className="scroll-mt-20 rounded-[26px] border border-white/[0.08] bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200"><ArrowDownUp size={18} /></span>
              <div>
                <h2 id="advertiser-fund-title" className="text-sm font-extrabold text-white">{isRussian ? 'Пополнение рекламного кошелька' : 'Fund advertiser wallet'}</h2>
                <p className="mt-1 text-[10px] leading-5 text-slate-400">{isRussian ? 'Внутренний перевод PEPE из баланса Publisher без комиссии.' : 'Internal PEPE transfer from Publisher balance with no fee.'}</p>
              </div>
            </div>
            <form onSubmit={handleTransfer} className="mt-5 flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[10px]">
                <span className="text-slate-400">{isRussian ? 'Доступно для перевода' : 'Available to transfer'}</span>
                <span className="font-mono font-bold text-white">{wallet.data ? `${formatAtomic(wallet.data.publisherBalanceAtomic, language)} PEPE` : '—'}</span>
              </div>
              <label htmlFor="advertiser-transfer-amount" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Сумма перевода' : 'Transfer amount'}</label>
              <div className="flex gap-2">
                <input
                  id="advertiser-transfer-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                  placeholder="100.00"
                  disabled={!wallet.data || transferring}
                  aria-invalid={transferAmount.length > 0 && !isTransferAmountAvailable}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#111a35] px-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-50"
                />
                <span className="inline-flex items-center rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs font-extrabold text-slate-300">PEPE</span>
              </div>
              {transferAmount && parsedTransferAmount === null && <p className="text-[10px] text-rose-300">{isRussian ? 'Введите сумму до 8 знаков после запятой.' : 'Enter an amount with up to 8 decimal places.'}</p>}
              <button type="submit" disabled={!wallet.data || !isTransferAmountAvailable || transferring} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-extrabold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                {transferring ? <LoaderCircle size={15} className="animate-spin" /> : <Wallet size={15} />}{transferring ? isRussian ? 'Пополняем…' : 'Funding…' : isRussian ? 'Пополнить кошелёк' : 'Fund wallet'}
              </button>
              <p className="text-[9px] leading-4 text-slate-500">{isRussian ? 'Баланс рекламодателя отделён от Publisher. Перевод фиксируется безопасно и повторный запрос не спишет средства дважды.' : 'Advertiser funds stay separate from Publisher. Transfers are idempotent, so retrying the same request will not debit twice.'}</p>
            </form>
          </section>}

          {view === 'create' && <section id="advertiser-create" aria-labelledby="advertiser-create-title" className="scroll-mt-20 rounded-[26px] border border-cyan-200/10 bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><Plus size={18} /></span>
              <div>
                <h2 id="advertiser-create-title" className="text-sm font-extrabold text-white">{isRussian ? 'Создать PTC-кампанию' : 'Create a PTC campaign'}</h2>
                <p className="mt-1 text-[10px] leading-5 text-slate-400">{isRussian ? 'Задайте URL и количество просмотров. Награда и длительность фиксированы.' : 'Enter a destination URL and the number of views. Reward and duration are fixed.'}</p>
              </div>
            </div>

            <form onSubmit={handleCreateCampaign} className="mt-5 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <p className="text-[9px] font-bold text-slate-400">{isRussian ? 'Формат' : 'Format'}</p>
                  <p className="mt-1.5 text-xs font-extrabold text-white">PTC · {CAMPAIGN_DURATION_SECONDS}s</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <p className="text-[9px] font-bold text-slate-400">{isRussian ? 'Награда за просмотр' : 'Reward per view'}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-extrabold text-white"><TokenLogo symbol="HOMERO" size={14} />{CAMPAIGN_REWARD_HOMERO} HOMERO · {CAMPAIGN_DURATION_SECONDS}s</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="advertiser-campaign-title" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Название кампании' : 'Campaign name'}</label>
                  <input id="advertiser-campaign-title" required minLength={3} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isRussian ? 'Название объявления' : 'Campaign name'} disabled={creatingCampaign || !hasCampaignsData} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="advertiser-campaign-url" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Целевой URL · HTTPS' : 'Destination URL · HTTPS'}</label>
                  <input id="advertiser-campaign-url" type="url" required maxLength={2048} value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://example.com" disabled={creatingCampaign || !hasCampaignsData} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-50" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="advertiser-campaign-description" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Описание' : 'Description'} <span className="font-normal text-slate-500">({isRussian ? 'необязательно' : 'optional'})</span></label>
                <textarea id="advertiser-campaign-description" rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={isRussian ? 'Кратко опишите страницу для исполнителей' : 'Briefly describe what performers will see'} disabled={creatingCampaign || !hasCampaignsData} className="min-h-16 resize-y rounded-xl border border-white/10 bg-[#111a35] px-3 py-2.5 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-50" />
              </div>

              <div className="grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="advertiser-task-count" className="text-[10px] font-bold text-slate-200">{isRussian ? 'Количество просмотров' : 'Number of views'}</label>
                  <input id="advertiser-task-count" type="number" inputMode="numeric" required min={1} max={100_000} step={1} value={taskCount} onChange={(event) => setTaskCount(event.target.value)} disabled={creatingCampaign || !hasCampaignsData} className="min-h-10 rounded-xl border border-white/10 bg-[#111a35] px-3 font-mono text-xs text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-50" />
                  {!isTaskCountValid && <p className="text-[9px] text-rose-300">{isRussian ? 'Допустимо от 1 до 100 000 заданий.' : 'Enter between 1 and 100,000 tasks.'}</p>}
                </div>
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${promote ? 'border-amber-300/30 bg-amber-300/[0.07]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                  <input type="checkbox" checked={promote} onChange={(event) => setPromote(event.target.checked)} disabled={creatingCampaign || !hasCampaignsData} className="mt-0.5 size-4 accent-amber-400" />
                  <span className="min-w-0"><span className="block text-[10px] font-extrabold text-white">{isRussian ? 'Приоритетное размещение Pro' : 'Pro priority placement'}</span><span className="mt-1 block text-[9px] leading-4 text-slate-400">{isRussian ? `${CAMPAIGN_PROMOTION_FEE_PEPE.toLocaleString('ru-RU')} PEPE за ${CAMPAIGN_PROMOTION_DURATION_HOURS} часа. Неиспользованное время возвращается при отмене.` : `${CAMPAIGN_PROMOTION_FEE_PEPE.toLocaleString('en-US')} PEPE for ${CAMPAIGN_PROMOTION_DURATION_HOURS} hours. Unused time is refunded on cancellation.`}</span></span>
                </label>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#111a35] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{isRussian ? 'Сводка бюджета' : 'Budget summary'}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{isRussian ? `${CAMPAIGN_REWARD_HOMERO} HOMERO награда + ${CAMPAIGN_COMMISSION_PEPE} PEPE комиссия за просмотр` : `${CAMPAIGN_REWARD_HOMERO} HOMERO reward + ${CAMPAIGN_COMMISSION_PEPE} PEPE commission per view`}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-black text-white">{isTaskCountValid ? formatAtomic(campaignCostAtomic, language) : '—'} PEPE</p>
                    <p className="text-[9px] text-slate-400">{isRussian ? 'итого к оплате' : 'total charged'}</p>
                  </div>
                </div>
                {hasCampaignsData && isTaskCountValid && !hasEnoughCampaignFunds && <p className="mt-2 text-[10px] font-semibold text-rose-300">{isRussian ? 'Недостаточно PEPE в рекламном кошельке. Сначала переведите средства из Publisher.' : 'Not enough PEPE in your Advertiser wallet. Transfer funds from Publisher first.'}</p>}
                <p className="mt-2 text-[9px] leading-4 text-slate-500">{isRussian ? 'Неиспользованный бюджет задания, включая комиссию, возвращается при отмене. Списание производится только после проверки баланса.' : 'Unused task budget, including commission, is refunded on cancellation. Funds are charged only after the balance check.'}</p>
              </div>

              <button type="submit" disabled={!hasCampaignsData || creatingCampaign || !isTaskCountValid || !hasEnoughCampaignFunds || title.trim().length < 3 || !targetUrl.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 text-xs font-extrabold text-white shadow-lg shadow-blue-950/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                {creatingCampaign ? <LoaderCircle size={15} className="animate-spin" /> : <Megaphone size={15} />}{creatingCampaign ? isRussian ? 'Запускаем…' : 'Launching…' : isRussian ? 'Запустить PTC-кампанию' : 'Launch PTC campaign'}
              </button>
            </form>
          </section>}
        </div>}

        {view === 'create' && <YoutubeCampaignForm
          title={youtubeTitle}
          targetUrl={youtubeUrl}
          description={youtubeDescription}
          taskCount={youtubeTaskCount}
          durationSeconds={youtubeDuration}
          perViewReward={formatAtomic(youtubePricing.rewardAtomic, language)}
          perViewCommission={formatAtomic(youtubePricing.commissionAtomic, language)}
          perViewTotal={formatAtomic(youtubePricing.rewardAtomic + youtubePricing.commissionAtomic, language)}
          totalCost={formatAtomic(youtubeCampaignCostAtomic, language)}
          estimatedUsd={formatUsdEstimate(youtubeCampaignCostAtomic)}
          validTaskCount={isYoutubeTaskCountValid}
          hasEnoughFunds={hasEnoughYoutubeFunds}
          ready={hasCampaignsData}
          submitting={creatingCampaign}
          onTitleChange={setYoutubeTitle}
          onUrlChange={setYoutubeUrl}
          onDescriptionChange={setYoutubeDescription}
          onTaskCountChange={setYoutubeTaskCount}
          onDurationChange={setYoutubeDuration}
          onSubmit={handleCreateYoutubeCampaign}
        />}

        {view === 'campaigns' && <section id="advertiser-campaigns" aria-labelledby="advertiser-campaigns-title" className="scroll-mt-20 rounded-[26px] border border-white/[0.08] bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="advertiser-campaigns-title" className="text-sm font-extrabold text-white">{isRussian ? 'Ваши рекламные кампании' : 'Your advertiser campaigns'}</h2>
              <p className="mt-1 text-[10px] text-slate-400">{isRussian ? 'PTC-задания и YouTube-видео публикуются в соответствующих разделах.' : 'PTC tasks and YouTube videos appear in their respective sections.'}</p>
            </div>
            <button type="button" onClick={() => void refreshBalances()} disabled={wallet.isValidating || campaigns.isValidating} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[10px] font-bold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50"><RefreshCw size={12} className={wallet.isValidating || campaigns.isValidating ? 'animate-spin' : ''} />{isRussian ? 'Обновить' : 'Refresh'}</button>
          </header>
          {campaigns.isLoading ? <div role="status" className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-xs text-slate-400"><LoaderCircle size={16} className="animate-spin" />{isRussian ? 'Загружаем рекламные кампании…' : 'Loading advertiser campaigns…'}</div>
            : campaigns.data?.campaigns.length ? <div className="flex flex-col gap-3">
              {campaigns.data.campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} language={language} busy={busyCampaignId === campaign.id || updatingCampaign} onStatusChange={handleCampaignStatusChange} />)}
            </div>
              : <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200"><Megaphone size={18} /></span>
                <p className="mt-3 text-xs font-extrabold text-white">{isRussian ? 'Кампаний пока нет' : 'No campaigns yet'}</p>
                <p className="mt-1 max-w-sm text-[10px] leading-5 text-slate-400">{isRussian ? 'Создайте PTC- или YouTube-кампанию, чтобы она появилась в разделе заданий для исполнителей.' : 'Create a PTC or YouTube campaign to make it available to performers.'}</p>
              </div>}
        </section>}

        {view === 'activity' && <section id="advertiser-activity" aria-labelledby="advertiser-activity-title" className="scroll-mt-20 rounded-[26px] border border-white/[0.08] bg-[#0d142c] p-4 shadow-lg shadow-black/10 sm:p-5">
          <header className="mb-3 flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><Coins size={16} /></span>
            <div><h2 id="advertiser-activity-title" className="text-sm font-extrabold text-white">{isRussian ? 'Операции рекламного кошелька' : 'Advertiser wallet activity'}</h2><p className="mt-0.5 text-[10px] text-slate-400">{isRussian ? 'Переводы, списания и возвраты учитываются отдельно.' : 'Transfers, campaign charges, and refunds are tracked separately.'}</p></div>
          </header>
          {wallet.isLoading ? <div role="status" className="flex min-h-16 items-center gap-2 text-xs text-slate-400"><LoaderCircle size={15} className="animate-spin" />{isRussian ? 'Загружаем операции…' : 'Loading wallet activity…'}</div>
            : activity.length ? <ul className="divide-y divide-white/[0.06]">
              {activity.map((item) => {
                const amount = BigInt(item.amountAtomic)
                const isCredit = amount > 0n
                return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-1 last:pb-1">
                  <div className="flex min-w-0 items-center gap-2.5"><span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isCredit ? 'bg-emerald-400/10 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>{isCredit ? <Check size={13} /> : <Clock3 size={13} />}</span><div className="min-w-0"><p className="truncate text-[10px] font-bold text-slate-200">{getActivityLabel(item.source, isRussian)}</p><p className="mt-0.5 text-[9px] text-slate-500">{formatDate(item.createdAt, language)}</p></div></div>
                  <p className={`font-mono text-xs font-extrabold ${isCredit ? 'text-emerald-200' : 'text-rose-200'}`}>{isCredit ? '+' : '−'}{formatAtomic(amount < 0n ? -amount : amount, language)} PEPE</p>
                </li>
              })}
            </ul> : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-[10px] text-slate-400">{isRussian ? 'Переведите PEPE из Publisher, чтобы пополнить рекламный кошелёк.' : 'Transfer PEPE from Publisher to fund your advertiser wallet.'}</p>}
        </section>}
      </main>
    </LocalizedTree>
  )
}
