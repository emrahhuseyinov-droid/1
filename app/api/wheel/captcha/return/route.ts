import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'self'",
}

export async function GET() {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verification submitted</title></head>
<body>
  <p>AdsLab received your CAPTCHA response. Return to the wheel page; it will spin after the signed server confirmation arrives.</p>
</body>
</html>`

  return new NextResponse(html, { headers: noStoreHeaders })
}
