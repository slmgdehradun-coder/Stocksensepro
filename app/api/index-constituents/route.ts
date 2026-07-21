import { NextResponse } from 'next/server';
import { NIFTY_50_SYMBOLS, NIFTY_NEXT_50_SYMBOLS, SeasonalityIndexGroup } from '@/lib/seasonality';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type IndexKey = 'nifty50' | 'niftynext50';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/csv,application/octet-stream,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
};

const INDEX_CONFIG: Record<IndexKey, {
  indexGroup: SeasonalityIndexGroup;
  url: string;
  fallback: string[];
}> = {
  nifty50: {
    indexGroup: 'NIFTY 50',
    url: 'https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv',
    fallback: NIFTY_50_SYMBOLS,
  },
  niftynext50: {
    indexGroup: 'NIFTY NEXT 50',
    url: 'https://nsearchives.nseindia.com/content/indices/ind_niftynext50list.csv',
    fallback: NIFTY_NEXT_50_SYMBOLS,
  },
};

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseSymbolsFromCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(header => header.toLowerCase());
  const symbolIndex = headers.findIndex(header => header === 'symbol' || header.includes('symbol'));
  if (symbolIndex === -1) return [];

  return Array.from(new Set(lines.slice(1)
    .map(line => splitCsvLine(line)[symbolIndex]?.trim().toUpperCase())
    .filter((symbol): symbol is string => Boolean(symbol))));
}

async function fetchIndexSymbols(key: IndexKey) {
  const config = INDEX_CONFIG[key];

  try {
    const response = await fetch(config.url, {
      cache: 'no-store',
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    const csv = await response.text();
    if (!response.ok || !csv.trim()) {
      throw new Error(`NSE CSV returned ${response.status}`);
    }

    const symbols = parseSymbolsFromCsv(csv);
    if (symbols.length < 40) {
      throw new Error(`NSE CSV had only ${symbols.length} symbols`);
    }

    return {
      indexGroup: config.indexGroup,
      symbols,
      source: 'nse-csv',
      sourceUrl: config.url,
      warnings: [] as string[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown NSE CSV fetch error';
    return {
      indexGroup: config.indexGroup,
      symbols: config.fallback,
      source: 'configured-fallback',
      sourceUrl: config.url,
      warnings: [`Using configured fallback list because NSE CSV could not be loaded: ${message}`],
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const index = searchParams.get('index') || 'both';
  const keys: IndexKey[] = index === 'nifty50'
    ? ['nifty50']
    : index === 'niftynext50'
      ? ['niftynext50']
      : ['nifty50', 'niftynext50'];

  const groups = await Promise.all(keys.map(fetchIndexSymbols));

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    groups,
  });
}
