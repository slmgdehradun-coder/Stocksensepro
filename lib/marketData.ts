import {
  Candle,
  Exchange,
  MarketSearchResult,
  SymbolCandidate,
  StockData,
  TimeFrame,
  TIME_FRAME_CONFIGS,
} from './types';
import { inferCurrency, resolveSymbol } from './symbolResolver';

const YAHOO_CHART_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
};

const MCX_GLOBAL_BENCHMARKS = new Set(['GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F', 'ZN=F', 'ALI=F']);

interface FetchMarketDataInput {
  symbol: string;
  exchange?: Exchange;
  timeFrame?: TimeFrame;
}

interface YahooChartResult {
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open: Array<number | null>;
      high: Array<number | null>;
      low: Array<number | null>;
      close: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: {
      code?: string;
      description?: string;
    };
  };
}

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  typeDisp?: string;
  score?: number;
  regularMarketPrice?: number;
  currency?: string;
  marketState?: string;
}

export class MarketDataError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 502, details: string[] = []) {
    super(message);
    this.name = 'MarketDataError';
    this.status = status;
    this.details = details;
  }
}

function isValidTimeFrame(value: string | null): value is TimeFrame {
  return Boolean(value && value in TIME_FRAME_CONFIGS);
}

function isValidExchange(value: string | null): value is Exchange {
  return value === 'NSE' || value === 'BSE' || value === 'MCX' || value === 'US' || value === 'GLOBAL';
}

export function parseMarketRequest(searchParams: URLSearchParams) {
  const symbol = searchParams.get('symbol')?.trim();
  const exchangeParam = searchParams.get('exchange');
  const timeFrameParam = searchParams.get('timeFrame');

  if (!symbol) {
    throw new MarketDataError('Missing symbol parameter', 400);
  }

  return {
    symbol,
    exchange: isValidExchange(exchangeParam) ? exchangeParam : 'NSE',
    timeFrame: isValidTimeFrame(timeFrameParam) ? timeFrameParam : '1d',
  };
}

async function fetchJsonWithRetry(urls: string[], retriesPerUrl = 2) {
  const errors: string[] = [];

  for (const url of urls) {
    for (let attempt = 1; attempt <= retriesPerUrl; attempt++) {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: YAHOO_HEADERS,
          signal: AbortSignal.timeout(10000),
        });

        const text = await response.text();
        if (!response.ok) {
          errors.push(`${response.status} from ${new URL(url).hostname}: ${text.slice(0, 120)}`);
          if (response.status === 404) break;
        } else if (!text.trim()) {
          errors.push(`Empty response from ${new URL(url).hostname}`);
        } else {
          return JSON.parse(text);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${new URL(url).hostname} attempt ${attempt}: ${message}`);
      }

      if (attempt < retriesPerUrl) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new MarketDataError('Market data provider failed after retries', 502, errors);
}

async function fetchYahooChart(symbol: string, range: string, interval: string): Promise<YahooChartResponse> {
  const urls = YAHOO_CHART_HOSTS.map(host => {
    const params = new URLSearchParams({ range, interval, includePrePost: 'false', events: 'div,splits' });
    return `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
  });

  const data = await fetchJsonWithRetry(urls);
  if (data?.chart?.error) {
    throw new MarketDataError(data.chart.error.description || data.chart.error.code || 'Yahoo Finance returned an error', 404);
  }
  return data;
}

async function fetchUsdInrRate() {
  try {
    const data = await fetchYahooChart('INR=X', '5d', '1d');
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close?.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) || [];
    return result?.meta?.regularMarketPrice || closes.at(-1) || 83.5;
  } catch {
    return 83.5;
  }
}

function commodityInrMultiplier(symbol: string, usdInr: number) {
  if (symbol === 'GC=F') return (10 / 31.1035) * usdInr;
  if (symbol === 'SI=F') return (1000 / 31.1035) * usdInr;
  if (symbol === 'HG=F') return (1 / 0.45359237) * usdInr;
  return usdInr;
}

function isMcxGlobalBenchmark(symbol: string) {
  return MCX_GLOBAL_BENCHMARKS.has(symbol);
}

function normalizeYahooCandles(
  result: YahooChartResult,
  timeFrame: TimeFrame,
  conversionMultiplier = 1
): Candle[] {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!timestamps.length || !quote) return [];

  const isIntraday = timeFrame !== '1d' && timeFrame !== '1wk' && timeFrame !== '1mo';
  const candles: Candle[] = [];
  const seenTimes = new Set<string | number>();

  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];

    if (![open, high, low, close].every(value => typeof value === 'number' && Number.isFinite(value))) {
      continue;
    }

    const timeValue = isIntraday
      ? timestamps[i]
      : new Date(timestamps[i] * 1000).toISOString().split('T')[0];

    if (seenTimes.has(timeValue)) continue;
    seenTimes.add(timeValue);

    candles.push({
      time: timeValue,
      open: (open as number) * conversionMultiplier,
      high: (high as number) * conversionMultiplier,
      low: (low as number) * conversionMultiplier,
      close: (close as number) * conversionMultiplier,
      volume: quote.volume?.[i] || 0,
    });
  }

  return candles;
}

