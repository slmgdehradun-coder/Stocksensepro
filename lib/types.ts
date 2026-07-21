export type Exchange = 'NSE' | 'BSE' | 'MCX' | 'US' | 'GLOBAL';

export type TimeFrame = '1m' | '5m' | '15m' | '60m' | '1d' | '1wk' | '1mo';

export const TIME_FRAME_CONFIGS: Record<TimeFrame, { interval: string; range: string; label: string }> = {
  '1m': { interval: '1m', range: '5d', label: '1 Min' },
  '5m': { interval: '5m', range: '1mo', label: '5 Min' },
  '15m': { interval: '15m', range: '1mo', label: '15 Min' },
  '60m': { interval: '60m', range: '3mo', label: '1 Hour' },
  '1d': { interval: '1d', range: '5y', label: '1 Day' },
  '1wk': { interval: '1wk', range: '5y', label: '1 Week' },
  '1mo': { interval: '1mo', range: '10y', label: '1 Month' },
};

export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketDataQuality = 'official' | 'provider' | 'estimated' | 'uploaded';

export interface MarketDataMetadata {
  requestedSymbol: string;
  resolvedSymbol: string;
  exchange: Exchange;
  provider: 'yahoo' | 'csv';
  range: string;
  interval: string;
  fetchedAt: string;
  sourceTimestamp?: string | number;
  currency: string;
  dataQuality: MarketDataQuality;
  fallbackChain: string[];
  warnings: string[];
}

export interface StockData {
  symbol: string;
  candles: Candle[];
  isLive: boolean;
  timeFrame?: TimeFrame;
  currency?: string;
  metadata?: MarketDataMetadata;
}

export interface SymbolCandidate {
  symbol: string;
  label: string;
  exchange: Exchange;
  provider: 'yahoo';
  currency: string;
  assetClass: 'equity' | 'index' | 'commodity' | 'crypto' | 'forex' | 'future' | 'unknown';
  dataQuality: MarketDataQuality;
  note?: string;
}

export interface SymbolResolution {
  requested: string;
  normalized: string;
  exchange: Exchange;
  primary: SymbolCandidate;
  candidates: SymbolCandidate[];
  warnings: string[];
}

export interface MarketSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  exchangeDisplay: string;
  type: string;
  score: number;
  latestPrice?: number;
  currency?: string;
  marketState?: string;
}

// ---------------------------------------------------------------------------
// Fundamentals
// ---------------------------------------------------------------------------

/** Where a given fundamentals snapshot's numbers came from - always kept alongside the
 * data itself so the UI can show provenance and never silently blend sources. */
export type FundamentalDataSource = 'yahoo' | 'sec-edgar';

/**
 * Normalized fundamental data for one company at one reporting period. Every field is
 * optional and left `undefined` (never fabricated/estimated) when the upstream source
 * doesn't provide it - callers must handle missing fields rather than assume presence.
 */
export interface FundamentalSnapshot {
  symbol: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  currency?: string;
  source: FundamentalDataSource;
  fetchedAt: string;
  fiscalPeriodEnd?: string;
  priorFiscalPeriodEnd?: string;

  // Market data
  price?: number;
  marketCap?: number;
  sharesOutstanding?: number;
  beta?: number;
  dividendYield?: number;

  // Income statement (current period + prior period for growth calcs)
  revenue?: number;
  priorRevenue?: number;
  grossProfit?: number;
  priorGrossProfit?: number;
  ebitda?: number;
  ebit?: number;
  netIncome?: number;
  priorNetIncome?: number;
  eps?: number;
  interestExpense?: number;

  // Balance sheet
  totalAssets?: number;
  priorTotalAssets?: number;
  currentAssets?: number;
  priorCurrentAssets?: number;
  currentLiabilities?: number;
  priorCurrentLiabilities?: number;
  totalLiabilities?: number;
  totalDebt?: number;
  priorTotalDebt?: number;
  cash?: number;
  totalEquity?: number;
  priorTotalEquity?: number;
  retainedEarnings?: number;
  inventory?: number;
  priorInventory?: number;
  receivables?: number;
  payables?: number;

