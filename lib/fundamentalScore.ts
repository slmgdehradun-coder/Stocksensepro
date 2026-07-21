import { AltmanZResult, FundamentalCompositeScores, FundamentalRatios, FundamentalSnapshot, GrahamNumberResult, MagicFormulaResult, PiotroskiResult } from './types';

function safeDiv(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return undefined;
  }
  if (denominator === 0) return undefined;
  return numerator / denominator;
}

function pct(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value * 100 : undefined;
}

function average(a: number | undefined, b: number | undefined): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2;
  return a ?? b;
}

/**
 * Every ratio here is computed only from fields actually present on the snapshot - a
 * missing input produces `undefined` for that ratio rather than a guessed value.
 */
export function computeFundamentalRatios(s: FundamentalSnapshot): FundamentalRatios {
  const freeCashFlow = typeof s.operatingCashFlow === 'number' && typeof s.capex === 'number'
    ? s.operatingCashFlow - Math.abs(s.capex)
    : s.freeCashFlow;

  const avgEquity = average(s.totalEquity, s.priorTotalEquity);
  const avgAssets = average(s.totalAssets, s.priorTotalAssets);
  const capitalEmployed = typeof s.totalAssets === 'number' && typeof s.currentLiabilities === 'number'
    ? s.totalAssets - s.currentLiabilities
    : undefined;

  return {
    revenueGrowthPct: pct(safeDiv(
      typeof s.revenue === 'number' && typeof s.priorRevenue === 'number' ? s.revenue - s.priorRevenue : undefined,
      s.priorRevenue !== undefined ? Math.abs(s.priorRevenue) : undefined,
    )),
    netIncomeGrowthPct: pct(safeDiv(
      typeof s.netIncome === 'number' && typeof s.priorNetIncome === 'number' ? s.netIncome - s.priorNetIncome : undefined,
      s.priorNetIncome !== undefined ? Math.abs(s.priorNetIncome) : undefined,
    )),
    grossMarginPct: pct(safeDiv(s.grossProfit, s.revenue)),
    ebitdaMarginPct: pct(safeDiv(s.ebitda, s.revenue)),
    operatingMarginPct: pct(safeDiv(s.ebit, s.revenue)),
    netMarginPct: pct(safeDiv(s.netIncome, s.revenue)),
    roePct: pct(safeDiv(s.netIncome, avgEquity)),
    roaPct: pct(safeDiv(s.netIncome, avgAssets)),
    rocePct: pct(safeDiv(s.ebit, capitalEmployed)),
    debtToEquity: safeDiv(s.totalDebt, s.totalEquity),
    currentRatio: safeDiv(s.currentAssets, s.currentLiabilities),
    quickRatio: safeDiv(
      typeof s.currentAssets === 'number' && typeof s.inventory === 'number' ? s.currentAssets - s.inventory : undefined,
      s.currentLiabilities,
    ),
    interestCoverage: safeDiv(s.ebit, s.interestExpense),
    peRatio: safeDiv(s.marketCap, s.netIncome),
    pbRatio: safeDiv(s.marketCap, s.totalEquity),
    psRatio: safeDiv(s.marketCap, s.revenue),
    evToEbitda: safeDiv(
      typeof s.marketCap === 'number' ? s.marketCap + (s.totalDebt ?? 0) - (s.cash ?? 0) : undefined,
      s.ebitda,
    ),
    dividendYieldPct: pct(s.dividendYield),
    freeCashFlow,
    ownerEarnings: freeCashFlow, // Approximation: true owner earnings needs a maintenance-capex
    // estimate that isn't reliably available from free sources, so free cash flow is used as
    // the closest honest proxy rather than fabricating a maintenance-capex split.
    fcfMarginPct: pct(safeDiv(freeCashFlow, s.revenue)),
  };
}

