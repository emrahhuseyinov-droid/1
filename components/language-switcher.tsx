'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Globe2 } from 'lucide-react'
import { useSiteLanguage } from '@/components/site-language-provider'
import type { SiteLanguage } from '@/lib/site-translations'

const languageOptions: { code: SiteLanguage; nativeLabel: string }[] = [
  { code: 'ru', nativeLabel: 'Русский' },
  { code: 'en', nativeLabel: 'English' },
]

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useSiteLanguage()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const labels = language === 'ru'
    ? { change: 'Сменить язык', choose: 'Выберите язык', website: 'Язык сайта' }
    : { change: 'Change language', choose: 'Choose language', website: 'Website language' }

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  function selectLanguage(nextLanguage: SiteLanguage) {
    setLanguage(nextLanguage)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={labels.change}
        title={labels.change}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="language-switcher-options"
        onClick={() => setOpen((current) => !current)}
        className="group inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-sky-300/70 bg-gradient-to-r from-sky-50 via-blue-50 to-emerald-50 px-2 py-1 text-sky-700 shadow-[0_4px_14px_rgba(14,165,233,0.12)] transition hover:-translate-y-px hover:border-cyan-400 hover:shadow-[0_0_18px_rgba(34,211,238,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:border-sky-400/30 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/50 dark:text-cyan-200"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white shadow-sm transition group-hover:scale-105">
          <Globe2 size={15} strokeWidth={1.9} />
        </span>
        <span className={`${compact ? 'hidden sm:inline' : ''} font-mono text-[9px] font-black tracking-wide`}>{language.toUpperCase()}</span>
      </button>

      {open && <div id="language-switcher-options" role="group" aria-label={labels.choose} className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_48px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-[#111a2b]">
        <p className="px-2.5 pb-2 pt-1 text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">{labels.website}</p>
        {languageOptions.map((option) => {
          const selected = language === option.code
          return <button
            key={option.code}
            type="button"
            aria-pressed={selected}
            onClick={() => selectLanguage(option.code)}
            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left transition ${selected ? 'bg-blue-500/[0.08] text-blue-700 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <span>
              <span className="block text-[11px] font-extrabold">{option.nativeLabel}</span>
            </span>
            {selected && <Check size={14} className="text-blue-600 dark:text-blue-300" />}
          </button>
        })}
      </div>}
    </div>
  )
}
