import { Candle } from './types';
import { calculateIndicators, TrendScore } from './indicators';
import { calculateMonthlySeasonality, MonthlySeasonalityStats, SEASONALITY_SAMPLE_YEARS } from './seasonality';
import { FundamentalAnalysis } from './types';

export interface YearlySectorPerformance {
  year: number;
  returnPct: number;
  startPrice: number;
  endPrice: number;
}

export type SectorTechnicalLabel = 'Bullish' | 'Bearish' | 'Neutral';

export interface SectorTechnicalAnalysis {
  indexSymbol: string;
  currentPrice?: number;
  trendScore: TrendScore;
  label: SectorTechnicalLabel;
  yearlyPerformance: YearlySectorPerformance[];
  annualizedReturnPct?: number;
  positiveYears: number;
  negativeYears: number;
  monthlySeasonality: MonthlySeasonalityStats[];
  dataQuality: string[];
}

export type SectorFundamentalLabel = 'Fundamentally Strong' | 'Fundamentally Average' | 'Fundamentally Weak' | 'Insufficient Data';

export interface SectorFundamentalAnalysis {
  label: SectorFundamentalLabel;
  avgQualityScore: number;
  avgValueScore: number;
  avgGrowthScore: number;
  avgFinancialHealthScore: number;
  avgOverallScore: number;
  peersEvaluated: number;
  peersRequested: number;
}

function round(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseCandleDate(candle: Candle): Date {
  if (typeof candle.time === 'number') {
    const milliseconds = candle.time > 10_000_000_000 ? candle.time : candle.time * 1000;
    return new Date(milliseconds);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candle.time)) {
    return new Date(`${candle.time}T00:00:00Z`);
  }
  return new Date(candle.time);
}

/**
 * Buckets candles by calendar year and computes each year's open-to-close return - the
 * same technique lib/seasonality.ts uses for months, applied at year granularity for a
 * "sector performance over the last N years" view. The current, still-incomplete year is
 * excluded so a partial year never looks like a full annual return.
 */
export function calculateYearlyPerformance(candles: Candle[], years = 10, asOf: Date = new Date()): YearlySectorPerformance[] {
  const dated = candles
    .map(candle => ({ candle, date: parseCandleDate(candle) }))
    .filter(item => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const currentYear = asOf.getUTCFullYear();
  const buckets = new Map<number, typeof dated>();
  for (const item of dated) {
    const year = item.date.getUTCFullYear();
    if (year >= currentYear) continue; // exclude the current, incomplete year
    const bucket = buckets.get(year) || [];
    bucket.push(item);
    buckets.set(year, bucket);
  }

  const results: YearlySectorPerformance[] = [];
  for (const [year, items] of buckets.entries()) {
    const first = items[0]?.candle;
    const last = items.at(-1)?.candle;
    if (!first || !last || first.open <= 0 || !Number.isFinite(last.close)) continue;
    results.push({
      year,
      returnPct: round(((last.close - first.open) / first.open) * 100),
      startPrice: round(first.open),
      endPrice: round(last.close),
    });
  }

  return results.sort((a, b) => b.year - a.year).slice(0, years);
}

function trendLabelFromScore(score: number): SectorTechnicalLabel {
  if (score >= 15) return 'Bullish';
  if (score <= -15) return 'Bearish';
  return 'Neutral';
}

/**
 * Builds the technical side of a sector's analysis. Two separate candle sets are used
 * deliberately: `trendCandles` should be daily-interval (lib/indicators.ts's EMA20/50/200,
 * RSI, MACD etc. are all tuned assuming daily bars, so feeding it monthly-interval data
 * would silently make those periods mean 20/50/200 months instead) while
 * `longHistoryCandles` should be monthly-interval covering up to 10 years (the range a
 * daily fetch can't reach) - used only for yearly performance and month-wise seasonality,
 * neither of which needs sub-month granularity.
 */
export function buildSectorTechnicalAnalysis(
  indexSymbol: string,
  trendCandles: Candle[],
  longHistoryCandles: Candle[],
  asOf: Date = new Date(),
): SectorTechnicalAnalysis {
  const dataQuality: string[] = [];
  const indicators = calculateIndicators(trendCandles);
  const trendScore = indicators.trendScore;
  const yearlyPerformance = calculateYearlyPerformance(longHistoryCandles, 10, asOf);
  const monthlySeasonality = calculateMonthlySeasonality(longHistoryCandles, SEASONALITY_SAMPLE_YEARS, asOf);

  if (trendCandles.length < 100) {
    dataQuality.push('Limited daily candle history available - the current trend read may be less reliable than usual.');
  }
  if (yearlyPerformance.length < 10) {
    dataQuality.push(`Only ${yearlyPerformance.length} of the last 10 completed years have data available.`);
  }

  const positiveYears = yearlyPerformance.filter(y => y.returnPct > 0).length;
  const negativeYears = yearlyPerformance.filter(y => y.returnPct < 0).length;

  let annualizedReturnPct: number | undefined;
  if (yearlyPerformance.length >= 2) {
    const oldestToNewest = [...yearlyPerformance].sort((a, b) => a.year - b.year);
    const startPrice = oldestToNewest[0].startPrice;
    const endPrice = oldestToNewest.at(-1)!.endPrice;
    if (startPrice > 0) {
      const totalReturn = endPrice / startPrice;
      annualizedReturnPct = round((Math.pow(totalReturn, 1 / oldestToNewest.length) - 1) * 100);
    }
  }

  return {
    indexSymbol,
    currentPrice: trendCandles.at(-1)?.close ?? longHistoryCandles.at(-1)?.close,
    trendScore,
    label: trendLabelFromScore(trendScore?.score ?? 0),
    yearlyPerformance,
    annualizedReturnPct,
    positiveYears,
    negativeYears,
    monthlySeasonality,
    dataQuality,
  };
}

function fundamentalLabelFromScore(avgOverallScore: number, peersEvaluated: number): SectorFundamentalLabel {
  if (peersEvaluated === 0) return 'Insufficient Data';
  if (avgOverallScore >= 65) return 'Fundamentally Strong';
  if (avgOverallScore <= 40) return 'Fundamentally Weak';
  return 'Fundamentally Average';
}

/**
 * Averages the composite fundamental scores across a handful of sector peers (each
 * already computed by lib/fundamentalScore.ts for one company) into a sector-level read.
 * A peer whose fundamentals couldn't be fetched at all is simply excluded from the
 * average rather than counted as a zero - `peersEvaluated` vs `peersRequested` makes that
 * gap visible instead of silently skewing the average downward.
 */
export function aggregateSectorFundamentals(peerAnalyses: FundamentalAnalysis[], peersRequested: number): SectorFundamentalAnalysis {
  const evaluated = peerAnalyses.filter(a => a.scores.dataCompleteness > 0);
  const avg = (pick: (a: FundamentalAnalysis) => number) => evaluated.length > 0
    ? Math.round(evaluated.reduce((sum, a) => sum + pick(a), 0) / evaluated.length)
    : 0;

  const avgOverallScore = avg(a => a.scores.overallScore);

  return {
    label: fundamentalLabelFromScore(avgOverallScore, evaluated.length),
    avgQualityScore: avg(a => a.scores.qualityScore),
    avgValueScore: avg(a => a.scores.valueScore),
    avgGrowthScore: avg(a => a.scores.growthScore),
    avgFinancialHealthScore: avg(a => a.scores.financialHealthScore),
    avgOverallScore,
    peersEvaluated: evaluated.length,
    peersRequested,
  };
}
