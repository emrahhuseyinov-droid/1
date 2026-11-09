import { NextResponse } from 'next/server'
import { getPepeMarketQuote } from '@/lib/pepe-market-price'

const priceCacheHeaders = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
}

export async function GET() {
  try {
    return NextResponse.json(await getPepeMarketQuote(), { headers: priceCacheHeaders })
  } catch (error) {
    console.error('[pepe-price] Could not fetch the live PEPE/USD quote:', error)
    return NextResponse.json(
      { error: 'The live PEPE/USD quote is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
