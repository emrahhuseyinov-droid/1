'use client'

import { Eye, EyeOff, ShieldCheck, Wallet } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { TokenLogo } from '@/components/token-logo'
import { LocalizedTree } from '@/components/site-language-provider'
import { MARKET_PRICE_REFRESH_INTERVAL_MS, walletAssets, type WalletCoinSymbol } from '@/lib/wallet-assets'

type Props = {
  balances: Record<WalletCoinSymbol, number>
  activeCoin: WalletCoinSymbol
  onSelectCoin: (coin: WalletCoinSymbol) => void
  onNavigate: (section: string) => void
}

type PepeMarketQuote = {
  pepeUsd: number
  homeroUsdReference: number
  homeroToPepeReferenceRate: number
  source: string
  network: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchMarketQuote(url: string): Promise<PepeMarketQuote> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('PEPE/USD quote is unavailable')

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error('Invalid PEPE/USD quote')

  const { pepeUsd, homeroUsdReference, homeroToPepeReferenceRate, source, network } = payload
  if (
    typeof pepeUsd !== 'number' || !Number.isFinite(pepeUsd) || pepeUsd <= 0 ||
    typeof homeroUsdReference !== 'number' || !Number.isFinite(homeroUsdReference) || homeroUsdReference <= 0 ||
    typeof homeroToPepeReferenceRate !== 'number' ||
    typeof source !== 'string' || typeof network !== 'string'
  ) {
    throw new Error('Invalid PEPE/USD quote')
  }

  return { pepeUsd, homeroUsdReference, homeroToPepeReferenceRate, source, network }
}

function formatBalance(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value)
}