/**
 * Standard 9-point Piotroski F-Score. Any criterion that can't be evaluated because the
 * underlying (usually prior-period) figures are missing is reported as `passed: null`
 * rather than silently scored as a fail - `score` only counts criteria that were actually
 * evaluated, and `maxScore` always stays 9 so the UI can show "6/9 (3 not evaluable)".
 */
export function computePiotroskiScore(s: FundamentalSnapshot): PiotroskiResult {
  const breakdown: PiotroskiResult['breakdown'] = [];
  const test = (label: string, passed: boolean | null, detail: string) => {
    breakdown.push({ label, passed, detail });
  };

  test(
    'Positive net income',
    typeof s.netIncome === 'number' ? s.netIncome > 0 : null,
    typeof s.netIncome === 'number' ? `Net income: ${s.netIncome.toLocaleString()}` : 'Net income not available.',
  );

  test(
    'Positive operating cash flow',
    typeof s.operatingCashFlow === 'number' ? s.operatingCashFlow > 0 : null,
    typeof s.operatingCashFlow === 'number' ? `Operating cash flow: ${s.operatingCashFlow.toLocaleString()}` : 'Operating cash flow not available.',
  );

  const roaNow = safeDiv(s.netIncome, s.totalAssets);
  const roaPrior = safeDiv(s.priorNetIncome, s.priorTotalAssets);
  test(
    'ROA improved year-over-year',
    typeof roaNow === 'number' && typeof roaPrior === 'number' ? roaNow > roaPrior : null,
    typeof roaNow === 'number' && typeof roaPrior === 'number'
      ? `ROA ${(roaNow * 100).toFixed(1)}% vs prior ${(roaPrior * 100).toFixed(1)}%.`
      : 'Prior-period assets/net income not available.',
  );

  test(
    'Operating cash flow exceeds net income (earnings quality)',
    typeof s.operatingCashFlow === 'number' && typeof s.netIncome === 'number' ? s.operatingCashFlow > s.netIncome : null,
    typeof s.operatingCashFlow === 'number' && typeof s.netIncome === 'number'
      ? `OCF ${s.operatingCashFlow.toLocaleString()} vs net income ${s.netIncome.toLocaleString()}.`
      : 'Operating cash flow or net income not available.',
  );

  const leverageNow = safeDiv(s.totalDebt, s.totalAssets);
  const leveragePrior = safeDiv(s.priorTotalDebt, s.priorTotalAssets);
  test(
    'Leverage (debt/assets) decreased year-over-year',
    typeof leverageNow === 'number' && typeof leveragePrior === 'number' ? leverageNow < leveragePrior : null,
    typeof leverageNow === 'number' && typeof leveragePrior === 'number'
      ? `Debt/Assets ${(leverageNow * 100).toFixed(1)}% vs prior ${(leveragePrior * 100).toFixed(1)}%.`
      : 'Prior-period debt/assets not available.',
  );

  const currentRatioNow = safeDiv(s.currentAssets, s.currentLiabilities);
  const currentRatioPrior = safeDiv(s.priorCurrentAssets, s.priorCurrentLiabilities);
  test(
    'Current ratio improved year-over-year',
    typeof currentRatioNow === 'number' && typeof currentRatioPrior === 'number' ? currentRatioNow > currentRatioPrior : null,
    typeof currentRatioNow === 'number' && typeof currentRatioPrior === 'number'
      ? `Current ratio ${currentRatioNow.toFixed(2)} vs prior ${currentRatioPrior.toFixed(2)}.`
      : 'Prior-period current assets/liabilities not available.',
  );

  test(
    'No new share dilution',
    typeof s.sharesOutstanding === 'number' && typeof s.priorSharesOutstanding === 'number'
      ? s.sharesOutstanding <= s.priorSharesOutstanding * 1.02
      : null,
    typeof s.sharesOutstanding === 'number' && typeof s.priorSharesOutstanding === 'number'
      ? `Shares outstanding ${s.sharesOutstanding.toLocaleString()} vs prior ${s.priorSharesOutstanding.toLocaleString()}.`
      : 'Prior-period share count not available.',
  );

  const grossMarginNow = safeDiv(s.grossProfit, s.revenue);
  const grossMarginPrior = safeDiv(s.priorGrossProfit, s.priorRevenue);
  test(
    'Gross margin improved year-over-year',
    typeof grossMarginNow === 'number' && typeof grossMarginPrior === 'number' ? grossMarginNow > grossMarginPrior : null,
    typeof grossMarginNow === 'number' && typeof grossMarginPrior === 'number'
      ? `Gross margin ${(grossMarginNow * 100).toFixed(1)}% vs prior ${(grossMarginPrior * 100).toFixed(1)}%.`
      : 'Prior-period gross profit not available.',
  );

  const assetTurnoverNow = safeDiv(s.revenue, s.totalAssets);
  const assetTurnoverPrior = safeDiv(s.priorRevenue, s.priorTotalAssets);
  test(
    'Asset turnover improved year-over-year',
    typeof assetTurnoverNow === 'number' && typeof assetTurnoverPrior === 'number' ? assetTurnoverNow > assetTurnoverPrior : null,
    typeof assetTurnoverNow === 'number' && typeof assetTurnoverPrior === 'number'
      ? `Asset turnover ${assetTurnoverNow.toFixed(2)}x vs prior ${assetTurnoverPrior.toFixed(2)}x.`
      : 'Prior-period revenue/assets not available.',
  );

  const score = breakdown.reduce((sum, b) => sum + (b.passed ? 1 : 0), 0);
  return { score, maxScore: 9, breakdown };
}

