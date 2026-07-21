import { describe, expect, it } from 'vitest';
import { computeMarketRegime, computeRelativeStrength, generateAIPrediction } from '@/lib/aiPrediction';
import { IndicatorSet } from '@/lib/indicators';
import { Candle } from '@/lib/types';

function candlesWithLiveMove(signalClose: number, liveClose: number): Candle[] {
  return Array.from({ length: 60 }, (_, index) => {
    const isSignal = index === 58;
    const isLive = index === 59;
    const close = isLive ? liveClose : isSignal ? signalClose : 90 + index * 0.3;
    return {
      time: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + index,
    };
  });
}

function bullishIndicators(): IndicatorSet {
  return {
    ema20: [100, 101],
    ema50: [95, 96],
    ema200: [90, 91],
    sma50: [],
    sma200: [],
    rsi: [55, 56],
    macd: [
      { histogram: 1 },
      { histogram: 2 },
    ],
    bb: [{ middle: 100, upper: 130, lower: 80 }],
    vwap: [100, 101],
    atr: [8, 8],
    stoch: [{ k: 55, d: 50 }],
    adx: [{ adx: 30, pdi: 25, mdi: 10 }],
    pivotPoints: [],
    supportResistance: [
      { price: 98, touches: 3, type: 'support', distancePct: -10 },
      { price: 115, touches: 3, type: 'resistance', distancePct: 4 },
    ],
    trendScore: { score: 100, label: 'Strong Bullish', reasons: [] },
  };
}

function weakBearishIndicators(): IndicatorSet {
  return {
    ...bullishIndicators(),
    ema20: [130, 129],
    ema50: [125, 124],
    ema200: [100, 100],
    rsi: [45, 44],
    macd: [
      { histogram: -0.5 },
      { histogram: -0.8 },
    ],
    vwap: [125, 125],
    atr: [5, 5],
    supportResistance: [
      { price: 115, touches: 3, type: 'support', distancePct: -4 },
      { price: 132, touches: 3, type: 'resistance', distancePct: 10 },
    ],
    trendScore: { score: 0, label: 'Neutral', reasons: [] },
  };
}

describe('generateAIPrediction risk levels', () => {
  it('keeps a buy target above the latest live close when the old resistance was already crossed', () => {
    const candles = candlesWithLiveMove(110, 120);
    const prediction = generateAIPrediction(candles, [], bullishIndicators(), []);

    expect(prediction?.signal).toContain('Buy');
    expect(prediction?.targetPrice).toBeGreaterThan(120);
    expect(prediction?.stopLoss).toBeLessThan(120);
    expect(prediction?.logicBias).toBe('bullish');
    expect(prediction?.bullishReasons.length).toBeGreaterThan(0);
    expect(prediction?.scoreBreakdown.length).toBeGreaterThan(0);
  });

  it('keeps a weak bearish neutral target below the latest live close', () => {
    const candles = candlesWithLiveMove(120, 121);
    const prediction = generateAIPrediction(candles, [], weakBearishIndicators(), []);

    expect(prediction?.signal).toBe('Neutral');
    expect(prediction?.score).toBeLessThan(0);
    expect(prediction?.logicBias).toBe('bearish');
    expect(prediction?.bearishReasons.length).toBeGreaterThan(0);
    expect(prediction?.targetPrice).toBeLessThan(121);
    expect(prediction?.stopLoss).toBeGreaterThan(121);
  });

  it('reproduces the exact single-timeframe result when context is omitted', () => {
    const candles = candlesWithLiveMove(110, 120);
    const withoutContext = generateAIPrediction(candles, [], bullishIndicators(), []);
    const withUndefinedContext = generateAIPrediction(candles, [], bullishIndicators(), [], undefined);

    expect(withoutContext).toEqual(withUndefinedContext);
    expect(withoutContext?.higherTimeframeAlignment).toBe('unavailable');
    expect(withoutContext?.marketRegime).toBeUndefined();
    expect(withoutContext?.relativeStrength).toBeUndefined();
  });
});