function exchangeTimeZone(exchange: Exchange) {
  if (exchange === 'US') return 'America/New_York';
  if (exchange === 'GLOBAL') return 'UTC';
  return 'Asia/Kolkata';
}

function dateKeyFromDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function candleDateKey(candle: Candle, timeZone: string) {
  if (typeof candle.time === 'number') {
    return dateKeyFromDate(new Date(candle.time * 1000), timeZone);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candle.time)) return candle.time;
  return dateKeyFromDate(new Date(candle.time), timeZone);
}

function aggregateLatestIntradayDay(candles: Candle[], exchange: Exchange) {
  const latest = candles.at(-1);
  if (!latest) return null;

  const timeZone = exchangeTimeZone(exchange);
  const latestDate = candleDateKey(latest, timeZone);
  const dayCandles = candles.filter(candle => candleDateKey(candle, timeZone) === latestDate);
  if (!dayCandles.length) return null;

  return {
    daily: {
      time: latestDate,
      open: dayCandles[0].open,
      high: Math.max(...dayCandles.map(candle => candle.high)),
      low: Math.min(...dayCandles.map(candle => candle.low)),
      close: dayCandles.at(-1)?.close || latest.close,
      volume: dayCandles.reduce((sum, candle) => sum + candle.volume, 0),
    } satisfies Candle,
    sourceTimestamp: latest.time,
  };
}

function shouldOverlayIntraday(candidate: SymbolCandidate, requested: FetchMarketDataInput) {
  if (requested.timeFrame !== '1d') return false;
  if (requested.exchange === 'MCX' && isMcxGlobalBenchmark(candidate.symbol)) return true;
  return ['equity', 'index', 'commodity', 'future', 'unknown'].includes(candidate.assetClass);
}

async function overlayLatestIntradayDailyCandle(
  data: StockData,
  candidate: SymbolCandidate,
  requested: FetchMarketDataInput,
  conversionMultiplier: number
) {
  if (!shouldOverlayIntraday(candidate, requested)) return data;

  try {
    const intraday = await fetchYahooChart(candidate.symbol, '5d', '1m');
    const result = intraday.chart?.result?.[0];
    if (!result) return data;

    const intradayCandles = normalizeYahooCandles(result, '1m', conversionMultiplier);
    const aggregate = aggregateLatestIntradayDay(intradayCandles, requested.exchange || candidate.exchange);
    const lastDaily = data.candles.at(-1);
    if (!aggregate || !lastDaily) return data;

    const nextCandles = [...data.candles];
    const lastDailyDate = String(lastDaily.time);
    const latestDate = String(aggregate.daily.time);
    const warning = `Latest ${candidate.symbol} value uses 1-minute Yahoo intraday candle because the daily candle may update late.`;

    if (latestDate > lastDailyDate) {
      nextCandles.push(aggregate.daily);
    } else if (latestDate === lastDailyDate) {
      nextCandles[nextCandles.length - 1] = {
        time: lastDaily.time,
        open: lastDaily.open || aggregate.daily.open,
        high: Math.max(lastDaily.high, aggregate.daily.high),
        low: Math.min(lastDaily.low, aggregate.daily.low),
        close: aggregate.daily.close,
        volume: Math.max(lastDaily.volume, aggregate.daily.volume),
      };
    } else {
      return data;
    }

    return {
      ...data,
      candles: nextCandles,
      metadata: data.metadata ? {
        ...data.metadata,
        sourceTimestamp: aggregate.sourceTimestamp,
        warnings: Array.from(new Set([...(data.metadata.warnings || []), warning])),
      } : data.metadata,
    };
  } catch {
    return data;
  }
}

