import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const candidates = [
    request.nextUrl.searchParams.get('state'),
    request.nextUrl.searchParams.get('captcha_sub_id'),
    request.nextUrl.searchParams.get('sub_id'),
    request.nextUrl.searchParams.get('token'),
  ]
  const sessionId = candidates.find((value) => value && uuidPattern.test(value))?.toLowerCase() ?? null
  const purpose = request.nextUrl.searchParams.get('purpose') === 'daily_bonus' ? 'daily_bonus' : 'wheel'
  const channelPrefix = purpose === 'daily_bonus' ? 'adslab-daily-bonus-captcha' : 'adslab-wheel-captcha'
  const serializedChannelPrefix = JSON.stringify(channelPrefix).replace(/</g, '\\u003c')
  const returnPageName = purpose === 'daily_bonus' ? 'Daily Bonus page' : 'wheel page'
  const serializedReturnPageName = JSON.stringify(returnPageName).replace(/</g, '\\u003c')
  const serializedSessionId = JSON.stringify(sessionId).replace(/</g, '\\u003c')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verification submitted</title></head>
<body>
  <p id="status">Your CAPTCHA session is ready. Checking its status with the server…</p>
  <script>
    const sessionId = ${serializedSessionId};
    const status = document.getElementById('status');
    if (!sessionId) {
      status.textContent = 'A recognizable session ID was not received. Return to the wheel and try again.';
    } else {
      const message = { type: 'adslab-captcha-return', captchaSessionId: sessionId };
      let notified = false;
      try {
        if (window.opener) {
          window.opener.postMessage(message, window.location.origin);
          notified = true;
        }
        if (window.parent !== window) {
          window.parent.postMessage(message, window.location.origin);
          notified = true;
        }
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel(${serializedChannelPrefix} + ':' + sessionId);
          channel.postMessage(message);
          channel.close();
          notified = true;
        }
      } catch {}
      status.textContent = notified
        ? 'Your session is ready. The ' + ${serializedReturnPageName} + ' is verifying it now.'
        : 'Return to the ' + ${serializedReturnPageName} + ' to continue verification.';
      history.replaceState(null, '', window.location.pathname);
      if (notified) window.close();
    }
  </script>
</body>
</html>`

  return new NextResponse(html, { headers: noStoreHeaders })
}