describe('generateAIPrediction trade plan (T1/T2/T3 and risk-reward guarantee)', () => {
  it('guarantees a minimum 2R main target even when the nearest resistance sits just above entry and the nearest support sits far below (the exact case that previously produced an inverted risk-reward)', () => {
    const candles = candlesWithLiveMove(110, 120);
    const indicators = bullishIndicators();
    // Adversarial levels: resistance 1% above entry, support 15% below entry.
    indicators.supportResistance = [
      { price: 120 * 0.85, touches: 4, type: 'support', distancePct: -15 },
      { price: 120 * 1.01, touches: 4, type: 'resistance', distancePct: 1 },
    ];
    const prediction = generateAIPrediction(candles, [], indicators, []);
    const plan = prediction?.tradePlan;

    expect(plan).toBeDefined();
    expect(plan!.target1.rMultiple).toBeGreaterThanOrEqual(0.999);
    expect(plan!.target2.rMultiple).toBeGreaterThanOrEqual(1.999);
    expect(plan!.target3.rMultiple).toBeGreaterThanOrEqual(2.999);
    expect(prediction!.riskRewardRatio).toBeGreaterThanOrEqual(1.999);

    // The stop must not have been dragged out to the distant 15%-away support level.
    const stopDistancePct = Math.abs(plan!.entry - plan!.stopLoss) / plan!.entry * 100;
    expect(stopDistancePct).toBeLessThan(5);
  });

  it('orders T1 < T2 < T3 above entry for a bullish setup, and produces the mirror order below entry for a bearish one', () => {
    const bullish = generateAIPrediction(candlesWithLiveMove(110, 120), [], bullishIndicators(), [])!;
    expect(bullish.tradePlan!.entry).toBeLessThan(bullish.tradePlan!.target1.price);
    expect(bullish.tradePlan!.target1.price).toBeLessThan(bullish.tradePlan!.target2.price);
    expect(bullish.tradePlan!.target2.price).toBeLessThan(bullish.tradePlan!.target3.price);
    expect(bullish.tradePlan!.stopLoss).toBeLessThan(bullish.tradePlan!.entry);

    const bearishIndicators2 = weakBearishIndicators();
    bearishIndicators2.trendScore = { score: -70, label: 'Strong Bearish', reasons: [] };
    const bearish = generateAIPrediction(candlesWithLiveMove(120, 110), [], bearishIndicators2, [])!;
    expect(bearish.tradePlan!.entry).toBeGreaterThan(bearish.tradePlan!.target1.price);
    expect(bearish.tradePlan!.target1.price).toBeGreaterThan(bearish.tradePlan!.target2.price);
    expect(bearish.tradePlan!.target2.price).toBeGreaterThan(bearish.tradePlan!.target3.price);
    expect(bearish.tradePlan!.stopLoss).toBeGreaterThan(bearish.tradePlan!.entry);
  });

  it('still guarantees the minimum R-multiples with no support/resistance levels available at all', () => {
    const indicators = bullishIndicators();
    indicators.supportResistance = [];
    const prediction = generateAIPrediction(candlesWithLiveMove(110, 120), [], indicators, []);
    expect(prediction?.tradePlan?.target2.rMultiple).toBeGreaterThanOrEqual(1.999);
  });

  it('includes actionable scale-out guidance text on every target tier', () => {
    const prediction = generateAIPrediction(candlesWithLiveMove(110, 120), [], bullishIndicators(), []);
    expect(prediction?.tradePlan?.target1.guidance).toBeTruthy();
    expect(prediction?.tradePlan?.target2.guidance).toBeTruthy();
    expect(prediction?.tradePlan?.target3.guidance).toBeTruthy();
  });
});