async function fetchCandidate(
  candidate: SymbolCandidate,
  requested: FetchMarketDataInput,
  config: { range: string; interval: string }
) {
  const data = await fetchYahooChart(candidate.symbol, config.range, config.interval);
  const result = data.chart?.result?.[0];
  if (!result) {
    throw new MarketDataError(`No chart result for ${candidate.symbol}`, 404);
  }

  let conversionMultiplier = 1;
  const warnings: string[] = [];
  const shouldConvertMcxBenchmark = requested.exchange === 'MCX' && (candidate.dataQuality === 'estimated' || isMcxGlobalBenchmark(candidate.symbol));
  const dataQuality = shouldConvertMcxBenchmark ? 'estimated' : candidate.dataQuality;

  if (shouldConvertMcxBenchmark) {
    const usdInr = await fetchUsdInrRate();
    conversionMultiplier = commodityInrMultiplier(candidate.symbol, usdInr);
    warnings.push(`Using ${candidate.symbol} global benchmark converted with USD/INR ${usdInr.toFixed(2)}. This is an estimate, not official MCX data.`);
  }

  const candles = normalizeYahooCandles(result, requested.timeFrame || '1d', conversionMultiplier);
  if (!candles.length) {
    throw new MarketDataError(`No historical candles returned for ${candidate.symbol}`, 404);
  }

  const currency = shouldConvertMcxBenchmark
    ? 'INR'
    : result.meta?.currency || candidate.currency || inferCurrency(candidate.symbol);

  const stockData = {
    symbol: candidate.symbol,
    candles,
    isLive: true,
    timeFrame: requested.timeFrame,
    currency,
    metadata: {
      requestedSymbol: requested.symbol,
      resolvedSymbol: candidate.symbol,
      exchange: requested.exchange || candidate.exchange,
      provider: 'yahoo' as const,
      range: config.range,
      interval: config.interval,
      fetchedAt: new Date().toISOString(),
      sourceTimestamp: candles.at(-1)?.time,
      currency,
      dataQuality,
      fallbackChain: [candidate.symbol],
      warnings,
    },
  } satisfies StockData;

  return overlayLatestIntradayDailyCandle(stockData, candidate, requested, conversionMultiplier);
}

const US_EXCHANGE_CODES = new Set([
  'NMS',
  'NYQ',
  'ASE',
  'NCM',
  'NGM',
  'PCX',
  'BATS',
  'PNK',
  'NASDAQ',
  'NYSE',
  'NYSE ARCA',
  'AMEX',
]);

interface SearchPriceCacheEntry {
  expiresAt: number;
  latestPrice?: number;
  currency?: string;
}

const searchPriceCache = new Map<string, SearchPriceCacheEntry>();
const SEARCH_PRICE_CACHE_TTL_MS = 60_000;

function searchQueries(query: string, exchange: Exchange, primarySymbol: string) {
  const compact = query.trim().toUpperCase().replace(/\s+/g, '');
  const queries = [primarySymbol, query];

  if (exchange === 'NSE') queries.push(`${compact}.NS`, `${query} NSE`);
  if (exchange === 'BSE') queries.push(`${compact}.BO`, `${query} BSE`);
  if (exchange === 'US') queries.push(`${compact}`, `${query} stock`);

  return Array.from(new Set(queries.filter(Boolean)));
}

function quoteMatchesExchange(quote: YahooSearchQuote, exchange: Exchange) {
  const symbol = quote.symbol || '';
  const yahooExchange = quote.exchange || quote.exchDisp || '';

  if (exchange === 'NSE') return symbol.endsWith('.NS') || symbol.startsWith('^NSE') || symbol === '^INDIAVIX';
  if (exchange === 'BSE') return symbol.endsWith('.BO') || symbol === '^BSESN';
  if (exchange === 'US') {
    return US_EXCHANGE_CODES.has(yahooExchange.toUpperCase()) || (!symbol.includes('.') && !symbol.includes('=') && quote.currency === 'USD');
  }
  if (exchange === 'MCX') return symbol.endsWith('.NS') || symbol.includes('=F');
  return true;
}

function rankedSearchResults(results: MarketSearchResult[], exchange: Exchange) {
  return results
    .map(result => {
      const exchangeBoost = exchange === 'NSE' && result.symbol.endsWith('.NS') ? 500
        : exchange === 'BSE' && result.symbol.endsWith('.BO') ? 500
          : exchange === 'US' && (US_EXCHANGE_CODES.has(result.exchange.toUpperCase()) || result.currency === 'USD') ? 500
            : exchange === 'MCX' && result.exchange === 'MCX' ? 10_000_000
            : 0;
      const priceBoost = typeof result.latestPrice === 'number' ? 25 : 0;
      return { ...result, score: result.score + exchangeBoost + priceBoost };
    })
    .sort((a, b) => b.score - a.score);
}

async function getLatestSearchPrice(symbol: string): Promise<SearchPriceCacheEntry> {
  const cached = searchPriceCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  try {
    const data = await fetchYahooChart(symbol, '5d', '1m');
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close?.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) || [];
    const latestPrice = result?.meta?.regularMarketPrice || closes.at(-1);
    const payload: SearchPriceCacheEntry = {
      expiresAt: Date.now() + SEARCH_PRICE_CACHE_TTL_MS,
      latestPrice,
      currency: result?.meta?.currency,
    };
    searchPriceCache.set(symbol, payload);
    return payload;
  } catch {
    const payload: SearchPriceCacheEntry = { expiresAt: Date.now() + 15_000 };
    searchPriceCache.set(symbol, payload);
    return payload;
  }
}

