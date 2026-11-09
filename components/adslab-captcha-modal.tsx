'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'

type CaptchaMessage = {
  type?: unknown
  token?: unknown
}

export function AdsLabCaptchaModal({
  solveUrl,
  onSolved,
  onClose,
}: {
  solveUrl: string | null
  onSolved: (token: string | null) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const popupRef = useRef<Window | null>(null)
  const onSolvedRef = useRef(onSolved)
  const completedRef = useRef(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [popupOpened, setPopupOpened] = useState(false)
  onSolvedRef.current = onSolved

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
  }, [solveUrl])

  useEffect(() => {
    function handleMessage(event: MessageEvent<CaptchaMessage>) {
      if (event.origin !== window.location.origin || event.source !== popupRef.current) return
      if (!event.data || event.data.type !== 'adslab-captcha-return' || completedRef.current) return
      completedRef.current = true
      const token = typeof event.data.token === 'string' && event.data.token.length <= 16_384 ? event.data.token : null
      popupRef.current?.close()
      popupRef.current = null
      onSolvedRef.current(token)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  function openChallenge() {
    if (!solveUrl) return
    const popup = window.open(solveUrl, 'adslab-wheel-captcha', 'popup,width=520,height=720')
    if (!popup) {
      setPopupBlocked(true)
      return
    }
    popupRef.current = popup
    setPopupBlocked(false)
    setPopupOpened(true)
    popup.focus()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="adslab-captcha-title"
      aria-describedby="adslab-captcha-description"
      className="w-[min(94vw,480px)] max-h-[90dvh] overflow-hidden rounded-[24px] border border-emerald-200/20 bg-[#0b1118] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.7)] backdrop:bg-black/75"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
        <div>
          <h2 id="adslab-captcha-title" className="text-base font-black">Verify to spin</h2>
          <p id="adslab-captcha-description" className="mt-1 text-xs leading-5 text-white/60">AdsLab opens its challenge in a separate window. Keep this window open; the wheel spins after AdsLab verifies your response.</p>
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close verification" className="grid size-9 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="p-4 sm:p-5">
        <button type="button" onClick={openChallenge} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-[11px] font-black text-[#07120d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100">
          <ExternalLink aria-hidden="true" />
          {popupOpened ? 'Reopen AdsLab challenge' : 'Open AdsLab challenge'}
        </button>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-[10px] leading-5 text-white/55">
          {popupBlocked ? 'Pop-up was blocked. Allow pop-ups for this site and try again.' : popupOpened ? 'Waiting for AdsLab to confirm the challenge…' : 'Your wheel result is created only after server-side verification.'}
        </p>
      </div>
    </dialog>
  )
}
