'use client'

import { useState, type FormEvent } from 'react'
import { Check, Copy, Link2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSiteLanguage } from '@/components/site-language-provider'

type ShortenerResponse = {
  shortenedUrl?: string
  code?: string
  error?: string
}

export function AdsLabLinkShortener() {
  const { language } = useSiteLanguage()
  const isRussian = language === 'ru'
  const [url, setUrl] = useState('')
  const [alias, setAlias] = useState('')
  const [shortenedUrl, setShortenedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  function getRequestError(status: number, code?: string) {
    if (status === 401) return isRussian ? 'Войдите в аккаунт, чтобы сокращать ссылки.' : 'Sign in to shorten links.'
    if (status === 429) return isRussian ? 'Слишком много запросов. Попробуйте позже.' : 'Too many requests. Please try again later.'
    if (code === 'configuration_missing') return isRussian ? 'Сервис сокращения ссылок ещё не настроен.' : 'The link shortener is not configured yet.'
    if (status === 400) return isRussian ? 'Проверьте HTTPS-ссылку и псевдоним.' : 'Check the HTTPS URL and alias.'
    return isRussian ? 'Не удалось сократить ссылку. Попробуйте позже.' : 'Could not shorten this link. Please try again later.'
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setShortenedUrl(null)
    setIsCopied(false)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/adslab/shortener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, alias }),
      })
      const result = await response.json().catch(() => null) as ShortenerResponse | null

      if (!response.ok || !result?.shortenedUrl) {
        throw new Error(getRequestError(response.status, result?.code))
      }

      setShortenedUrl(result.shortenedUrl)
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : (isRussian ? 'Не удалось сократить ссылку.' : 'Could not shorten this link.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function copyShortenedUrl() {
    if (!shortenedUrl) return
    try {
      await navigator.clipboard.writeText(shortenedUrl)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1_800)
    } catch {
      setError(isRussian ? 'Не удалось скопировать ссылку.' : 'Could not copy the link.')
    }
  }

  function clearResult() {
    setShortenedUrl(null)
    setError(null)
    setIsCopied(false)
  }

  return (
    <section aria-labelledby="adslab-shortener-title" className="cartoon-panel overflow-hidden rounded-[32px] border-2 border-dashboard-outline bg-[#171f40] shadow-xl shadow-indigo-950/30">
      <header className="border-b-2 border-white/10 bg-gradient-to-r from-[#252f5b] to-[#20294e] px-4 py-4 sm:px-5">
        <h2 id="adslab-shortener-title" className="flex items-center gap-2 text-sm font-extrabold text-white"><Link2 aria-hidden="true" />{isRussian ? 'Сократить ссылку' : 'Shorten a link'}</h2>
        <p className="mt-1 text-[10px] leading-5 text-dashboard-muted">{isRussian ? 'Создайте короткую ссылку. Ключ API хранится только на сервере.' : 'Create a short link. The API key stays on the server.'}</p>
      </header>
      <div className="p-4 sm:p-5">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.55fr)]">
            <Field>
              <FieldLabel htmlFor="adslab-shortener-url" className="text-white">{isRussian ? 'Исходная HTTPS-ссылка' : 'Destination HTTPS URL'}</FieldLabel>
              <Input
                id="adslab-shortener-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                maxLength={2_000}
                placeholder="https://example.com/page"
                required
                disabled={isSubmitting}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  clearResult()
                }}
              />
              <FieldDescription className="text-dashboard-muted">{isRussian ? 'Только публичные HTTPS-ссылки.' : 'Public HTTPS links only.'}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="adslab-shortener-alias" className="text-white">{isRussian ? 'Псевдоним (необязательно)' : 'Custom alias (optional)'}</FieldLabel>
              <Input
                id="adslab-shortener-alias"
                autoComplete="off"
                maxLength={40}
                pattern="[A-Za-z0-9_-]{2,40}"
                placeholder="promo-2026"
                disabled={isSubmitting}
                value={alias}
                onChange={(event) => {
                  setAlias(event.target.value)
                  clearResult()
                }}
              />
              <FieldDescription className="text-dashboard-muted">{isRussian ? 'Буквы, цифры, дефис и подчёркивание.' : 'Letters, numbers, hyphens, and underscores.'}</FieldDescription>
            </Field>
          </FieldGroup>
          {error && <p role="alert" className="text-xs font-semibold text-rose-300">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle aria-hidden="true" data-icon="inline-start" className="animate-spin" /> : <Link2 aria-hidden="true" data-icon="inline-start" />}
              {isSubmitting ? (isRussian ? 'Сокращаем…' : 'Shortening…') : (isRussian ? 'Создать ссылку' : 'Create short link')}
            </Button>
            {shortenedUrl && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="status" aria-live="polite">
                <a href={shortenedUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-sm font-bold text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 hover:text-cyan-100">
                  {shortenedUrl}
                </a>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyShortenedUrl()}>
                  {isCopied ? <Check aria-hidden="true" data-icon="inline-start" /> : <Copy aria-hidden="true" data-icon="inline-start" />}
                  {isCopied ? (isRussian ? 'Скопировано' : 'Copied') : (isRussian ? 'Копировать' : 'Copy')}
                </Button>
              </div>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
