import { describe, expect, it } from 'vitest';
import { aggregateSectorFundamentals, buildSectorTechnicalAnalysis, calculateYearlyPerformance } from '@/lib/sectorAnalysis';
import { resolveSectorForStock } from '@/lib/sectors';
import { computeAltmanZScore, computeCompositeScores, computeFundamentalRatios, computePiotroskiScore } from '@/lib/fundamentalScore';
import { Candle, FundamentalAnalysis, FundamentalSnapshot } from '@/lib/types';

function dailyCandles(count: number, drift: number): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + i * drift;
    return { time: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, open: base - 0.5, high: base + 1, low: base - 1, close: base + 0.5, volume: 10000 };
  });
}

function monthlyCandlesTenYears(driftPerYear: number): Candle[] {
  const candles: Candle[] = [];
  let base = 100;
  for (let y = 2016; y < 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const open = base;
      const close = base * (1 + driftPerYear / 12);
      candles.push({ time: `${y}-${String(m).padStart(2, '0')}-01`, open, high: close * 1.02, low: open * 0.98, close, volume: 5000 });
      base = close;
    }
  }
  return candles;
}

describe('calculateYearlyPerformance', () => {
  it('computes an open-to-close return per completed year and excludes the current incomplete year', () => {
    const candles = monthlyCandlesTenYears(12); // roughly +12%/yr compounding within each year
    const withCurrentYear = [...candles, { time: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 }];
    const perf = calculateYearlyPerformance(withCurrentYear, 10, new Date('2026-06-01'));
    expect(perf.every(p => p.year < 2026)).toBe(true);
    expect(perf.length).toBeGreaterThan(0);
  });
});

describe('buildSectorTechnicalAnalysis', () => {
  it('labels a sustained uptrend as Bullish or Neutral, never Bearish', () => {
    const result = buildSectorTechnicalAnalysis('^CNXIT', dailyCandles(260, 0.5), monthlyCandlesTenYears(15), new Date('2026-01-15'));
    expect(['Bullish', 'Neutral']).toContain(result.label);
    expect(result.monthlySeasonality).toHaveLength(12);
    expect(typeof result.annualizedReturnPct).toBe('number');
  });

  it('labels a sustained downtrend as Bearish or Neutral, never Bullish', () => {
    const result = buildSectorTechnicalAnalysis('^CNXMETAL', dailyCandles(260, -0.5), monthlyCandlesTenYears(-10), new Date('2026-01-15'));
    expect(['Bearish', 'Neutral']).toContain(result.label);
  });

  it('does not throw and reports data-quality warnings when history is sparse', () => {
    const result = buildSectorTechnicalAnalysis('^TEST', dailyCandles(10, 0.1), [], new Date());
    expect(result.dataQuality.length).toBeGreaterThan(0);
    expect(result.yearlyPerformance).toHaveLength(0);
  });
});

describe('resolveSectorForStock', () => {
  it('resolves a known NSE stock to its sector via the stock map', () => {
    const result = resolveSectorForStock('RELIANCE', 'NSE');
    expect(result?.sector.name).toBe('Energy');
    expect(result?.matchedVia).toBe('nse-stock');
  });

  it('resolves a US stock via its Yahoo GICS sector label', () => {
    const result = resolveSectorForStock('AAPL', 'US', 'Technology');
    expect(result?.sector.name).toBe('IT');
    expect(result?.matchedVia).toBe('us-gics-sector');
  });

  it('returns null rather than guessing when no mapping exists', () => {
    expect(resolveSectorForStock('SOMETOTALLYUNKNOWNTICKER', 'NSE')).toBeNull();
  });
});

describe('aggregateSectorFundamentals', () => {
  const snapshot: FundamentalSnapshot = {
    symbol: 'PEER', source: 'yahoo', fetchedAt: new Date().toISOString(), warnings: [],
    revenue: 1200, priorRevenue: 1000, netIncome: 200, priorNetIncome: 150,
    totalAssets: 1000, priorTotalAssets: 900, currentAssets: 400, currentLiabilities: 200,
    totalEquity: 600, priorTotalEquity: 500, marketCap: 3000,
  };

  function buildAnalysis(): FundamentalAnalysis {
    const ratios = computeFundamentalRatios(snapshot);
    const piotroski = computePiotroskiScore(snapshot);
    const altmanZ = computeAltmanZScore(snapshot);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    return {
      snapshot, ratios, piotroski, altmanZ, scores,
      magicFormula: { earningsYieldPct: null, returnOnCapitalPct: null, score: null, detail: '' },
      grahamNumber: { grahamNumber: null, marginOfSafetyPct: null, detail: '' },
      recommendation: { verdict: 'Hold', confidence: 0, reasoning: [], cautionNotes: [], disclaimer: '' },
    };
  }

  it('excludes peers with no evaluable data from the average rather than counting them as zero', () => {
    const analysis = buildAnalysis();
    const agg = aggregateSectorFundamentals([analysis, analysis], 3);
    expect(agg.peersEvaluated).toBe(2);
    expect(agg.peersRequested).toBe(3);
    expect(agg.avgOverallScore).toBe(analysis.scores.overallScore);
  });

  it('reports Insufficient Data when no peers could be evaluated', () => {
    const agg = aggregateSectorFundamentals([], 3);
    expect(agg.label).toBe('Insufficient Data');
    expect(agg.peersEvaluated).toBe(0);
  });
});
