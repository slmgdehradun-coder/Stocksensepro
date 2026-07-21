import { describe, expect, it } from 'vitest';
import { computeAltmanZScore, computeCompositeScores, computeFundamentalRatios, computeGrahamNumber, computeMagicFormula, computePiotroskiScore } from '@/lib/fundamentalScore';
import { generateFundamentalRecommendation } from '@/lib/fundamentalRecommendation';
import { FundamentalSnapshot } from '@/lib/types';

function baseSnapshot(overrides: Partial<FundamentalSnapshot>): FundamentalSnapshot {
  return {
    symbol: 'TEST',
    source: 'yahoo',
    fetchedAt: new Date().toISOString(),
    warnings: [],
    ...overrides,
  };
}

const healthyCo = baseSnapshot({
  revenue: 1200, priorRevenue: 1000,
  grossProfit: 600, priorGrossProfit: 480,
  ebit: 300, ebitda: 350,
  netIncome: 200, priorNetIncome: 150,
  totalAssets: 1000, priorTotalAssets: 900,
  currentAssets: 400, priorCurrentAssets: 350,
  currentLiabilities: 200, priorCurrentLiabilities: 220,
  totalLiabilities: 400,
  totalDebt: 150, priorTotalDebt: 200,
  cash: 250,
  totalEquity: 600, priorTotalEquity: 500,
  retainedEarnings: 400,
  inventory: 100, priorInventory: 90,
  operatingCashFlow: 250, capex: 50,
  sharesOutstanding: 100, priorSharesOutstanding: 100,
  marketCap: 3000, interestExpense: 20,
});

const distressedCo = baseSnapshot({
  revenue: 500, priorRevenue: 550,
  grossProfit: 100, priorGrossProfit: 132,
  ebit: -20, ebitda: 10,
  netIncome: -50, priorNetIncome: 10,
  totalAssets: 800, priorTotalAssets: 850,
  currentAssets: 150, priorCurrentAssets: 200,
  currentLiabilities: 300, priorCurrentLiabilities: 250,
  totalLiabilities: 700,
  totalDebt: 500, priorTotalDebt: 400,
  cash: 20,
  totalEquity: 100, priorTotalEquity: 150,
  retainedEarnings: -200,
  inventory: 80, priorInventory: 70,
  operatingCashFlow: -30, capex: 40,
  sharesOutstanding: 120, priorSharesOutstanding: 100,
  marketCap: 200, interestExpense: 40,
});

describe('computeFundamentalRatios', () => {
  it('computes growth, margin, and return ratios for a healthy company', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    expect(ratios.revenueGrowthPct).toBeCloseTo(20, 0);
    expect(ratios.roePct).toBeGreaterThan(25);
    expect(ratios.currentRatio).toBeGreaterThan(1.5);
  });

  it('never fabricates a ratio when its inputs are missing', () => {
    const sparse = baseSnapshot({ revenue: 100, netIncome: 10 });
    const ratios = computeFundamentalRatios(sparse);
    expect(ratios.roePct).toBeUndefined();
    expect(ratios.peRatio).toBeUndefined();
    expect(ratios.currentRatio).toBeUndefined();
  });
});

describe('computePiotroskiScore', () => {
  it('scores a fundamentally improving company highly', () => {
    const result = computePiotroskiScore(healthyCo);
    expect(result.score).toBeGreaterThanOrEqual(7);
    expect(result.maxScore).toBe(9);
    expect(result.breakdown.every(b => b.passed !== null)).toBe(true);
  });

  it('scores a deteriorating company low', () => {
    const result = computePiotroskiScore(distressedCo);
    expect(result.score).toBeLessThanOrEqual(3);
  });

  it('marks a criterion unevaluable rather than failing it when data is missing', () => {
    const sparse = baseSnapshot({ netIncome: 10 });
    const result = computePiotroskiScore(sparse);
    const roaCheck = result.breakdown.find(b => b.label.includes('ROA improved'));
    expect(roaCheck?.passed).toBeNull();
  });
});

describe('computeAltmanZScore', () => {
  it('places a healthy company in the safe or grey zone', () => {
    const result = computeAltmanZScore(healthyCo);
    expect(['Safe', 'Grey']).toContain(result.zone);
    expect(result.score).not.toBeNull();
  });

  it('places a distressed company in the distress zone', () => {
    const result = computeAltmanZScore(distressedCo);
    expect(result.zone).toBe('Distress');
  });

  it('returns Unavailable rather than a guessed score when inputs are missing', () => {
    const sparse = baseSnapshot({ revenue: 100 });
    const result = computeAltmanZScore(sparse);
    expect(result.score).toBeNull();
    expect(result.zone).toBe('Unavailable');
  });
});

