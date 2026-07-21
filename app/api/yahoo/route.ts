import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const range = searchParams.get('range');
  const interval = searchParams.get('interval');

  if (!symbol || !range || !interval) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&_=${Date.now()}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&_=${Date.now()}`
    ];

    let lastError = null;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay before retry
        
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://finance.yahoo.com/'
          }
        });

        if (response.ok) {
          try {
            const textData = await response.text();
            if (!textData || textData.trim() === '') {
              lastError = 'Yahoo Finance returned empty response body';
              continue;
            }
            const data = JSON.parse(textData);
            if (data && data.chart && data.chart.result) {
              return NextResponse.json(data);
            }
            if (data && data.chart && data.chart.error) {
              lastError = `Yahoo API Error: ${data.chart.error.description || data.chart.error.code}`;
            } else {
              lastError = 'Yahoo Finance returned invalid data structure';
            }
          } catch (jsonErr: any) {
            lastError = `Failed to parse Yahoo response: ${jsonErr.message}`;
          }
        } else {
          const errorText = await response.text().catch(() => 'No error text');
          lastError = `Yahoo Finance API responded with status ${response.status}: ${errorText.substring(0, 100)}`;
        }
        
        if (response.status === 404) {
          return NextResponse.json({ error: `Symbol '${symbol}' not found on Yahoo Finance.` }, { status: 404 });
        }
      } catch (e: any) {
        lastError = `Fetch attempt ${i + 1} failed: ${e.message}`;
      }
    }

    console.error(`All Yahoo Finance endpoints failed for ${symbol}. Last error: ${lastError}`);
    return NextResponse.json({ error: lastError || 'Failed to fetch from all Yahoo endpoints' }, { status: 502 });
  } catch (error: any) {
    console.error('API Route Fatal Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
  }
}