/**
 * Standard public-company Altman Z-Score: Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E, where
 * A=working capital/assets, B=retained earnings/assets, C=EBIT/assets, D=market cap/total
 * liabilities, E=revenue/assets. Requires retained earnings and market cap, both of which
 * are sometimes unavailable from free sources - in that case this returns 'Unavailable'
 * rather than a fabricated score.
 */
export function computeAltmanZScore(s: FundamentalSnapshot): AltmanZResult {
  const workingCapital = typeof s.currentAssets === 'number' && typeof s.currentLiabilities === 'number'
    ? s.currentAssets - s.currentLiabilities
    : undefined;

  const a = safeDiv(workingCapital, s.totalAssets);
  const b = safeDiv(s.retainedEarnings, s.totalAssets);
  const c = safeDiv(s.ebit, s.totalAssets);
  const d = safeDiv(s.marketCap, s.totalLiabilities);
  const e = safeDiv(s.revenue, s.totalAssets);

  if ([a, b, c, d, e].some(v => typeof v !== 'number')) {
    return {
      score: null,
      zone: 'Unavailable',
      detail: 'One or more required inputs (working capital, retained earnings, EBIT, market cap, total liabilities, total assets, revenue) are not available from the current data source.',
    };
  }

  const score = 1.2 * (a as number) + 1.4 * (b as number) + 3.3 * (c as number) + 0.6 * (d as number) + 1.0 * (e as number);
  const zone: AltmanZResult['zone'] = score >= 2.99 ? 'Safe' : score >= 1.81 ? 'Grey' : 'Distress';

  return {
    score: Math.round(score * 100) / 100,
    zone,
    detail: `Z = ${score.toFixed(2)}. Above 2.99 is conventionally considered a 'safe' zone, 1.81-2.99 is a 'grey' zone, below 1.81 signals elevated distress risk.`,
  };
}

/**
 * Joel Greenblatt's "Magic Formula" (from "The Little Book That Beats the Market"): rank
 * companies by Earnings Yield (EBIT / Enterprise Value) combined with Return on Capital.
 * This implementation uses the same EBIT/Capital-Employed figure already computed as
 * `rocePct` for the Return on Capital leg - Greenblatt's original formula uses a more
 * granular (Net Working Capital + Net Fixed Assets) denominator that isn't reliably
 * splittable from free data sources, so ROCE is used as the closest available proxy
 * rather than approximating the split and risking a worse number. This is stated plainly
 * in the result's `detail` rather than left implicit.
 */
