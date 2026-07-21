import { FundamentalSnapshot } from '../types';
import { resolveSymbol } from '../symbolResolver';
import { fetchMarketData } from '../marketData';

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
};

// SEC's fair-access policy asks for a descriptive User-Agent identifying the requester
// (name + contact), not a spoofed browser string - see
// https://www.sec.gov/os/webmaster-faq#developers. Set SEC_EDGAR_CONTACT in production.
const SEC_USER_AGENT = process.env.SEC_EDGAR_CONTACT
  ? `StockSensePro/1.0 (${process.env.SEC_EDGAR_CONTACT})`
  : 'StockSensePro/1.0 (contact: set SEC_EDGAR_CONTACT env var)';

interface JsonFetchResult {
  data: any | null;
  status?: number;
  errorSnippet?: string;
}

async function fetchJsonDiag(url: string, headers: Record<string, string>, timeoutMs = 12000): Promise<JsonFetchResult> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      return { data: null, status: response.status, errorSnippet: text.slice(0, 180) };
    }
    if (!text.trim()) {
      return { data: null, status: response.status, errorSnippet: 'empty response body' };
    }
    try {
      return { data: JSON.parse(text), status: response.status };
    } catch {
      return { data: null, status: response.status, errorSnippet: `non-JSON response: ${text.slice(0, 120)}` };
    }
  } catch (err) {
    return { data: null, errorSnippet: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 12000): Promise<any | null> {
  return (await fetchJsonDiag(url, headers, timeoutMs)).data;
}

function num(field: unknown): number | undefined {
  if (field == null) return undefined;
  if (typeof field === 'number') return Number.isFinite(field) ? field : undefined;
  if (typeof field === 'object' && field !== null && 'raw' in field) {
    const raw = (field as { raw?: unknown }).raw;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Yahoo Finance quoteSummary (same host/headers already used for chart data in
// lib/marketData.ts - kept independent here so this module has no risk of touching the
// working price-fetch code path).
//
// Unlike the /v8/finance/chart/ endpoint this app already uses for prices, /v10/finance/
// quoteSummary/ has required a "crumb" (CSRF-style token) + session cookie since Yahoo
// tightened access in 2024 - requests without it get a 401 "Invalid Crumb" response. This
// mirrors the widely-documented workaround (used by yfinance and similar libraries):
//   1. GET https://fc.yahoo.com to obtain a session cookie
//   2. GET https://query1.finance.yahoo.com/v1/test/getcrumb (with that cookie) for a crumb
//   3. Append ?crumb=<crumb> and the Cookie header to the real request
// A no-crumb attempt is tried first since the requirement is inconsistent across
// regions/IPs - the crumb flow only kicks in as a fallback, and the whole thing is
// best-effort: if Yahoo blocks it entirely, the caller gets a clear diagnostic instead of
// a silent empty result.
// ---------------------------------------------------------------------------

interface YahooSession {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}

let yahooSessionCache: YahooSession | null = null;
const YAHOO_SESSION_TTL_MS = 45 * 60 * 1000;

function parseSetCookies(response: Response): string[] {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    const values = getSetCookie.call(response.headers);
    if (values.length > 0) return values;
  }
  const single = response.headers.get('set-cookie');
  if (!single) return [];
  // Some fetch implementations fold multiple Set-Cookie headers into one comma-joined
  // string; splitting naively on ',' would break cookie values with commas in Expires
  // dates, so only split on ", " that precedes a new "name=" pair.
  return single.split(/, (?=[^;]+?=)/);
}

async function collectYahooCookie(): Promise<string | null> {
  const jar = new Map<string, string>();
  let url = 'https://fc.yahoo.com';

  for (let hop = 0; hop < 5; hop++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: YAHOO_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      break;
    }

    for (const raw of parseSetCookies(response)) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = location.startsWith('http') ? location : new URL(location, url).toString();
      continue;
    }
    break;
  }

  if (jar.size === 0) {
    // Fallback source of a session cookie if fc.yahoo.com didn't yield one.
    try {
      const response = await fetch('https://finance.yahoo.com', {
        headers: YAHOO_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      for (const raw of parseSetCookies(response)) {
        const pair = raw.split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    } catch {
      // Both cookie sources failed - jar stays empty, caller treats this as "no session".
    }
  }

  if (jar.size === 0) return null;
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function getYahooSession(): Promise<YahooSession | null> {
  const now = Date.now();
  if (yahooSessionCache && now - yahooSessionCache.fetchedAt < YAHOO_SESSION_TTL_MS) {
    return yahooSessionCache;
  }

  const cookie = await collectYahooCookie();
  if (!cookie) return null;

  for (const host of YAHOO_HOSTS) {
    const result = await fetchJsonDiagText(`https://${host}/v1/test/getcrumb`, { ...YAHOO_HEADERS, Cookie: cookie });
    if (result && result.trim() && !result.includes('<html')) {
      const session: YahooSession = { cookie, crumb: result.trim(), fetchedAt: now };
      yahooSessionCache = session;
      return session;
    }
  }
  return null;
}

async function fetchJsonDiagText(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<string | null> {
  try {
    const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function tryQuoteSummaryRequest(host: string, resolvedSymbol: string, modules: string, session: YahooSession | null): Promise<JsonFetchResult> {
  const url = new URL(`https://${host}/v10/finance/quoteSummary/${encodeURIComponent(resolvedSymbol)}`);
  url.searchParams.set('modules', modules);
  if (session?.crumb) url.searchParams.set('crumb', session.crumb);
  const headers = session?.cookie ? { ...YAHOO_HEADERS, Cookie: session.cookie } : YAHOO_HEADERS;
  return fetchJsonDiag(url.toString(), headers);
}

async function fetchYahooQuoteSummary(resolvedSymbol: string): Promise<{ result: any | null; diagnostics: string[] }> {
  const modules = [
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'incomeStatementHistory',
    'balanceSheetHistory',
    'cashflowStatementHistory',
    'assetProfile',
    'price',
  ].join(',');
  const diagnostics: string[] = [];

  const extractResult = (fetchResult: JsonFetchResult): any | null => {
    const quoteSummary = fetchResult.data?.quoteSummary;
    if (quoteSummary?.error) {
      diagnostics.push(`quoteSummary error: ${JSON.stringify(quoteSummary.error).slice(0, 150)}`);
      return null;
    }
    return quoteSummary?.result?.[0] || null;
  };

  // Phase 1: no crumb - works in some regions/deployments without any auth at all.
  for (const host of YAHOO_HOSTS) {
    const attempt = await tryQuoteSummaryRequest(host, resolvedSymbol, modules, null);
    const result = extractResult(attempt);
    if (result) return { result, diagnostics };
    diagnostics.push(`${host} (no crumb): HTTP ${attempt.status ?? 'network error'} ${attempt.errorSnippet ?? ''}`.trim());
  }

  // Phase 2: Yahoo's quoteSummary now generally requires a crumb+cookie session (see
  // module comment above) - fetch one and retry.
  const session = await getYahooSession();
  if (!session) {
    diagnostics.push('Could not obtain a Yahoo Finance session cookie/crumb (fc.yahoo.com and finance.yahoo.com both failed to set a usable cookie).');
    return { result: null, diagnostics };
  }

  for (const host of YAHOO_HOSTS) {
    const attempt = await tryQuoteSummaryRequest(host, resolvedSymbol, modules, session);
    const result = extractResult(attempt);
    if (result) return { result, diagnostics };
    diagnostics.push(`${host} (with crumb): HTTP ${attempt.status ?? 'network error'} ${attempt.errorSnippet ?? ''}`.trim());
  }

  // The cached session may have gone stale (crumb invalidated server-side) - drop it so
  // the next call fetches a fresh one instead of repeatedly retrying a dead crumb.
  yahooSessionCache = null;

  return { result: null, diagnostics };
}

function normalizeYahoo(symbol: string, result: Record<string, any>): FundamentalSnapshot {
  const warnings: string[] = [];
  const financialData = result.financialData || {};
  const keyStats = result.defaultKeyStatistics || {};
  const summaryDetail = result.summaryDetail || {};
  const assetProfile = result.assetProfile || {};
  const priceModule = result.price || {};

  const incomeHistory: any[] = result.incomeStatementHistory?.incomeStatementHistory || [];
  const balanceHistory: any[] = result.balanceSheetHistory?.balanceSheetStatements || [];
  const cashflowHistory: any[] = result.cashflowStatementHistory?.cashflowStatements || [];

  const income = incomeHistory[0];
  const priorIncome = incomeHistory[1];
  const balance = balanceHistory[0];
  const priorBalance = balanceHistory[1];
  const cashflow = cashflowHistory[0];

  if (!income) warnings.push('Income statement history was not returned by Yahoo Finance for this symbol.');
  if (!balance) warnings.push('Balance sheet history was not returned by Yahoo Finance for this symbol.');
  if (!cashflow) warnings.push('Cash flow statement history was not returned by Yahoo Finance for this symbol.');
  if (!priorIncome || !priorBalance) warnings.push('Prior-year figures are incomplete, so year-over-year comparisons (Piotroski score, growth rates) will be partial.');

  const interestExpenseRaw = num(income?.interestExpense);

  return {
    symbol,
    companyName: priceModule.longName || priceModule.shortName,
    sector: assetProfile.sector,
    industry: assetProfile.industry,
    currency: priceModule.currency,
    source: 'yahoo',
    fetchedAt: new Date().toISOString(),
    fiscalPeriodEnd: income?.endDate?.fmt,
    priorFiscalPeriodEnd: priorIncome?.endDate?.fmt,

    price: num(financialData.currentPrice) ?? num(priceModule.regularMarketPrice),
    marketCap: num(summaryDetail.marketCap) ?? num(priceModule.marketCap),
    sharesOutstanding: num(keyStats.sharesOutstanding),
    beta: num(keyStats.beta),
    dividendYield: num(summaryDetail.dividendYield),

    revenue: num(income?.totalRevenue) ?? num(financialData.totalRevenue),
    priorRevenue: num(priorIncome?.totalRevenue),
    grossProfit: num(income?.grossProfit) ?? num(financialData.grossProfits),
    priorGrossProfit: num(priorIncome?.grossProfit),
    ebitda: num(financialData.ebitda),
    ebit: num(income?.ebit),
    netIncome: num(income?.netIncome) ?? num(keyStats.netIncomeToCommon),
    priorNetIncome: num(priorIncome?.netIncome),
    eps: num(keyStats.trailingEps),
    interestExpense: interestExpenseRaw !== undefined ? Math.abs(interestExpenseRaw) : undefined,

    totalAssets: num(balance?.totalAssets),
    priorTotalAssets: num(priorBalance?.totalAssets),
    currentAssets: num(balance?.totalCurrentAssets),
    priorCurrentAssets: num(priorBalance?.totalCurrentAssets),
    currentLiabilities: num(balance?.totalCurrentLiabilities),
    priorCurrentLiabilities: num(priorBalance?.totalCurrentLiabilities),
    totalLiabilities: num(balance?.totalLiab),
    totalDebt: num(financialData.totalDebt) ?? num(balance?.shortLongTermDebt),
    priorTotalDebt: num(priorBalance?.shortLongTermDebt),
    cash: num(financialData.totalCash) ?? num(balance?.cash),
    totalEquity: num(balance?.totalStockholderEquity),
    priorTotalEquity: num(priorBalance?.totalStockholderEquity),
    retainedEarnings: num(balance?.retainedEarnings),
    inventory: num(balance?.inventory),
    priorInventory: num(priorBalance?.inventory),
    receivables: num(balance?.netReceivables),
    payables: num(balance?.accountsPayable),

    operatingCashFlow: num(cashflow?.totalCashFromOperatingActivities) ?? num(financialData.operatingCashflow),
    priorOperatingCashFlow: undefined,
    capex: num(cashflow?.capitalExpenditures),
    freeCashFlow: num(financialData.freeCashflow),

    priorSharesOutstanding: undefined, // Not exposed by these Yahoo modules.

    warnings,
  };
}

// ---------------------------------------------------------------------------
// SEC EDGAR (US-listed companies only). Fully free, no API key, official source.
// ---------------------------------------------------------------------------

let secTickerMapCache: { at: number; map: Map<string, { cik: string; title: string }> } | null = null;
const SEC_TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getSecTickerMap(): Promise<Map<string, { cik: string; title: string }>> {
  const now = Date.now();
  if (secTickerMapCache && now - secTickerMapCache.at < SEC_TICKER_CACHE_TTL_MS) {
    return secTickerMapCache.map;
  }
  const data = await fetchJson('https://www.sec.gov/files/company_tickers.json', { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' }, 15000);
  const map = new Map<string, { cik: string; title: string }>();
  if (data) {
    for (const entry of Object.values<any>(data)) {
      if (entry?.ticker && entry?.cik_str != null) {
        map.set(String(entry.ticker).toUpperCase(), {
          cik: String(entry.cik_str).padStart(10, '0'),
          title: entry.title,
        });
      }
    }
  }
  secTickerMapCache = { at: now, map };
  return map;
}

function xbrlSeries(facts: any, taxonomy: 'us-gaap' | 'dei', tag: string, unit: string): Array<{ end: string; val: number; form?: string }> {
  const node = facts?.facts?.[taxonomy]?.[tag];
  const units = node?.units?.[unit];
  return Array.isArray(units) ? units : [];
}

/** Tries each tag in order (US-GAAP taxonomy varies by filer) and returns the most recent
 * annual (10-K) value plus the prior year's, or undefined if no tag in the list has data. */
function xbrlLatestTwo(facts: any, tags: string[], unit = 'USD'): { current?: number; prior?: number; currentEnd?: string } {
  for (const tag of tags) {
    const series = xbrlSeries(facts, 'us-gaap', tag, unit);
    if (series.length === 0) continue;
    const annual = series.filter(entry => entry.form === '10-K').sort((a, b) => (a.end < b.end ? 1 : -1));
    const pool = annual.length > 0 ? annual : [...series].sort((a, b) => (a.end < b.end ? 1 : -1));
    if (pool.length > 0) {
      return { current: pool[0]?.val, prior: pool[1]?.val, currentEnd: pool[0]?.end };
    }
  }
  return {};
}

async function fetchSecCompanyFacts(ticker: string): Promise<{ facts: any; companyTitle: string } | null> {
  const map = await getSecTickerMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) return null;
  const data = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`, { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' }, 20000);
  if (!data) return null;
  return { facts: data, companyTitle: entry.title };
}

function normalizeSec(symbol: string, facts: any, companyTitle: string): FundamentalSnapshot {
  const warnings: string[] = ['Sourced from SEC EDGAR XBRL filings (official, but tag coverage varies by filer - some fields may be unavailable even for large companies).'];

  const revenue = xbrlLatestTwo(facts, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet']);
  const netIncome = xbrlLatestTwo(facts, ['NetIncomeLoss', 'ProfitLoss']);
  const grossProfit = xbrlLatestTwo(facts, ['GrossProfit']);
  const operatingIncome = xbrlLatestTwo(facts, ['OperatingIncomeLoss']);
  const assets = xbrlLatestTwo(facts, ['Assets']);
  const currentAssets = xbrlLatestTwo(facts, ['AssetsCurrent']);
  const currentLiabilities = xbrlLatestTwo(facts, ['LiabilitiesCurrent']);
  const totalLiabilities = xbrlLatestTwo(facts, ['Liabilities']);
  const equity = xbrlLatestTwo(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
  const retainedEarnings = xbrlLatestTwo(facts, ['RetainedEarningsAccumulatedDeficit']);
  const cash = xbrlLatestTwo(facts, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
  const inventory = xbrlLatestTwo(facts, ['InventoryNet']);
  const receivables = xbrlLatestTwo(facts, ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent']);
  const payables = xbrlLatestTwo(facts, ['AccountsPayableCurrent']);
  const operatingCashFlow = xbrlLatestTwo(facts, ['NetCashProvidedByUsedInOperatingActivities']);
  const capex = xbrlLatestTwo(facts, ['PaymentsToAcquirePropertyPlantAndEquipment']);
  const interestExpense = xbrlLatestTwo(facts, ['InterestExpense']);
  const eps = xbrlLatestTwo(facts, ['EarningsPerShareDiluted', 'EarningsPerShareBasic']);
  const debtCurrent = xbrlLatestTwo(facts, ['DebtCurrent', 'LongTermDebtCurrent']);
  const debtNoncurrent = xbrlLatestTwo(facts, ['LongTermDebtNoncurrent']);
  const combinedDebt = xbrlLatestTwo(facts, ['DebtLongtermAndShorttermCombinedAmount']);

  const sharesSeries = xbrlSeries(facts, 'dei', 'EntityCommonStockSharesOutstanding', 'shares').sort((a, b) => (a.end < b.end ? 1 : -1));

  if (!revenue.current) warnings.push('Revenue tag not found under any known US-GAAP alias for this filer.');
  if (!equity.current) warnings.push('Stockholders equity tag not found - ROE/PB and some scores will be unavailable.');

  const totalDebtCurrentPeriod = combinedDebt.current
    ?? (debtCurrent.current !== undefined || debtNoncurrent.current !== undefined
      ? (debtCurrent.current ?? 0) + (debtNoncurrent.current ?? 0)
      : undefined);
  const totalDebtPriorPeriod = combinedDebt.prior
    ?? (debtCurrent.prior !== undefined || debtNoncurrent.prior !== undefined
      ? (debtCurrent.prior ?? 0) + (debtNoncurrent.prior ?? 0)
      : undefined);

  return {
    symbol,
    companyName: companyTitle,
    source: 'sec-edgar',
    fetchedAt: new Date().toISOString(),
    fiscalPeriodEnd: revenue.currentEnd,
    currency: 'USD',

    // SEC XBRL company-facts does not include live market price/cap/shares-outstanding -
    // those are filled in by the caller from Yahoo's lightweight price quote when available.
    revenue: revenue.current,
    priorRevenue: revenue.prior,
    grossProfit: grossProfit.current,
    priorGrossProfit: grossProfit.prior,
    ebit: operatingIncome.current,
    netIncome: netIncome.current,
    priorNetIncome: netIncome.prior,
    eps: eps.current,
    interestExpense: interestExpense.current,

    totalAssets: assets.current,
    priorTotalAssets: assets.prior,
    currentAssets: currentAssets.current,
    priorCurrentAssets: currentAssets.prior,
    currentLiabilities: currentLiabilities.current,
    priorCurrentLiabilities: currentLiabilities.prior,
    totalLiabilities: totalLiabilities.current,
    totalDebt: totalDebtCurrentPeriod,
    priorTotalDebt: totalDebtPriorPeriod,
    cash: cash.current,
    totalEquity: equity.current,
    priorTotalEquity: equity.prior,
    retainedEarnings: retainedEarnings.current,
    inventory: inventory.current,
    priorInventory: inventory.prior,
    receivables: receivables.current,
    payables: payables.current,

    operatingCashFlow: operatingCashFlow.current,
    priorOperatingCashFlow: operatingCashFlow.prior,
    capex: capex.current,

    sharesOutstanding: sharesSeries[0]?.val,
    priorSharesOutstanding: sharesSeries[1]?.val,

    warnings,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface FundamentalFetchResult {
  snapshot: FundamentalSnapshot | null;
  error?: string;
}

/**
 * Fetches the latest close price via the same reliable /v8/finance/chart/ code path
 * already used everywhere else in this app (Dashboard, Screener, Portfolio) - unlike
 * /v10/finance/quoteSummary/, this endpoint has not required a crumb/session token and is
 * the proven-working price source. Used here as a robust independent fallback for price
 * and (combined with SEC/Yahoo shares-outstanding) market cap, so a quoteSummary outage or
 * block doesn't leave those fields permanently blank.
 */
async function fetchReliableQuote(resolvedSymbol: string, exchange: 'NSE' | 'BSE' | 'US' | 'GLOBAL' | 'MCX'): Promise<{ price?: number; currency?: string } | null> {
  try {
    const data = await fetchMarketData({ symbol: resolvedSymbol, exchange, timeFrame: '1d' });
    const lastCandle = data.candles.at(-1);
    if (!lastCandle) return null;
    return { price: lastCandle.close, currency: data.currency };
  } catch {
    return null;
  }
}

function computeMarketCap(price: number | undefined, sharesOutstanding: number | undefined): number | undefined {
  if (typeof price !== 'number' || typeof sharesOutstanding !== 'number') return undefined;
  if (!Number.isFinite(price) || !Number.isFinite(sharesOutstanding) || price <= 0 || sharesOutstanding <= 0) return undefined;
  return price * sharesOutstanding;
}

/**
 * Fetches one normalized fundamentals snapshot for a symbol. US-listed tickers try SEC
 * EDGAR first (official, free, no key) and use Yahoo Finance only to fill in live
 * price/market-cap (which EDGAR filings don't carry); everything else uses Yahoo Finance's
 * quoteSummary endpoint. A single snapshot is always built from one primary statement
 * source - figures are never blended across sources for the same ratio.
 */
export async function getFundamentalSnapshot(symbol: string, exchange: string): Promise<FundamentalFetchResult> {
  const resolution = resolveSymbol(symbol, exchange as any);
  const resolvedSymbol = resolution.primary.symbol;
  const resolvedExchange = resolution.primary.exchange;
  const isUS = resolvedExchange === 'US';

  if (isUS) {
    const secResult = await fetchSecCompanyFacts(symbol.trim());
    if (secResult) {
      const snapshot = normalizeSec(resolvedSymbol, secResult.facts, secResult.companyTitle);

      // Live price is fetched via the proven, reliable chart-based path first (works
      // regardless of quoteSummary's crumb requirement) so market cap can be computed as
      // price x shares-outstanding (shares come from SEC's own XBRL dei facts) even if
      // quoteSummary is unavailable - this is what previously left Market Cap and
      // everything that depends on it (Altman Z-Score) stuck on "N/A"/"Unavailable".
      const reliableQuote = await fetchReliableQuote(resolvedSymbol, 'US');
      if (reliableQuote?.price) {
        snapshot.price = reliableQuote.price;
        snapshot.marketCap = computeMarketCap(reliableQuote.price, snapshot.sharesOutstanding);
      }

      // quoteSummary is still tried for the extras it uniquely provides (sector/industry,
      // beta, dividend yield) and as a second source for price/market cap if the reliable
      // fetch above didn't yield one - but it never overwrites a value already set above.
      const { result: yahooResult, diagnostics } = await fetchYahooQuoteSummary(resolvedSymbol);
      if (yahooResult) {
        const priceModule = yahooResult.price || {};
        const summaryDetail = yahooResult.summaryDetail || {};
        const keyStats = yahooResult.defaultKeyStatistics || {};
        if (snapshot.price === undefined) snapshot.price = num(priceModule.regularMarketPrice);
        if (snapshot.marketCap === undefined) snapshot.marketCap = num(summaryDetail.marketCap) ?? num(priceModule.marketCap);
        snapshot.beta = num(keyStats.beta);
        snapshot.dividendYield = num(summaryDetail.dividendYield);
        snapshot.sector = yahooResult.assetProfile?.sector;
        snapshot.industry = yahooResult.assetProfile?.industry;
        if (!snapshot.sharesOutstanding) snapshot.sharesOutstanding = num(keyStats.sharesOutstanding);
      } else if (snapshot.marketCap === undefined) {
        snapshot.warnings.push(`Sector/industry and some valuation extras could not be fetched from Yahoo Finance. (${diagnostics[diagnostics.length - 1] ?? 'no diagnostic available'})`);
      }

      if (snapshot.marketCap === undefined) {
        snapshot.warnings.push('Market cap could not be determined from either live price x shares-outstanding or Yahoo Finance - valuation ratios (PE, PB, EV/EBITDA) and the Altman Z-Score will be unavailable.');
      }

      return { snapshot };
    }
    // Fall through to Yahoo-only if this ticker has no SEC filings (e.g. recent IPO, ADR
    // filer under different rules, or a non-10-K filer).
  }

  const { result: yahooResult, diagnostics } = await fetchYahooQuoteSummary(resolvedSymbol);
  if (!yahooResult) {
    const lastDiagnostic = diagnostics[diagnostics.length - 1];
    return {
      snapshot: null,
      error: `No fundamental data could be fetched for ${symbol} from Yahoo Finance.${lastDiagnostic ? ` Last attempt: ${lastDiagnostic}` : ''} This endpoint occasionally rate-limits or blocks automated requests - try again in a few minutes.`,
    };
  }

  const snapshot = normalizeYahoo(resolvedSymbol, yahooResult);

  // Same robustness fallback as the US/SEC path: if quoteSummary came back but didn't
  // include a usable price/market cap (has happened for some NSE symbols/modules), derive
  // them from the reliable chart-based price and quoteSummary's own shares-outstanding
  // figure rather than leaving Market Cap (and anything depending on it) stuck on "N/A".
  if (snapshot.price === undefined || snapshot.marketCap === undefined) {
    const reliableQuote = await fetchReliableQuote(resolvedSymbol, resolvedExchange as 'NSE' | 'BSE' | 'US' | 'GLOBAL' | 'MCX');
    if (reliableQuote?.price) {
      if (snapshot.price === undefined) snapshot.price = reliableQuote.price;
      if (snapshot.marketCap === undefined) snapshot.marketCap = computeMarketCap(snapshot.price, snapshot.sharesOutstanding);
    }
    if (snapshot.marketCap === undefined) {
      snapshot.warnings.push('Market cap could not be determined; valuation ratios (PE, PB, EV/EBITDA) and the Altman Z-Score will be unavailable.');
    }
  }

  return { snapshot };
}