  // Cash flow
  operatingCashFlow?: number;
  priorOperatingCashFlow?: number;
  capex?: number;
  freeCashFlow?: number;

  // Share activity (for Piotroski dilution test)
  priorSharesOutstanding?: number;

  warnings: string[];
}

export interface FundamentalRatios {
  // Growth
  revenueGrowthPct?: number;
  netIncomeGrowthPct?: number;
  // Margins
  grossMarginPct?: number;
  ebitdaMarginPct?: number;
  operatingMarginPct?: number;
  netMarginPct?: number;
  // Returns
  roePct?: number;
  roaPct?: number;
  rocePct?: number;
  // Leverage / liquidity
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  interestCoverage?: number;
  // Valuation
  peRatio?: number;
  pbRatio?: number;
  psRatio?: number;
  evToEbitda?: number;
  dividendYieldPct?: number;
  // Cash flow
  freeCashFlow?: number;
  ownerEarnings?: number;
  fcfMarginPct?: number;
}

export interface PiotroskiResult {
  score: number;
  maxScore: 9;
  breakdown: Array<{ label: string; passed: boolean | null; detail: string }>;
}

export interface AltmanZResult {
  score: number | null;
  zone: 'Safe' | 'Grey' | 'Distress' | 'Unavailable';
  detail: string;
}

export interface FundamentalCompositeScores {
  qualityScore: number;
  valueScore: number;
  growthScore: number;
  financialHealthScore: number;
  /** Technical momentum, 0-100, derived from the existing price-trend engine
   * (lib/aiPrediction.ts's trend score, rescaled). Only present when a technical trend
   * score was supplied by the caller - never fabricated when it wasn't. */
  momentumScore?: number;
  overallScore: number;
  dataCompleteness: number;
}

/**
 * Joel Greenblatt's "Magic Formula": ranks companies by a combination of Earnings Yield
 * (EBIT / Enterprise Value - how cheap the operating earnings are) and Return on Capital
 * (EBIT / (Net Working Capital + Net Fixed Assets) - how efficiently the business uses
 * capital). Both figures are shown directly rather than only a percentile rank, since a
 * true percentile needs a full market universe this app doesn't maintain.
 */
export interface MagicFormulaResult {
  earningsYieldPct: number | null;
  returnOnCapitalPct: number | null;
  /** 0-100 composite of the two figures against fixed bands - see fundamentalScore.ts.
   * `null` when either input is unavailable. */
  score: number | null;
  detail: string;
}

/**
 * Benjamin Graham's classic conservative intrinsic-value formula:
 * sqrt(22.5 x EPS x Book Value per Share). 22.5 comes from Graham's own stated ceilings of
 * a 15x P/E and 1.5x P/B multiplied together. This is a simple, well-known reference point
 * - not a substitute for a full valuation - and is only computed when both EPS and book
 * value per share are positive (the formula is undefined otherwise).
 */
export interface GrahamNumberResult {
  grahamNumber: number | null;
  marginOfSafetyPct: number | null;
  detail: string;
}

export type FundamentalVerdict = 'Strong Buy' | 'Buy' | 'Accumulate' | 'Hold' | 'Reduce' | 'Sell' | 'Strong Sell';

export interface FundamentalRecommendation {
  verdict: FundamentalVerdict;
  confidence: number;
  reasoning: string[];
  cautionNotes: string[];
  disclaimer: string;
}

export interface FundamentalAnalysis {
  snapshot: FundamentalSnapshot;
  ratios: FundamentalRatios;
  piotroski: PiotroskiResult;
  altmanZ: AltmanZResult;
  magicFormula: MagicFormulaResult;
  grahamNumber: GrahamNumberResult;
  scores: FundamentalCompositeScores;
  recommendation: FundamentalRecommendation;
}
