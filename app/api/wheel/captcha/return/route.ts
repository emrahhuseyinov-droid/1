import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'",
}

export async function GET(request: NextRequest) {
  const requestedParentOrigin = request.nextUrl.searchParams.get('parent_origin')
  const parentOrigin = requestedParentOrigin === request.nextUrl.origin ? requestedParentOrigin : request.nextUrl.origin
  const serializedOrigin = JSON.stringify(parentOrigin).replace(/</g, '\\u003c')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verification complete</title></head>
<body>
  <p id="status">Returning to the wheel…</p>
  <script>
    const names = ['token', 'response', 'captcha_token', 'captcha_response', 'captchaToken', 'captchaResponse', 'captcha-response', 'g-recaptcha-response', 'adslab_token', 'session_token'];
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    let token = null;
    for (const name of names) {
      token = query.get(name) || fragment.get(name);
      if (token) break;
    }
    if (window.opener) {
      window.opener.postMessage({ type: 'adslab-captcha-return', token }, ${serializedOrigin});
      history.replaceState(null, '', window.location.pathname);
      window.close();
    } else if (window.parent !== window) {
      window.parent.postMessage({ type: 'adslab-captcha-return', token }, ${serializedOrigin});
      history.replaceState(null, '', window.location.pathname);
    } else {
      document.getElementById('status').textContent = 'Return to the wheel page to continue.';
    }
  </script>
</body>
</html>`

  return new NextResponse(html, { headers: noStoreHeaders })
}
