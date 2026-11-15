import 'server-only'
import { createHmac } from 'node:crypto'

export const OFFERWALL_ME_PUBLIC_API_KEY = 'HtjNj2QeKr5CjFKJefH2OLfhgBtn6A'
export const OFFERWALL_ME_PTC_PUBLIC_API_KEY = 'lItJNj2QeKr5CjFKJefII20LfhgBtn6A'
const offerwallMeOrigin = 'https://offerwall.me'

type SignedOfferwallIdentity = {
  identityExpires: string
  identitySignature: string
}

export function createOfferwallMeSignedIdentity(
  userId: string,
  publicApiKey = OFFERWALL_ME_PUBLIC_API_KEY,
): SignedOfferwallIdentity | null {
  const secret = process.env.OFFERWALL_ME_SECRET?.trim() ?? ''
  if (!secret || !userId || /[\u0000-\u001f\u007f]/.test(userId)) return null

  const identityExpires = String(Math.floor(Date.now() / 1000) + 3600)
  const message = `offerwall-user-v1\n${publicApiKey}\n${userId}\n${identityExpires}`
  const identitySignature = createHmac('sha256', secret).update(message, 'utf8').digest('hex')
  return { identityExpires, identitySignature }
}

export function createOfferwallMeIframeUrl(userId: string) {
  const configuredUrl = process.env.OFFERWALL_ME_IFRAME_URL?.trim()
  const identity = createOfferwallMeSignedIdentity(userId)
  if (!configuredUrl || !identity) return ''

  try {
    const url = new URL(configuredUrl)
    if (url.origin !== offerwallMeOrigin || url.username || url.password) return ''

    url.pathname = `/offerwall/${OFFERWALL_ME_PUBLIC_API_KEY}/${encodeURIComponent(userId)}`
    url.search = ''
    url.hash = ''
    url.searchParams.set('identityExpires', identity.identityExpires)
    url.searchParams.set('identitySignature', identity.identitySignature)
    return url.toString()
  } catch {
    return ''
  }
}