export function computeMagicFormula(s: FundamentalSnapshot, rocePct: number | undefined): MagicFormulaResult {
  const enterpriseValue = typeof s.marketCap === 'number'
    ? s.marketCap + (s.totalDebt ?? 0) - (s.cash ?? 0)
    : undefined;
  const earningsYieldPct = pct(safeDiv(s.ebit, enterpriseValue));

  if (earningsYieldPct === undefined || typeof rocePct !== 'number') {
    return {
      earningsYieldPct: earningsYieldPct ?? null,
      returnOnCapitalPct: typeof rocePct === 'number' ? rocePct : null,
      score: null,
      detail: 'Earnings yield and/or return on capital could not be computed - needs EBIT, market cap, debt, and cash.',
    };
  }

  const eyScore = scoreBand(earningsYieldPct, [2, 5, 8, 12, 18], true);
  const rocScore = scoreBand(rocePct, [5, 10, 15, 20, 25], true);
  const score = eyScore !== undefined && rocScore !== undefined ? clampScore((eyScore + rocScore) / 2) : null;

  return {
    earningsYieldPct,
    returnOnCapitalPct: rocePct,
    score,
    detail: `Earnings yield (EBIT/Enterprise Value) is ${earningsYieldPct.toFixed(1)}%; return on capital (EBIT/Capital Employed, used as the Return-on-Capital leg) is ${rocePct.toFixed(1)}%. Ranked against fixed bands, not a live market-wide percentile.`,
  };
}

/**
 * Benjamin Graham's conservative intrinsic-value formula from "The Intelligent Investor":
 * Graham Number = sqrt(22.5 x EPS x Book Value per Share). The 22.5 constant comes from
 * Graham's own stated ceilings of a 15x P/E and a 1.5x P/B multiplied together. This is a
 * simple, well-known reference point for a conservative "don't overpay" ceiling - not a
 * full valuation - and is only computed when EPS and book value per share are both
 * positive, since the formula is undefined (or economically meaningless) otherwise.
 */
