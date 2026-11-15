import 'server-only'
import { createHmac } from 'node:crypto'

const offerwallMePublicApiKey = 'lItJNj2QeKr5CjFKJefII20LfhgBtn6A'
const offerwallMeOrigin = 'https://offerwall.me'

export function createOfferwallMeIframeUrl(userId: string) {
  const configuredUrl = process.env.OFFERWALL_ME_IFRAME_URL?.trim()
  const secret = process.env.OFFERWALL_ME_SECRET
  if (!configuredUrl || !secret || !userId || /[\u0000-\u001f\u007f]/.test(userId)) return ''

  try {
    const url = new URL(configuredUrl)
    if (url.origin !== offerwallMeOrigin || url.username || url.password) return ''

    const expires = String(Math.floor(Date.now() / 1000) + 3600)
    const message = `offerwall-user-v1\n${offerwallMePublicApiKey}\n${userId}\n${expires}`
    const signature = createHmac('sha256', secret).update(message, 'utf8').digest('hex')

    url.pathname = `/offerwall/${offerwallMePublicApiKey}/${encodeURIComponent(userId)}`
    url.search = ''
    url.hash = ''
    url.searchParams.set('identityExpires', expires)
    url.searchParams.set('identitySignature', signature)
    return url.toString()
  } catch {
    return ''
  }
}
