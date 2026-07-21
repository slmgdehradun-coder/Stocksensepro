import { NextResponse } from 'next/server';
import { fetchMarketData, MarketDataError, parseMarketRequest } from '@/lib/marketData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketRequest = parseMarketRequest(searchParams);
    const data = await fetchMarketData(marketRequest);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MarketDataError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unexpected market data error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
