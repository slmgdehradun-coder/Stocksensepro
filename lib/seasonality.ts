import { Candle } from './types';

export type SeasonalityIndexGroup = 'NIFTY 50' | 'NIFTY NEXT 50';
export type SeasonalityDirection = 'up' | 'down' | 'flat';
export type SeasonalityConsistency = 'Strong Up' | 'Up' | 'Mixed' | 'Down' | 'Strong Down';

export interface MonthlySeasonalityYear {
  year: number;
  returnPct: number;
  startPrice: number;
  endPrice: number;
  direction: SeasonalityDirection;
}

export interface MonthlySeasonalityStats {
  month: number;
  monthName: string;
  samples: number;
  upYears: number;
  downYears: number;
  flatYears: number;
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  bestReturn: number;
  worstReturn: number;
  bestYear?: number;
  worstYear?: number;
  consistency: SeasonalityConsistency;
  yearly: MonthlySeasonalityYear[];
}

export interface StockSeasonalityResult {
  symbol: string;
  indexGroup: SeasonalityIndexGroup;
  currentPrice?: number;
  bestMonth?: MonthlySeasonalityStats;
  worstMonth?: MonthlySeasonalityStats;
  months: MonthlySeasonalityStats[];
  dataQuality: string[];
}

export const NIFTY_50_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'BAJFINANCE',
  'AXISBANK', 'KOTAKBANK', 'HINDUNILVR', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS', 'M&M', 'ASIANPAINT',
  'TITAN', 'ULTRACEMCO', 'NTPC', 'POWERGRID', 'TATASTEEL', 'COALINDIA', 'BAJAJFINSV', 'HCLTECH',
  'ADANIENT', 'ADANIPORTS', 'ONGC', 'HINDALCO', 'JSWSTEEL', 'GRASIM', 'WIPRO', 'TECHM', 'DRREDDY',
  'CIPLA', 'APOLLOHOSP', 'DIVISLAB', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO', 'TATACONSUM',
  'BRITANNIA', 'NESTLEIND', 'INDUSINDBK', 'HDFCLIFE', 'SBILIFE', 'BPCL', 'SHRIRAMFIN', 'TRENT',
];

export const NIFTY_NEXT_50_SYMBOLS = [
  'ZOMATO', 'JIOFIN', 'BEL', 'HAL', 'PFC', 'RECLTD', 'IRFC', 'JINDALSTEL', 'TVSMOTOR', 'CUMMINSIND',
  'BHEL', 'PNB', 'BANKBARODA', 'TORNTPHARM', 'MAXHEALTH', 'CGPOWER', 'DIXON', 'POLYCAB', 'LUPIN',
  'ABB', 'ADANIENSOL', 'ADANIGREEN', 'ADANIPOWER', 'AMBUJACEM', 'BAJAJHLDNG', 'BOSCHLTD', 'CANBK',
  'MOTHERSON', 'PIDILITIND', 'SHREECEM', 'SIEMENS', 'SOLARINDS', 'TATAPOWER', 'UNIONBANK', 'UNITDSPR',
  'VBL', 'VEDL', 'ZYDUSLIFE', 'GAIL', 'IOC', 'NAUKRI', 'DMART', 'DLF', 'GODREJCP', 'HAVELLS',
  'ICICIGI', 'ICICIPRULI', 'INDIGO', 'JSWENERGY', 'MANKIND',
];

