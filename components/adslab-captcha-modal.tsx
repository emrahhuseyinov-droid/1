'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { LocalizedTree } from '@/components/site-language-provider'

type CaptchaReturnMessage = {
  type?: unknown
  captchaSessionId?: unknown
}

export function AdsLabCaptchaModal({
  solveUrl,
  challengeToken,
  captchaSessionId,
  onReturned,
  onClose,
  purpose = 'wheel',
}: {
  solveUrl: string | null
  challengeToken: string | null
  captchaSessionId: string | null
  onReturned: (sessionId: string) => void
  onClose: () => void
  purpose?: 'wheel' | 'faucet' | 'youtube'
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const popupRef = useRef<Window | null>(null)
  const onReturnedRef = useRef(onReturned)
  const completedRef = useRef(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [popupOpened, setPopupOpened] = useState(false)
  onReturnedRef.current = onReturned

  useEffect(() => {
    completedRef.current = false
    setPopupBlocked(false)
    setPopupOpened(false)
    const dialog = dialogRef.current
    if (!dialog) return
    if (solveUrl && !dialog.open) dialog.showModal()
    if (!solveUrl && dialog.open) dialog.close()
    if (!solveUrl && popupRef.current && !popupRef.current.closed) popupRef.current.close()
    if (!solveUrl) popupRef.current = null
  }, [solveUrl, captchaSessionId, challengeToken])

  useEffect(() => {
    if (!captchaSessionId) return
    const activeSessionId = captchaSessionId

    function complete(value: unknown) {
      if (!value || typeof value !== 'object') return
      const message = value as CaptchaReturnMessage
      if (message.type !== 'adslab-captcha-return' || message.captchaSessionId !== activeSessionId || completedRef.current) return
      completedRef.current = true
      popupRef.current?.close()
      popupRef.current = null
      onReturnedRef.current(activeSessionId)
    }

    function handleWindowMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== popupRef.current) return
      complete(event.data)
    }

    const channelPrefix = purpose === 'faucet' ? 'adslab-faucet-captcha' : 'adslab-wheel-captcha'
    const channel = typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`${channelPrefix}:${activeSessionId}`)
    const handleChannelMessage = (event: MessageEvent<unknown>) => complete(event.data)

    window.addEventListener('message', handleWindowMessage)
    channel?.addEventListener('message', handleChannelMessage)
    return () => {
      window.removeEventListener('message', handleWindowMessage)
      channel?.removeEventListener('message', handleChannelMessage)
      channel?.close()
    }
  }, [captchaSessionId, purpose])

  function openChallenge() {
    if (!solveUrl || !captchaSessionId) return
    const popupName = `adslab-${purpose}-captcha-${captchaSessionId}`
    const popup = window.open('', popupName, 'popup,width=520,height=720')
    if (!popup) {
      setPopupBlocked(true)
      return
    }
    popupRef.current = popup
    setPopupBlocked(false)

    try {
      if (challengeToken) {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = solveUrl
        form.target = popupName
        form.hidden = true

        const tokenField = document.createElement('input')
        tokenField.type = 'hidden'
        tokenField.name = 'token'
        tokenField.value = challengeToken
        form.append(tokenField)
        document.body.append(form)
        form.submit()
        form.remove()
      } else {
        popup.location.href = solveUrl
      }

      setPopupOpened(true)
      popup.focus()
    } catch {
      popup.close()
      popupRef.current = null
      setPopupBlocked(true)
    }
  }

  return (
    <LocalizedTree>
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="adslab-captcha-title"
      aria-describedby="adslab-captcha-description"
      className="adslab-captcha-dialog w-[min(94vw,480px)] max-h-[90dvh] overflow-hidden rounded-[24px] border border-emerald-200/20 bg-[#0b1118] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.7)] backdrop:bg-black/75"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
        <div>
          <h2 id="adslab-captcha-title" className="text-base font-black">{purpose === 'faucet' ? 'Verify to claim' : purpose === 'youtube' ? 'Verify to claim your video reward' : 'Verify to spin'}</h2>
          <p id="adslab-captcha-description" className="mt-1 text-xs leading-5 text-white/60">{purpose === 'faucet' || purpose === 'youtube' ? 'The CAPTCHA challenge opens in a separate window. Return here after solving; the server checks the session before your reward is credited.' : 'The CAPTCHA challenge opens in a separate window. Return here after solving; the server checks the session before the wheel spins.'}</p>
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close verification" className="grid size-9 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="p-4 sm:p-5">
        <button type="button" onClick={openChallenge} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-[11px] font-black text-[#07120d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100">
          <ExternalLink aria-hidden="true" />
          {popupOpened ? 'Reopen CAPTCHA challenge' : 'Open CAPTCHA challenge'}
        </button>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-[10px] leading-5 text-white/55">
          {popupBlocked ? 'Pop-up was blocked. Allow pop-ups for this site and try again.' : popupOpened ? 'Waiting for you to return from the CAPTCHA…' : purpose === 'faucet' || purpose === 'youtube' ? 'Your reward is credited only after server-side verification.' : 'Your wheel result is created only after server-side verification.'}
        </p>
      </div>
    </dialog>
    </LocalizedTree>
  )
}
