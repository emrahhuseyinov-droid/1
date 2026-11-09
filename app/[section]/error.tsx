'use client'

import { useEffect } from 'react'

type SectionErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function SectionError({ error, reset }: SectionErrorProps) {
  useEffect(() => {
    console.error('[dashboard-section] render error', {
      name: error.name,
      digest: error.digest,
    })
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <section role="alert" className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-white/10 dark:bg-[#111a2b]">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-500">pepe.casa</p>
        <h1 className="mt-3 text-2xl font-black text-slate-900 dark:text-white">Не удалось открыть раздел</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Произошла ошибка при загрузке страницы. Попробуйте загрузить её ещё раз.</p>
        {error.digest && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Код ошибки: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
            Повторить
          </button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
            На главную
          </a>
        </div>
      </section>
    </main>
  )
}