export const SEASONALITY_UNIVERSES: Record<SeasonalityIndexGroup, string[]> = {
  'NIFTY 50': NIFTY_50_SYMBOLS,
  'NIFTY NEXT 50': NIFTY_NEXT_50_SYMBOLS,
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SEASONALITY_SAMPLE_YEARS = 10;

interface DatedCandle {
  candle: Candle;
  date: Date;
}

interface MonthlyBucket {
  year: number;
  month: number;
  candles: DatedCandle[];
}

function round(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseCandleDate(candle: Candle) {
  if (typeof candle.time === 'number') {
    const milliseconds = candle.time > 10_000_000_000 ? candle.time : candle.time * 1000;
    return new Date(milliseconds);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(candle.time)) {
    return new Date(`${candle.time}T00:00:00Z`);
  }

  return new Date(candle.time);
}

function isSameUtcMonth(date: Date, referenceDate: Date) {
  return date.getUTCFullYear() === referenceDate.getUTCFullYear()
    && date.getUTCMonth() === referenceDate.getUTCMonth();
}

function toMonthlyYear(bucket: MonthlyBucket): MonthlySeasonalityYear | null {
  const candles = bucket.candles;
  const first = candles[0]?.candle;
  const last = candles.at(-1)?.candle;
  if (!first || !last || first.open <= 0 || !Number.isFinite(first.open) || !Number.isFinite(last.close)) {
    return null;
  }

  const returnPct = ((last.close - first.open) / first.open) * 100;
  const direction: SeasonalityDirection = Math.abs(returnPct) < 0.05 ? 'flat' : returnPct > 0 ? 'up' : 'down';

  return {
    year: bucket.year,
    returnPct: round(returnPct),
    startPrice: round(first.open),
    endPrice: round(last.close),
    direction,
  };
}

function consistencyFromStats(upYears: number, downYears: number, avgReturn: number, samples: number): SeasonalityConsistency {
  const strongThreshold = Math.max(4, Math.ceil(samples * 0.7));
  const directionalThreshold = Math.max(3, Math.ceil(samples * 0.6));

  if (upYears >= strongThreshold && avgReturn > 0) return 'Strong Up';
  if (upYears >= directionalThreshold && avgReturn > 0) return 'Up';
  if (downYears >= strongThreshold && avgReturn < 0) return 'Strong Down';
  if (downYears >= directionalThreshold && avgReturn < 0) return 'Down';
  return 'Mixed';
}

function emptyMonth(month: number): MonthlySeasonalityStats {
  return {
    month,
    monthName: MONTH_NAMES[month - 1],
    samples: 0,
    upYears: 0,
    downYears: 0,
    flatYears: 0,
    winRate: 0,
    avgReturn: 0,
    medianReturn: 0,
    bestReturn: 0,
    worstReturn: 0,
    consistency: 'Mixed',
    yearly: [],
  };
}

export function calculateMonthlySeasonality(
  candles: Candle[],
  sampleYears = SEASONALITY_SAMPLE_YEARS,
  asOf: Date = new Date()
): MonthlySeasonalityStats[] {
  const validCandles = candles
    .map((candle): DatedCandle | null => {
      const date = parseCandleDate(candle);
      if (Number.isNaN(date.getTime())) return null;
      return { candle, date };
    })
    .filter((item): item is DatedCandle => Boolean(item))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const buckets = new Map<string, MonthlyBucket>();

  for (const item of validCandles) {
    if (isSameUtcMonth(item.date, asOf)) continue;
    const year = item.date.getUTCFullYear();
    const month = item.date.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const bucket = buckets.get(key) || { year, month, candles: [] };
    bucket.candles.push(item);
    buckets.set(key, bucket);
  }

  const monthYears = new Map<number, MonthlySeasonalityYear[]>();
  for (const bucket of buckets.values()) {
    const monthlyYear = toMonthlyYear(bucket);
    if (!monthlyYear) continue;
    const current = monthYears.get(bucket.month) || [];
    current.push(monthlyYear);
    monthYears.set(bucket.month, current);
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const yearly = (monthYears.get(month) || [])
      .sort((a, b) => b.year - a.year)
      .slice(0, sampleYears);

    if (!yearly.length) return emptyMonth(month);

    const returns = yearly.map(item => item.returnPct);
    const upYears = yearly.filter(item => item.direction === 'up').length;
    const downYears = yearly.filter(item => item.direction === 'down').length;
    const flatYears = yearly.length - upYears - downYears;
    const best = yearly.reduce((winner, item) => item.returnPct > winner.returnPct ? item : winner, yearly[0]);
    const worst = yearly.reduce((loser, item) => item.returnPct < loser.returnPct ? item : loser, yearly[0]);
    const avgReturn = round(returns.reduce((sum, value) => sum + value, 0) / returns.length);

    return {
      month,
      monthName: MONTH_NAMES[index],
      samples: yearly.length,
      upYears,
      downYears,
      flatYears,
      winRate: round((upYears / yearly.length) * 100, 1),
      avgReturn,
      medianReturn: round(median(returns)),
      bestReturn: best.returnPct,
      worstReturn: worst.returnPct,
      bestYear: best.year,
      worstYear: worst.year,
      consistency: consistencyFromStats(upYears, downYears, avgReturn, yearly.length),
      yearly,
    };
  });
}

export function summarizeStockSeasonality(
  symbol: string,
  indexGroup: SeasonalityIndexGroup,
  candles: Candle[],
  warnings: string[] = [],
  sampleYears = SEASONALITY_SAMPLE_YEARS,
  asOf: Date = new Date()
): StockSeasonalityResult {
  const months = calculateMonthlySeasonality(candles, sampleYears, asOf);
  const usableMonths = months.filter(month => month.samples > 0);
  const bestMonth = usableMonths.length
    ? usableMonths.reduce((best, month) => month.avgReturn > best.avgReturn ? month : best, usableMonths[0])
    : undefined;
  const worstMonth = usableMonths.length
    ? usableMonths.reduce((worst, month) => month.avgReturn < worst.avgReturn ? month : worst, usableMonths[0])
    : undefined;

  const dataQuality = Array.from(new Set([
    ...warnings,
    candles.length < 80 ? `Limited historical candles available for ${sampleYears}-year seasonality.` : '',
    usableMonths.some(month => month.samples < sampleYears) ? `Some months have fewer than ${sampleYears} completed yearly samples.` : '',
    'Current incomplete month is excluded from seasonality calculations.',
  ].filter(Boolean)));

  return {
    symbol,
    indexGroup,
    currentPrice: candles.at(-1)?.close,
    bestMonth,
    worstMonth,
    months,
    dataQuality,
  };
}
