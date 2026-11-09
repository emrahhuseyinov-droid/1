'use client'

const ADSLAB_SDK_URL = 'https://adslab.me/api/sdk.js'
const ADSLAB_INTERSTITIAL_ID = 'int-OhHMK5Pof7Em'

declare global {
  interface Window {
    ADSLAB_INT?: string
    ADSLAB_USER?: string
    adslabShowInterstitial?: () => unknown
    showint_adslab?: () => unknown
  }
}

export function initializeAdsLabInterstitial(userId: string) {
  if (typeof window === 'undefined' || !userId) return

  window.ADSLAB_INT = ADSLAB_INTERSTITIAL_ID
  window.ADSLAB_USER = String(userId)

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${ADSLAB_SDK_URL}"]`)
  if (existingScript) return

  const script = document.createElement('script')
  script.src = ADSLAB_SDK_URL
  script.async = true
  document.head.appendChild(script)
}

export async function showAdsLabInterstitial() {
  if (typeof window === 'undefined') return

  try {
    if (typeof window.adslabShowInterstitial === 'function') {
      await window.adslabShowInterstitial()
    } else if (typeof window.showint_adslab === 'function') {
      await window.showint_adslab()
    }
  } catch (error) {
    console.error('[adslab-interstitial] Interstitial request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}