async function enrichSearchResultsWithPrices(results: MarketSearchResult[]) {
  const enriched = [...results];
  const topWithoutPrice = enriched
    .map((result, index) => ({ result, index }))
    .filter(item => typeof item.result.latestPrice !== 'number')
    .slice(0, 5);

  await Promise.all(topWithoutPrice.map(async ({ result, index }) => {
    const quote = await getLatestSearchPrice(result.symbol);
    if (typeof quote.latestPrice === 'number') {
      enriched[index] = {
        ...result,
        latestPrice: quote.latestPrice,
        currency: result.currency || quote.currency,
      };
    }
  }));

  return enriched;
}

async function mcxCanonicalSearchResult(query: string, resolution: ReturnType<typeof resolveSymbol>): Promise<MarketSearchResult | null> {
  const commodity = resolution.candidates.find(candidate => candidate.exchange === 'MCX' && candidate.assetClass === 'commodity');
  if (!commodity) return null;

  const symbol = resolution.normalized || query.trim().toUpperCase();
  const result: MarketSearchResult = {
    symbol,
    name: `${commodity.label} (MCX estimate)`,
    exchange: 'MCX',
    exchangeDisplay: 'MCX',
    type: 'commodity',
    score: 20_000_000,
    currency: 'INR',
  };

  try {
    const data = await fetchMarketData({ symbol, exchange: 'MCX', timeFrame: '1m' });
    result.latestPrice = data.candles.at(-1)?.close;
    result.currency = data.currency || 'INR';
  } catch {
    // Suggestions still work even if the quote provider is unavailable.
  }

  return result;
}

export async function fetchMarketData(input: FetchMarketDataInput): Promise<StockData> {
  const timeFrame = input.timeFrame || '1d';
  const exchange = input.exchange || 'NSE';
  const config = TIME_FRAME_CONFIGS[timeFrame];
  const resolution = resolveSymbol(input.symbol, exchange);
  const errors: string[] = [];
  const attempted: string[] = [];

  for (const candidate of resolution.candidates) {
    attempted.push(candidate.symbol);
    try {
      const data = await fetchCandidate(candidate, { ...input, exchange, timeFrame }, config);
      data.metadata = {
        ...data.metadata!,
        fallbackChain: attempted,
        warnings: [...resolution.warnings, ...(data.metadata?.warnings || [])],
      };
      return data;
    } catch (error) {
      const message = error instanceof MarketDataError ? error.message : error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.symbol}: ${message}`);
    }
  }

  throw new MarketDataError(`No market data found for ${input.symbol}`, 404, errors);
}

export async function searchMarketSymbols(query: string, exchange: Exchange = 'NSE'): Promise<MarketSearchResult[]> {
  const resolution = resolveSymbol(query, exchange);
  const q = resolution.primary.symbol;
  const urls = searchQueries(query, exchange, q).map(item =>
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(item)}&quotesCount=12&newsCount=0`
  );

  const results: MarketSearchResult[] = [];
  const seen = new Set<string>();

  if (exchange === 'MCX') {
    const canonical = await mcxCanonicalSearchResult(query, resolution);
    if (canonical) {
      seen.add(canonical.symbol);
      results.push(canonical);
    }
  }

  for (const url of urls) {
    try {
      const data = await fetchJsonWithRetry([url], 1);
      const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
      for (const quote of quotes as YahooSearchQuote[]) {
        if (!quote?.symbol || seen.has(quote.symbol)) continue;
        if (exchange !== 'GLOBAL' && !quoteMatchesExchange(quote, exchange)) continue;
        seen.add(quote.symbol);
        results.push({
          symbol: quote.symbol,
          name: quote.shortname || quote.longname || quote.symbol,
          exchange: quote.exchange || '',
          exchangeDisplay: quote.exchDisp || quote.exchange || '',
          type: quote.quoteType || quote.typeDisp || 'unknown',
          score: Number(quote.score || 0),
          latestPrice: typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : undefined,
          currency: quote.currency,
          marketState: quote.marketState,
        });
      }
    } catch {
      // Search suggestions are best-effort; route callers still receive resolver candidates below.
    }
  }

  for (const candidate of resolution.candidates) {
    if (seen.has(candidate.symbol)) continue;
    seen.add(candidate.symbol);
    results.unshift({
      symbol: candidate.symbol,
      name: candidate.label,
      exchange: candidate.exchange,
      exchangeDisplay: candidate.exchange,
      type: candidate.assetClass,
      score: 1,
      currency: candidate.currency,
    });
  }

  const ranked = rankedSearchResults(results, exchange).slice(0, 12);
  return enrichSearchResultsWithPrices(ranked);
}
