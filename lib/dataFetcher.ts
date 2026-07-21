import { Candle, Exchange, StockData, TimeFrame, TIME_FRAME_CONFIGS } from './types';

export type { Candle, Exchange, StockData, TimeFrame };
export { TIME_FRAME_CONFIGS };

export async function fetchYahooFinanceData(
  symbol: string,
  exchange: Exchange = 'NSE',
  timeFrame: TimeFrame = '1d'
): Promise<StockData> {
  const params = new URLSearchParams({ symbol, exchange, timeFrame });
  const response = await fetch(`/api/market?${params.toString()}`, {
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const details = Array.isArray(data?.details) && data.details.length > 0
      ? ` ${data.details.slice(0, 2).join(' | ')}`
      : '';
    throw new Error(`${data?.error || `Market data request failed with ${response.status}`}${details}`);
  }

  if (!data || !Array.isArray(data.candles)) {
    throw new Error('Market data response was invalid.');
  }

  return data as StockData;
}

function parseNumber(value: string | undefined) {
  if (!value) return Number.NaN;
  return Number(value.replace(/,/g, '').trim());
}

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
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

export function parseCSVData(csvText: string, filename: string): StockData {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV file does not contain enough rows.');
  }

  const headers = splitCsvLine(lines[0]).map(header => header.trim().toLowerCase());
  const dateIdx = headers.findIndex(header => header.includes('date') || header.includes('timestamp'));
  const openIdx = headers.findIndex(header => header.includes('open'));
  const highIdx = headers.findIndex(header => header.includes('high'));
  const lowIdx = headers.findIndex(header => header.includes('low'));
  const closeIdx = headers.findIndex(header => header.includes('close') && !header.includes('adj'));
  const volIdx = headers.findIndex(header => header.includes('volume') || header.includes('tottrdqty'));

  if ([dateIdx, openIdx, highIdx, lowIdx, closeIdx].some(index => index === -1)) {
    throw new Error('Invalid CSV format. Required columns: Date, Open, High, Low, Close.');
  }

  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    const dateStr = row[dateIdx]?.trim();
    let dateObj = new Date(dateStr);

    if (Number.isNaN(dateObj.getTime()) && dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        dateObj = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
      }
    }

    const open = parseNumber(row[openIdx]);
    const high = parseNumber(row[highIdx]);
    const low = parseNumber(row[lowIdx]);
    const close = parseNumber(row[closeIdx]);

    if (Number.isNaN(dateObj.getTime()) || [open, high, low, close].some(value => !Number.isFinite(value))) {
      continue;
    }

    candles.push({
      time: dateObj.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      volume: volIdx !== -1 ? parseNumber(row[volIdx]) || 0 : 0,
    });
  }

  candles.sort((a, b) => {
    const timeA = typeof a.time === 'number' ? a.time * 1000 : new Date(a.time).getTime();
    const timeB = typeof b.time === 'number' ? b.time * 1000 : new Date(b.time).getTime();
    return timeA - timeB;
  });

  if (candles.length === 0) {
    throw new Error('CSV did not contain any valid OHLC rows.');
  }

  const now = new Date().toISOString();
  const symbol = filename.replace(/\.csv$/i, '');

  return {
    symbol,
    candles,
    isLive: false,
    timeFrame: '1d',
    currency: 'INR',
    metadata: {
      requestedSymbol: symbol,
      resolvedSymbol: symbol,
      exchange: 'GLOBAL',
      provider: 'csv',
      range: 'uploaded',
      interval: '1d',
      fetchedAt: now,
      sourceTimestamp: candles.at(-1)?.time,
      currency: 'INR',
      dataQuality: 'uploaded',
      fallbackChain: [symbol],
      warnings: ['Uploaded CSV data is user supplied and has not been independently validated.'],
    },
  };
}