function formatUsdUnitPrice(value: number) {
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

export function WalletPage({ balances, activeCoin, onSelectCoin, onNavigate }: Props) {
  const [balancesHidden, setBalancesHidden] = useState(false)
  const { data: marketQuote, error: marketQuoteError, isLoading: marketQuoteLoading } = useSWR<PepeMarketQuote>(
    '/api/pepe-price',
    fetchMarketQuote,
    { refreshInterval: MARKET_PRICE_REFRESH_INTERVAL_MS, revalidateOnFocus: true },
  )
  const activeUnitPrice = activeCoin === 'HOMERO' ? marketQuote?.homeroUsdReference : marketQuote?.pepeUsd
  const activeUsdValue = activeUnitPrice === undefined ? null : balances[activeCoin] * activeUnitPrice

  return (
    <LocalizedTree>
    <main id="top" className="dashboard-page-shell flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500">Account assets</p>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-[28px]">
            <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white"><Wallet size={16} /></span>
            Wallet overview
          </h1>
        </div>
        <button type="button" onClick={() => setBalancesHidden((hidden) => !hidden)} className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-[10px] font-extrabold text-blue-600 transition hover:bg-blue-500/5 dark:text-blue-300" aria-pressed={balancesHidden}>
          {balancesHidden ? <Eye size={14} /> : <EyeOff size={14} />}
          {balancesHidden ? 'Show balances' : 'Hide balances'}
        </button>
      </header>

      <section aria-labelledby="wallet-balance-title" className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <article className="group relative isolate flex min-h-[350px] flex-col overflow-hidden rounded-[30px] border border-blue-200/25 bg-[radial-gradient(ellipse_at_85%_15%,rgba(103,160,255,0.24),transparent_35%),linear-gradient(135deg,#2463eb_0%,#1c49c6_48%,#17194e_100%)] p-5 text-white shadow-[0_24px_80px_-32px_rgba(30,64,175,0.72)] ring-1 ring-inset ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-32px_rgba(37,99,235,0.75)] sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border border-white/[0.08]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 size-48 rounded-full bg-cyan-300/15 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/4 h-40 w-2/3 rounded-full bg-blue-300/10 blur-3xl" />

          <div className="relative flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner shadow-white/10 backdrop-blur-sm"><TokenLogo symbol={activeCoin} size={31} /></span>
                <div className="min-w-0">
                  <h2 id="wallet-balance-title" className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-100/75">Wallet balance</h2>
                  <p className="mt-1 text-xs font-bold text-white/85">{activeCoin}</p>
                </div>
              </div>
            </div>

            <div className="mt-7 grid flex-1 grid-rows-[1fr_auto] gap-6">
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/65">Available balance</p>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl lg:text-[3.25rem]">
                    {balancesHidden ? '••••••••' : formatBalance(balances[activeCoin])}
                    <span className="font-sans text-sm font-extrabold tracking-normal text-blue-100/80">{activeCoin}</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-4 py-3.5 shadow-inner shadow-white/[0.06] backdrop-blur-md">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-blue-100/65">Reference value</p>
                  <p className="mt-2 font-mono text-xl font-bold tracking-tight">{balancesHidden ? '••••••••' : activeUsdValue !== null ? formatUsdValue(activeUsdValue) : marketQuoteLoading ? 'Loading quote…' : 'Unavailable'}</p>
                  <p className="mt-1 text-[8px] font-semibold text-blue-100/60">PEPE reference only</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 border-t border-white/15 pt-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3.5 py-3 backdrop-blur-sm">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-blue-100/55">1 {activeCoin}</p>
                  <p className="mt-1.5 font-mono text-sm font-bold text-white">{activeUnitPrice !== undefined ? formatUsdUnitPrice(activeUnitPrice) : marketQuoteLoading ? 'Loading quote…' : 'Unavailable'}</p>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.055] px-3.5 py-3 backdrop-blur-sm">
                  <span className={`size-1.5 shrink-0 rounded-full ${marketQuote ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]' : marketQuoteLoading ? 'bg-amber-300' : 'bg-slate-400'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-[9px] font-bold text-white/85">{marketQuote ? marketQuote.source : marketQuoteError ? 'Retrying automatically' : 'Fetching live quote'}</p>
                    <p className="mt-0.5 text-[8px] text-blue-100/50">Updates every minute</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="group relative isolate flex min-h-[350px] flex-col overflow-hidden rounded-[30px] border border-blue-400/20 bg-[radial-gradient(ellipse_at_90%_0%,rgba(38,99,235,0.22),transparent_38%),linear-gradient(145deg,#111d34_0%,#0d172a_62%,#0b1220_100%)] p-5 text-white shadow-[0_20px_65px_-35px_rgba(30,64,175,0.55)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_75px_-35px_rgba(37,99,235,0.5)] sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-16 size-52 rounded-full bg-cyan-400/[0.08] blur-3xl" />
          <div className="relative flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.08] shadow-inner shadow-emerald-200/10"><TokenLogo symbol="PEPE" size={29} /></span>
                <div className="min-w-0">
                  <h2 className="text-sm font-black tracking-wide">PEPE / USD</h2>
                </div>
              </div>
              <span aria-live="polite" className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[8px] font-bold ${marketQuote ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
                <span className={`size-1.5 rounded-full ${marketQuote ? 'animate-pulse bg-emerald-300' : marketQuoteLoading ? 'bg-amber-300' : 'bg-slate-400'}`} />
                {marketQuote ? 'Live quote' : marketQuoteLoading ? 'Loading quote…' : 'Unavailable'}
              </span>
            </div>

            <div className="mt-6 rounded-[24px] border border-blue-100/10 bg-gradient-to-br from-[#1b2a45]/95 via-[#14213a]/90 to-[#101a2e]/95 p-4 shadow-inner shadow-white/[0.04] sm:p-5">
              <div className="min-w-0">
                <p className="truncate font-mono text-2xl font-black tracking-tight sm:text-[1.75rem]">{marketQuote ? formatUsdUnitPrice(marketQuote.pepeUsd) : marketQuoteLoading ? 'Loading quote…' : 'Unavailable'}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[9px] font-medium text-blue-100/55">
                <span className={`size-1.5 rounded-full ${marketQuote ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]' : 'bg-slate-400'}`} />
                {marketQuote ? <><span>{marketQuote.source}</span><span aria-hidden="true">·</span><span>Updates every minute</span></> : marketQuoteError ? 'Retrying automatically' : 'Fetching live quote'}
              </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                <p className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-blue-100/45">HOMERO / USD</p>
                <p className="mt-1.5 font-mono text-xs font-bold text-white">{marketQuote ? formatUsdUnitPrice(marketQuote.homeroUsdReference) : marketQuoteLoading ? 'Loading…' : 'Unavailable'}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                <p className="truncate text-[8px] font-extrabold uppercase tracking-[0.12em] text-blue-100/45">{marketQuote?.source ?? (marketQuoteError ? 'Retrying automatically' : 'Fetching live quote')}</p>
                <p className="mt-1.5 text-[10px] font-bold text-white">{marketQuote ? 'Updates every minute' : 'PEPE / USD'}</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section aria-labelledby="wallet-assets-title" className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111a2b]">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
          <div><h2 id="wallet-assets-title" className="text-sm font-extrabold">Your assets</h2><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">2 supported game currencies</p></div>
          <span aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold ${marketQuote ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}><span className={`size-1.5 rounded-full ${marketQuote ? 'animate-pulse bg-emerald-500' : marketQuoteLoading ? 'bg-amber-400' : 'bg-slate-400'}`} />{marketQuote ? `Live PEPE/USD · ${formatUsdUnitPrice(marketQuote.pepeUsd)}` : marketQuoteLoading ? 'Loading PEPE/USD…' : 'PEPE/USD unavailable'}</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900/30"><th className="px-4 py-3 sm:px-5">Asset</th><th className="px-4 py-3">Recorded balance</th><th className="px-4 py-3">USD value</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {walletAssets.map((asset) => {
                const isSelected = activeCoin === asset.symbol
                const unitPrice = asset.symbol === 'HOMERO' ? marketQuote?.homeroUsdReference : marketQuote?.pepeUsd
                return <tr key={asset.symbol} className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30 ${isSelected ? 'bg-blue-500/[0.035]' : ''}`}>
                  <td className="px-4 py-3.5 sm:px-5"><button type="button" onClick={() => onSelectCoin(asset.symbol)} className="flex items-center gap-3 text-left">
                    <TokenLogo symbol={asset.symbol} size={36} />
                    <span><span className="block text-xs font-extrabold">{asset.symbol}</span><span className="mt-0.5 block text-[10px] text-slate-400">{asset.name}</span></span>
                  </button></td>
                  <td className="px-4 py-3.5 font-mono text-xs font-extrabold">{balancesHidden ? '••••••••' : formatBalance(balances[asset.symbol])}</td>
                  <td className="px-4 py-3.5">
                    {unitPrice !== undefined
                      ? <div><p className="text-xs font-extrabold text-slate-700 dark:text-slate-100">{balancesHidden ? '••••••••' : formatUsdValue(balances[asset.symbol] * unitPrice)}</p><p className="mt-1 text-[9px] font-medium text-slate-400">{formatUsdUnitPrice(unitPrice)} / {asset.symbol}{asset.symbol === 'HOMERO' ? ' · PEPE reference' : ' · live'}</p></div>
                      : <span className="text-[10px] font-semibold text-slate-400">{marketQuoteLoading ? 'Loading…' : 'Unavailable'}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {asset.symbol === 'HOMERO'
                      ? <span aria-hidden="true" className="text-slate-500">—</span>
                      : <button type="button" onClick={() => onNavigate('Swap')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-blue-500"><TokenLogo symbol={asset.symbol} size={12} />TOKEN EXCHANGE</button>}
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-1.5 pb-2 text-center text-[9px] text-slate-400"><ShieldCheck size={12} className="shrink-0 text-blue-500" /><span>PEPE/USD is a live DEX Screener quote that refreshes every minute. HOMERO is an internal site token valued at the same reference price; this feed does not execute or guarantee a swap.</span></footer>

    </main>
    </LocalizedTree>
  )
}
