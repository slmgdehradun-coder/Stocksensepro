import { NextResponse } from 'next/server';
import { searchMarketSymbols } from '@/lib/marketData';
import { Exchange } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const exchange = searchParams.get('exchange') as Exchange | null;

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  try {
    const validExchange = exchange === 'NSE' || exchange === 'BSE' || exchange === 'MCX' || exchange === 'US' || exchange === 'GLOBAL' ? exchange : 'NSE';
    const results = await searchMarketSymbols(query, validExchange);
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Search API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch search results' }, { status: 500 });
  }
}
