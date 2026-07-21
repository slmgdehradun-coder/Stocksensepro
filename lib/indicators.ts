import { Candle } from './types';
import { SMA, EMA, RSI, MACD, BollingerBands, VWAP, ATR, Stochastic, ADX } from 'technicalindicators';

export interface PivotPoint {
  pp: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3: number;
  s3: number;
}

export interface SupportResistanceLevel {
  price: number;
  touches: number;
  type: 'support' | 'resistance';
  distancePct: number;
}

export interface TrendScore {
  score: number;
  label: 'Strong Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Strong Bullish';
  reasons: string[];
}

export interface IndicatorSet {
  ema20: number[];
  ema50: number[];
  ema200: number[];
  sma50: number[];
  sma200: number[];
  rsi: number[];
  macd: Array<{ MACD?: number; signal?: number; histogram?: number }>;
  bb: Array<{ middle: number; upper: number; lower: number; pb?: number }>;
  vwap: number[];
  atr: number[];
  stoch: Array<{ k: number; d: number }>;
  adx: Array<{ adx: number; pdi: number; mdi: number }>;
  pivotPoints: PivotPoint[];
  supportResistance: SupportResistanceLevel[];
  trendScore: TrendScore;
}

function latest<T>(values: T[] | undefined, offset = 1) {
  if (!values?.length) return undefined;
  return values[Math.max(0, values.length - offset)];
}

function clampScore(score: number) {
  return Math.max(-100, Math.min(100, Math.round(score)));
}

function labelTrend(score: number): TrendScore['label'] {
  if (score >= 60) return 'Strong Bullish';
  if (score >= 25) return 'Bullish';
  if (score <= -60) return 'Strong Bearish';
  if (score <= -25) return 'Bearish';
  return 'Neutral';
}

export function calculateSupportResistance(candles: Candle[], lookback = 120): SupportResistanceLevel[] {
  const slice = candles.slice(-lookback);
  const currentClose = candles.at(-1)?.close || 0;
  if (slice.length < 10 || currentClose <= 0) return [];

  const tolerance = currentClose * 0.006;
  const buckets: Array<{ price: number; touches: number; type: 'support' | 'resistance' }> = [];

  for (let i = 1; i < slice.length - 1; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    const next = slice[i + 1];
    const levels: Array<{ price: number; type: 'support' | 'resistance' }> = [];

    if (curr.low <= prev.low && curr.low <= next.low) levels.push({ price: curr.low, type: 'support' });
    if (curr.high >= prev.high && curr.high >= next.high) levels.push({ price: curr.high, type: 'resistance' });

    for (const level of levels) {
      const bucket = buckets.find(item => item.type === level.type && Math.abs(item.price - level.price) <= tolerance);
      if (bucket) {
        bucket.price = (bucket.price * bucket.touches + level.price) / (bucket.touches + 1);
        bucket.touches += 1;
      } else {
        buckets.push({ ...level, touches: 1 });
      }
    }
  }

  return buckets
    .filter(item => item.touches >= 2)
    .map(item => ({
      ...item,
      distancePct: ((item.price - currentClose) / currentClose) * 100,
    }))
    .sort((a, b) => b.touches - a.touches || Math.abs(a.distancePct) - Math.abs(b.distancePct))
    .slice(0, 8);
}

function calculateTrendScore(candles: Candle[], indicators: Omit<IndicatorSet, 'trendScore' | 'supportResistance'>): TrendScore {
  const close = candles.at(-1)?.close;
  const prevClose = candles.at(-2)?.close;
  const reasons: string[] = [];
  let score = 0;

  if (!close || !prevClose) {
    return { score: 0, label: 'Neutral', reasons: ['Not enough candles for trend scoring.'] };
  }

  const ema20 = latest(indicators.ema20);
  const ema50 = latest(indicators.ema50);
  const ema200 = latest(indicators.ema200);
  const rsi = latest(indicators.rsi);
  const macd = latest(indicators.macd);
  const adx = latest(indicators.adx);
  const vwap = latest(indicators.vwap);
  const bb = latest(indicators.bb);

  if (ema20 && ema50) {
    if (close > ema20 && ema20 > ema50) {
      score += 25;
      reasons.push('Price is above stacked short-term EMAs.');
    } else if (close < ema20 && ema20 < ema50) {
      score -= 25;
      reasons.push('Price is below stacked short-term EMAs.');
    }
  }

  if (ema200) {
    if (close > ema200) {
      score += 15;
      reasons.push('Price is above the 200 EMA.');
    } else {
      score -= 15;
      reasons.push('Price is below the 200 EMA.');
    }
  }

  if (typeof rsi === 'number') {
    if (rsi > 60 && rsi < 75) score += 12;
    else if (rsi < 40 && rsi > 25) score -= 12;
    else if (rsi >= 75) score -= 8;
    else if (rsi <= 25) score += 8;
  }

  if (macd?.histogram !== undefined) {
    score += macd.histogram >= 0 ? 12 : -12;
    reasons.push(macd.histogram >= 0 ? 'MACD histogram is positive.' : 'MACD histogram is negative.');
  }

  if (adx?.adx && adx.adx > 25) {
    score += score >= 0 ? 10 : -10;
    reasons.push('ADX indicates a stronger trend environment.');
  }

  if (vwap) {
    score += close >= vwap ? 8 : -8;
  }

  if (bb) {
    if (close > bb.upper) score -= 8;
    else if (close < bb.lower) score += 8;
  }

  const finalScore = clampScore(score);
  return {
    score: finalScore,
    label: labelTrend(finalScore),
    reasons,
  };
}

export function calculateIndicators(candles: Candle[]): IndicatorSet {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const ema20 = EMA.calculate({ period: 20, values: closes });
  const ema50 = EMA.calculate({ period: 50, values: closes });
  const ema200 = EMA.calculate({ period: 200, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });
  const sma200 = SMA.calculate({ period: 200, values: closes });
  const rsi = RSI.calculate({ period: 14, values: closes });
  const macd = MACD.calculate({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });
  const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const vwap = VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
  const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const stoch = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
  const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });

  const pivotPoints: PivotPoint[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const pp = (prev.high + prev.low + prev.close) / 3;
    const r1 = 2 * pp - prev.low;
    const s1 = 2 * pp - prev.high;
    const r2 = pp + (prev.high - prev.low);
    const s2 = pp - (prev.high - prev.low);
    const r3 = prev.high + 2 * (pp - prev.low);
    const s3 = prev.low - 2 * (prev.high - pp);
    pivotPoints.push({ pp, r1, s1, r2, s2, r3, s3 });
  }

  const partial = {
    ema20,
    ema50,
    ema200,
    sma50,
    sma200,
    rsi,
    macd,
    bb,
    vwap,
    atr,
    stoch,
    adx,
    pivotPoints,
  };

  return {
    ...partial,
    supportResistance: calculateSupportResistance(candles),
    trendScore: calculateTrendScore(candles, partial),
  };
}
