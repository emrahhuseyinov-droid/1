import { NextRequest, NextResponse } from 'next/server'
import { readManualFaucetCaptchaStateToken } from '@/lib/manual-faucet-captcha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
}

export async function GET(request: NextRequest) {
  const language = request.cookies.get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'
  const copy = language === 'ru'
    ? {
        title: 'Проверка CAPTCHA завершена',
        waiting: 'AdsLab вернул сессию CAPTCHA. Проверяем её статус на сервере…',
        invalid: 'AdsLab не вернул действительную сессию. Вернитесь к ручному крану и попробуйте снова.',
        returned: 'AdsLab вернул сессию. Ручной кран проверяет её сейчас.',
        fallback: 'Вернитесь на страницу ручного крана, чтобы продолжить проверку.',
      }
    : {
        title: 'CAPTCHA verification returned',
        waiting: 'AdsLab returned your CAPTCHA session. Checking its status with the server…',
        invalid: 'AdsLab did not return a valid session. Return to Manual Faucet and try again.',
        returned: 'AdsLab returned your session. Manual Faucet is verifying it now.',
        fallback: 'Return to the Manual Faucet page to continue verification.',
      }
  const stateValues = request.nextUrl.searchParams.getAll('state')
  const state = stateValues.length === 1 ? readManualFaucetCaptchaStateToken(stateValues[0]) : null
  const sessionId = state?.sessionId ?? null
  const serializedSessionId = JSON.stringify(sessionId).replace(/</g, '\\u003c')
  const serializedCopy = JSON.stringify(copy).replace(/</g, '\\u003c')

  const html = `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${copy.title}</title></head>
<body>
  <p id="status">${copy.waiting}</p>
  <script>
    const sessionId = ${serializedSessionId};
    const copy = ${serializedCopy};
    const status = document.getElementById('status');
    if (!sessionId) {
      status.textContent = copy.invalid;
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
          const channel = new BroadcastChannel('adslab-faucet-captcha:' + sessionId);
          channel.postMessage(message);
          channel.close();
          notified = true;
        }
      } catch {}
      status.textContent = notified ? copy.returned : copy.fallback;
      history.replaceState(null, '', window.location.pathname);
      if (notified) window.close();
    }
  </script>
</body>
</html>`

  return new NextResponse(html, { headers: noStoreHeaders })
}