export function computeGrahamNumber(s: FundamentalSnapshot): GrahamNumberResult {
  const bookValuePerShare = safeDiv(s.totalEquity, s.sharesOutstanding);

  if (typeof s.eps !== 'number' || s.eps <= 0 || typeof bookValuePerShare !== 'number' || bookValuePerShare <= 0) {
    return {
      grahamNumber: null,
      marginOfSafetyPct: null,
      detail: 'Graham Number needs positive EPS and a positive book value per share; at least one is unavailable or not positive for this company.',
    };
  }

  const grahamNumber = Math.sqrt(22.5 * s.eps * bookValuePerShare);
  const marginOfSafetyPct = typeof s.price === 'number' && s.price > 0
    ? pct(safeDiv(grahamNumber - s.price, grahamNumber))
    : null;

  return {
    grahamNumber: Math.round(grahamNumber * 100) / 100,
    marginOfSafetyPct: marginOfSafetyPct ?? null,
    detail: `Graham Number = sqrt(22.5 x EPS x Book Value/Share) = ${grahamNumber.toFixed(2)}, assuming ceilings of 15x earnings and 1.5x book value. A simple conservative reference point, not a full valuation.`,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Maps a ratio to a 0-100 score using fixed, documented bands (not a peer percentile
 * rank - a true cross-sectional percentile would need a live universe of peer fundamentals,
 * which isn't reliably available from free sources). `higherIsBetter` controls direction. */
function scoreBand(value: number | undefined, bands: number[], higherIsBetter: boolean): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const ordered = higherIsBetter ? bands : [...bands].reverse();
  const steps = ordered.length;
  for (let i = 0; i < steps; i++) {
    const threshold = ordered[i];
    const passed = higherIsBetter ? value <= threshold : value >= threshold;
    if (passed) return clampScore((i / (steps - 1)) * 100);
  }
  return higherIsBetter ? 100 : 0;
}

function averageDefined(values: Array<number | undefined>): { avg: number; count: number } {
  const defined = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (defined.length === 0) return { avg: 50, count: 0 }; // neutral default when nothing is known
  return { avg: defined.reduce((sum, v) => sum + v, 0) / defined.length, count: defined.length };
}

export function computeCompositeScores(
  ratios: FundamentalRatios,
  piotroski: PiotroskiResult,
  altmanZ: AltmanZResult,
  /** Optional technical trend score (-100..100, from lib/aiPrediction.ts's trend engine).
   * When supplied, it's rescaled to 0-100 and folded into overallScore as a fifth,
   * momentum-focused input; when omitted, overallScore is computed exactly as before -
   * this parameter is purely additive. */
  technicalTrendScore?: number,
): FundamentalCompositeScores {
  // Quality: profitability + earnings quality (Piotroski) + capital efficiency
  const qualityInputs = [
    scoreBand(ratios.roePct, [5, 10, 15, 20, 25], true),
    scoreBand(ratios.rocePct, [5, 10, 15, 20, 25], true),
    scoreBand(ratios.netMarginPct, [0, 5, 10, 15, 20], true),
    piotroski.score > 0 || piotroski.breakdown.some(b => b.passed !== null) ? clampScore((piotroski.score / 9) * 100) : undefined,
  ];
  const { avg: qualityScore } = averageDefined(qualityInputs);

  // Value: cheaper valuation multiples score higher (lower is better -> reversed bands)
  const valueInputs = [
    scoreBand(ratios.peRatio, [10, 15, 20, 30, 45], false),
    scoreBand(ratios.pbRatio, [1, 2, 3, 5, 8], false),
    scoreBand(ratios.evToEbitda, [6, 10, 14, 20, 30], false),
  ];
  const { avg: valueScore } = averageDefined(valueInputs);

  // Growth
  const growthInputs = [
    scoreBand(ratios.revenueGrowthPct, [0, 5, 10, 20, 35], true),
    scoreBand(ratios.netIncomeGrowthPct, [0, 5, 15, 25, 40], true),
  ];
  const { avg: growthScore } = averageDefined(growthInputs);

  // Financial health: leverage, liquidity, solvency
  const healthInputs = [
    scoreBand(ratios.currentRatio, [0.8, 1, 1.5, 2, 3], true),
    scoreBand(ratios.debtToEquity, [0.3, 0.6, 1, 1.5, 2.5], false),
    altmanZ.score !== null ? scoreBand(altmanZ.score, [1.81, 2.2, 2.99, 4, 6], true) : undefined,
  ];
  const { avg: financialHealthScore } = averageDefined(healthInputs);

  const allInputs = [...qualityInputs, ...valueInputs, ...growthInputs, ...healthInputs];
  const { count: definedCount } = averageDefined(allInputs);
  const totalPossibleInputs = allInputs.length;
  const dataCompleteness = clampScore((definedCount / totalPossibleInputs) * 100);

  const momentumScore = typeof technicalTrendScore === 'number' && Number.isFinite(technicalTrendScore)
    ? clampScore(((technicalTrendScore + 100) / 2))
    : undefined;

  const overallScore = momentumScore !== undefined
    ? clampScore(
        qualityScore * 0.25 + valueScore * 0.15 + growthScore * 0.20 + financialHealthScore * 0.20 + momentumScore * 0.20,
      )
    : clampScore(
        qualityScore * 0.3 + valueScore * 0.2 + growthScore * 0.25 + financialHealthScore * 0.25,
      );

  return {
    qualityScore: clampScore(qualityScore),
    valueScore: clampScore(valueScore),
    growthScore: clampScore(growthScore),
    financialHealthScore: clampScore(financialHealthScore),
    momentumScore,
    overallScore,
    dataCompleteness,
  };
}
