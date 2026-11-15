'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { FAUCETPAY_PAIDVIEW_PLACEMENT_ID } from '@/lib/faucetpay-paidview'

type PaidViewEvent = 'served' | 'completed' | 'pending' | 'rejected' | 'closed' | 'empty'

const eventMessages: Record<PaidViewEvent, string> = {
  served: 'A FaucetPay ad is playing.',
  completed: 'FaucetPay validated the view. Reward credit is handled by the server callback.',
  pending: 'Your view finished and is waiting for FaucetPay verification.',
  rejected: 'FaucetPay could not validate this view.',
  closed: 'The ad was closed.',
  empty: 'No FaucetPay ad is available right now.',
}

export function FaucetPayPaidView({ guestId }: { guestId: string }) {
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const container = document.querySelector('[data-fp-paidview]')
    if (!container) return

    const listeners = new Map<PaidViewEvent, EventListener>()
    for (const eventName of Object.keys(eventMessages) as PaidViewEvent[]) {
      const listener: EventListener = () => setStatus(eventMessages[eventName])
      listeners.set(eventName, listener)
      container.addEventListener(`fp-paidview:${eventName}`, listener)
    }

    return () => {
      for (const [eventName, listener] of listeners) {
        container.removeEventListener(`fp-paidview:${eventName}`, listener)
      }
    }
  }, [])

  return (
    <section aria-labelledby="faucetpay-paidview-title" className="rounded-[24px] border border-cyan-200/15 bg-[#171e42] p-5 shadow-[0_16px_44px_rgba(4,9,32,0.22)] sm:p-7">
      <div className="mx-auto max-w-3xl space-y-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-300">Sponsored reward</p>
          <h2 id="faucetpay-paidview-title" className="mt-1 text-lg font-black sm:text-xl">Watch an ad and earn PEPE</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Keep the ad open until FaucetPay confirms the view. Valid rewards are credited after the secure server callback.</p>
        </div>
        <div
          data-fp-paidview
          data-placement={FAUCETPAY_PAIDVIEW_PLACEMENT_ID}
          data-user={guestId}
          className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/30 p-3"
        />
        {status && <p role="status" aria-live="polite" className="text-xs font-semibold text-cyan-100">{status}</p>}
      </div>
      <Script src="https://api.fpadserver.com/rewarded/player.js" strategy="afterInteractive" />
    </section>
  )
}