describe('computeCompositeScores + generateFundamentalRecommendation', () => {
  it('gives a healthy, growing company a non-bearish verdict', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    const piotroski = computePiotroskiScore(healthyCo);
    const altmanZ = computeAltmanZScore(healthyCo);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    const rec = generateFundamentalRecommendation(scores, ratios, piotroski, altmanZ);

    expect(scores.overallScore).toBeGreaterThanOrEqual(55);
    expect(['Strong Buy', 'Buy', 'Accumulate', 'Hold']).toContain(rec.verdict);
    expect(rec.reasoning.length).toBeGreaterThan(0);
  });

  it('gives a distressed company a non-bullish verdict with caution notes', () => {
    const ratios = computeFundamentalRatios(distressedCo);
    const piotroski = computePiotroskiScore(distressedCo);
    const altmanZ = computeAltmanZScore(distressedCo);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    const rec = generateFundamentalRecommendation(scores, ratios, piotroski, altmanZ);

    expect(scores.overallScore).toBeLessThanOrEqual(45);
    expect(['Hold', 'Reduce', 'Sell', 'Strong Sell']).toContain(rec.verdict);
    expect(rec.cautionNotes.length).toBeGreaterThan(0);
  });

  it('blends in a technical trend score without ever exceeding the confidence bounds', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    const piotroski = computePiotroskiScore(healthyCo);
    const altmanZ = computeAltmanZScore(healthyCo);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    const rec = generateFundamentalRecommendation(scores, ratios, piotroski, altmanZ, 80);

    expect(rec.confidence).toBeGreaterThanOrEqual(15);
    expect(rec.confidence).toBeLessThanOrEqual(90);
    expect(rec.reasoning.some(r => r.toLowerCase().includes('blended'))).toBe(true);
  });

  it('reports low data completeness and includes a caution note for sparse data', () => {
    const sparse = baseSnapshot({ revenue: 100, netIncome: 10 });
    const ratios = computeFundamentalRatios(sparse);
    const piotroski = computePiotroskiScore(sparse);
    const altmanZ = computeAltmanZScore(sparse);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    const rec = generateFundamentalRecommendation(scores, ratios, piotroski, altmanZ);

    expect(scores.dataCompleteness).toBeLessThan(60);
    expect(rec.cautionNotes.some(n => n.toLowerCase().includes('available'))).toBe(true);
  });
});

describe('computeMagicFormula', () => {
  it('computes earnings yield, return on capital, and a 0-100 score for a healthy company', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    const result = computeMagicFormula(healthyCo, ratios.rocePct);
    expect(result.earningsYieldPct).not.toBeNull();
    expect(result.returnOnCapitalPct).not.toBeNull();
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThanOrEqual(0);
    expect(result.score as number).toBeLessThanOrEqual(100);
  });

  it('returns a null score rather than a fabricated one when inputs are missing', () => {
    const sparse = baseSnapshot({});
    const result = computeMagicFormula(sparse, undefined);
    expect(result.score).toBeNull();
  });
});

describe('computeGrahamNumber', () => {
  it('computes sqrt(22.5 x EPS x book value per share) for a company with positive EPS and equity', () => {
    const withEpsAndPrice = baseSnapshot({ ...healthyCo, eps: 2, price: 30 });
    const result = computeGrahamNumber(withEpsAndPrice);
    // sqrt(22.5 * 2 * (600/100)) = sqrt(270) ~= 16.43
    expect(result.grahamNumber).not.toBeNull();
    expect(result.grahamNumber as number).toBeCloseTo(16.43, 1);
    expect(result.marginOfSafetyPct).not.toBeNull();
  });

  it('returns null rather than a fabricated value for negative or missing EPS', () => {
    const negativeEps = baseSnapshot({ ...healthyCo, eps: -1 });
    expect(computeGrahamNumber(negativeEps).grahamNumber).toBeNull();

    const noEps = baseSnapshot({ ...healthyCo, eps: undefined });
    expect(computeGrahamNumber(noEps).grahamNumber).toBeNull();
  });
});

describe('computeCompositeScores momentum blending', () => {
  it('leaves momentumScore undefined and overallScore unchanged when no technical trend score is supplied', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    const piotroski = computePiotroskiScore(healthyCo);
    const altmanZ = computeAltmanZScore(healthyCo);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    expect(scores.momentumScore).toBeUndefined();
  });

  it('rescales a -100..100 technical trend score to 0..100 and folds it into overallScore', () => {
    const ratios = computeFundamentalRatios(healthyCo);
    const piotroski = computePiotroskiScore(healthyCo);
    const altmanZ = computeAltmanZScore(healthyCo);
    const withoutMomentum = computeCompositeScores(ratios, piotroski, altmanZ);
    const withMomentum = computeCompositeScores(ratios, piotroski, altmanZ, 80);

    expect(withMomentum.momentumScore).toBe(90); // (80 + 100) / 2
    expect(withMomentum.overallScore).not.toBe(withoutMomentum.overallScore);
  });
});