describe('generateAIPrediction with market context', () => {
  it('boosts confidence and confluence when a higher timeframe trend agrees', () => {
    const candles = candlesWithLiveMove(110, 120);
    const base = generateAIPrediction(candles, [], bullishIndicators(), []);
    const withAlignedTrend = generateAIPrediction(candles, [], bullishIndicators(), [], {
      higherTimeframeTrend: { score: 70, label: 'Strong Bullish', reasons: [] },
    });

    expect(withAlignedTrend?.higherTimeframeAlignment).toBe('aligned');
    expect(withAlignedTrend!.score).toBeGreaterThan(base!.score);
    expect(withAlignedTrend?.signal).toContain('Buy');
  });

  it('flags a conflict and adds a risk note when timeframes disagree', () => {
    const candles = candlesWithLiveMove(110, 120);
    const withConflict = generateAIPrediction(candles, [], bullishIndicators(), [], {
      higherTimeframeTrend: { score: -70, label: 'Strong Bearish', reasons: [] },
    });

    expect(withConflict?.higherTimeframeAlignment).toBe('conflict');
    expect(withConflict?.riskNotes.some(note => note.toLowerCase().includes('conflict'))).toBe(true);
  });

  it('never flips the underlying signal direction from context alone', () => {
    const candles = candlesWithLiveMove(110, 120);
    const withEverythingBearish = generateAIPrediction(candles, [], bullishIndicators(), [], {
      higherTimeframeTrend: { score: -80, label: 'Strong Bearish', reasons: [] },
      marketRegime: { label: 'Risk-Off', score: -60, notes: [] },
      relativeStrength: { lookback: 20, stockReturnPct: -5, benchmarkReturnPct: 5, relativeStrengthPct: -10, label: 'Lagging' },
    });

    // Context can only ever add in the direction the score already points, so a strongly
    // bullish technical setup should still resolve to a bullish/buy outcome.
    expect(withEverythingBearish?.logicBias).toBe('bullish');
  });
});

describe('computeMarketRegime', () => {
  it('returns undefined when no index trend is available', () => {
    expect(computeMarketRegime(undefined, 14)).toBeUndefined();
  });

  it('labels a strong uptrend with calm VIX as Risk-On', () => {
    const regime = computeMarketRegime({ score: 55, label: 'Bullish', reasons: [] }, 11.5);
    expect(regime?.label).toBe('Risk-On');
    expect(regime?.vixZone).toBe('Low');
  });

  it('labels elevated VIX as Choppy regardless of trend direction', () => {
    const regime = computeMarketRegime({ score: 55, label: 'Bullish', reasons: [] }, 26);
    expect(regime?.label).toBe('Choppy');
    expect(regime?.vixZone).toBe('High');
  });

  it('blends NIFTY and Bank NIFTY trend when both are supplied', () => {
    const regime = computeMarketRegime(
      { score: 40, label: 'Bullish', reasons: [] },
      14,
      { score: -40, label: 'Bearish', reasons: [] },
    );
    expect(regime?.score).toBe(Math.round(40 * 0.6 + -40 * 0.4));
  });
});

describe('computeRelativeStrength', () => {
  function flatCandles(count: number, close: number): Candle[] {
    return Array.from({ length: count }, (_, index) => ({
      time: `2025-03-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close, high: close + 1, low: close - 1, close, volume: 1000,
    }));
  }

  it('returns undefined when there are not enough candles for the lookback', () => {
    expect(computeRelativeStrength(flatCandles(5, 100), flatCandles(5, 100), 20)).toBeUndefined();
  });

  it('labels a stock outperforming its benchmark as Leading', () => {
    const stock = flatCandles(25, 100).map((c, i) => ({ ...c, close: 100 + i }));
    const benchmark = flatCandles(25, 100);
    const rs = computeRelativeStrength(stock, benchmark, 20);
    expect(rs?.label).toBe('Leading');
    expect(rs?.relativeStrengthPct).toBeGreaterThan(0);
  });
});
