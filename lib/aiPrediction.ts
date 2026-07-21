import { Candle } from './types';
import { IndicatorSet, TrendScore } from './indicators';

export interface BacktestResult {
  patternName: string;
  totalOccurrences: number;
  bullishCount: number;
  bearishCount: number;
  avgReturn5D: number;
  avgReturn10D: number;
  avgReturn20D: number;
  avgMaxUpside: number;
  avgMaxDownside: number;
  bullishPercent: number;
  winRate: number;
  averageReturn: number;
  maxDrawdown: number;
  confidenceScore: number;
  sampleQuality: 'low' | 'medium' | 'high';
  /** Gross average win / gross average loss on the directional 20-candle return. Capped at 99. */
  profitFactor: number;
  /** Expected directional return per occurrence: (winRate * avgWin) - (lossRate * avgLoss). */
  expectancy: number;
}

export interface ScoreBreakdownItem {
  label: string;
  score: number;
  maxScore: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  detail: string;
}

/**
 * Market-wide context (NIFTY / Bank NIFTY / India VIX) so a single stock's setup can be
 * weighed against the broader tape instead of being evaluated in isolation.
 */
export interface MarketRegime {
  label: 'Risk-On' | 'Risk-Off' | 'Choppy' | 'Neutral';
  score: number;
  vix?: number;
  vixZone?: 'Low' | 'Normal' | 'Elevated' | 'High';
  notes: string[];
}

export interface RelativeStrengthResult {
  lookback: number;
  stockReturnPct: number;
  benchmarkReturnPct: number;
  relativeStrengthPct: number;
  label: 'Leading' | 'Lagging' | 'In-Line';
}

/**
 * Optional extra context a caller can supply to generateAIPrediction for a materially smarter
 * read on a setup. Every field is optional and additive - omitting `context` entirely reproduces
 * the exact behaviour of the single-timeframe, single-stock engine.
 */
export interface PredictionContext {
  marketRegime?: MarketRegime;
  higherTimeframeTrend?: TrendScore;
  relativeStrength?: RelativeStrengthResult;
}

function patternBias(patternName: string): 'bullish' | 'bearish' | 'neutral' {
  const name = patternName.toLowerCase();
  if (name.includes('bearish') || name.includes('shooting') || name.includes('evening')) return 'bearish';
  if (name.includes('bullish') || name.includes('hammer') || name.includes('morning')) return 'bullish';
  return 'neutral';
}

function sampleQuality(total: number): BacktestResult['sampleQuality'] {
  if (total >= 25) return 'high';
  if (total >= 10) return 'medium';
  return 'low';
}

export function backtestPattern(candles: Candle[], patternIndices: number[], patternName: string): BacktestResult {
  let totalOccurrences = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let directionalWins = 0;
  let sumDirectionalReturn = 0;
  let sumReturn5D = 0;
  let sumReturn10D = 0;
  let sumReturn20D = 0;
  let sumMaxUpside = 0;
  let sumMaxDownside = 0;
  let worstDrawdown = 0;
  let sumWinReturn = 0;
  let sumLossReturn = 0;
  let winCount = 0;
  let lossCount = 0;
  const bias = patternBias(patternName);

  for (const idx of patternIndices) {
    if (idx + 20 >= candles.length) continue;
    totalOccurrences++;

    const entryPrice = candles[idx].close;
    if (entryPrice <= 0) continue;

    const price5D = candles[idx + 5].close;
    const price10D = candles[idx + 10].close;
    const price20D = candles[idx + 20].close;

    const return5D = ((price5D - entryPrice) / entryPrice) * 100;
    const return10D = ((price10D - entryPrice) / entryPrice) * 100;
    const return20D = ((price20D - entryPrice) / entryPrice) * 100;
    const directionalReturn20D = bias === 'bearish' ? -return20D : return20D;

    sumReturn5D += return5D;
    sumReturn10D += return10D;
    sumReturn20D += return20D;
    sumDirectionalReturn += directionalReturn20D;

    if (return20D > 0) bullishCount++;
    else bearishCount++;
    if (bias !== 'neutral' && directionalReturn20D > 0) directionalWins++;

    if (directionalReturn20D > 0) {
      sumWinReturn += directionalReturn20D;
      winCount++;
    } else if (directionalReturn20D < 0) {
      sumLossReturn += Math.abs(directionalReturn20D);
      lossCount++;
    }

    let maxUp = 0;
    let maxDown = 0;
    let tradeDrawdown = 0;
    for (let i = 1; i <= 20; i++) {
      const highReturn = ((candles[idx + i].high - entryPrice) / entryPrice) * 100;
      const lowReturn = ((candles[idx + i].low - entryPrice) / entryPrice) * 100;
      if (highReturn > maxUp) maxUp = highReturn;
      if (lowReturn < maxDown) maxDown = lowReturn;

      const adverseMove = bias === 'bearish' ? -highReturn : lowReturn;
      if (adverseMove < tradeDrawdown) tradeDrawdown = adverseMove;
    }

    sumMaxUpside += maxUp;
    sumMaxDownside += maxDown;
    if (tradeDrawdown < worstDrawdown) worstDrawdown = tradeDrawdown;
  }

  const winRate = totalOccurrences > 0
    ? bias === 'neutral'
      ? (bullishCount / totalOccurrences) * 100
      : (directionalWins / totalOccurrences) * 100
    : 0;
  const quality = sampleQuality(totalOccurrences);
  const confidenceScore = Math.round(Math.min(95, winRate * (quality === 'high' ? 1 : quality === 'medium' ? 0.85 : 0.6)));

  const avgWin = winCount > 0 ? sumWinReturn / winCount : 0;
  const avgLoss = lossCount > 0 ? sumLossReturn / lossCount : 0;
  const winRateFraction = winRate / 100;
  const profitFactor = sumLossReturn > 0
    ? Math.min(99, sumWinReturn / sumLossReturn)
    : (sumWinReturn > 0 ? 99 : 0);
  const expectancy = (winRateFraction * avgWin) - ((1 - winRateFraction) * avgLoss);

  return {
    patternName,
    totalOccurrences,
    bullishCount,
    bearishCount,
    avgReturn5D: totalOccurrences > 0 ? sumReturn5D / totalOccurrences : 0,
    avgReturn10D: totalOccurrences > 0 ? sumReturn10D / totalOccurrences : 0,
    avgReturn20D: totalOccurrences > 0 ? sumReturn20D / totalOccurrences : 0,
    avgMaxUpside: totalOccurrences > 0 ? sumMaxUpside / totalOccurrences : 0,
    avgMaxDownside: totalOccurrences > 0 ? sumMaxDownside / totalOccurrences : 0,
    bullishPercent: totalOccurrences > 0 ? (bullishCount / totalOccurrences) * 100 : 0,
    winRate,
    averageReturn: totalOccurrences > 0 ? sumDirectionalReturn / totalOccurrences : 0,
    maxDrawdown: worstDrawdown,
    confidenceScore,
    sampleQuality: quality,
    profitFactor,
    expectancy,
  };
}

function closedValue<T>(values: T[] | undefined, closedOffset = 2) {
  if (!values?.length) return undefined;
  return values[Math.max(0, values.length - closedOffset)];
}

function nearestLevel(levels: IndicatorSet['supportResistance'], close: number, type: 'support' | 'resistance') {
  return levels
    .filter(level => level.type === type && (type === 'support' ? level.price <= close : level.price >= close))
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))[0];
}

/**
 * Where the current ATR sits versus its own recent history (0-100). Used to scale
 * targets/stops wider in unusually volatile conditions and tighter in unusually calm ones,
 * instead of always applying the same fixed ATR multiple.
 */
function atrPercentile(atrSeries: number[] | undefined, currentAtr: number): number {
  if (!atrSeries || atrSeries.length < 20 || !Number.isFinite(currentAtr)) return 50;
  const sample = atrSeries.slice(-100).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (sample.length < 10) return 50;
  const below = sample.filter(value => value <= currentAtr).length;
  return Math.round((below / sample.length) * 100);
}

/**
 * Flags breakouts/breakdowns through a support or resistance level that are not backed by
 * volume, or that show a long rejection wick back inside the range - both are classic
 * false-breakout tells that a raw score-based model would otherwise miss.
 */
function assessBreakoutRisk(
  signalCandle: Candle,
  prevCandle: Candle,
  support?: { price: number },
  resistance?: { price: number },
  avgVolume?: number,
): { risk: boolean; note?: string } {
  const bodyHigh = Math.max(signalCandle.open, signalCandle.close);
  const bodyLow = Math.min(signalCandle.open, signalCandle.close);
  const range = signalCandle.high - signalCandle.low || Math.max(signalCandle.close * 0.001, 0.01);
  const upperWick = signalCandle.high - bodyHigh;
  const lowerWick = bodyLow - signalCandle.low;
  const volumeConfirmed = avgVolume ? signalCandle.volume >= avgVolume * 1.2 : true;

  if (resistance && prevCandle.close <= resistance.price && signalCandle.close > resistance.price) {
    if (!volumeConfirmed || upperWick > range * 0.4) {
      return {
        risk: true,
        note: `Breakout above ${resistance.price.toFixed(2)} lacks strong volume or shows a rejection wick; false-breakout risk is elevated.`,
      };
    }
  }

  if (support && prevCandle.close >= support.price && signalCandle.close < support.price) {
    if (!volumeConfirmed || lowerWick > range * 0.4) {
      return {
        risk: true,
        note: `Breakdown below ${support.price.toFixed(2)} lacks strong volume or shows a rejection wick; false-breakdown risk is elevated.`,
      };
    }
  }

  return { risk: false };
}

/**
 * Combines NIFTY (and optionally Bank NIFTY) trend with India VIX into a single market-regime
 * read. Pass the `trendScore` already produced by calculateIndicators() on index candles -
 * no extra indicator math needed.
 */
export function computeMarketRegime(
  indexTrend: TrendScore | undefined,
  vix?: number,
  bankNiftyTrend?: TrendScore,
): MarketRegime | undefined {
  if (!indexTrend) return undefined;
  const notes: string[] = [];

  let vixZone: MarketRegime['vixZone'];
  if (typeof vix === 'number' && Number.isFinite(vix)) {
    if (vix < 12) vixZone = 'Low';
    else if (vix < 16) vixZone = 'Normal';
    else if (vix < 22) vixZone = 'Elevated';
    else vixZone = 'High';
    notes.push(`India VIX is ${vix.toFixed(1)} (${vixZone.toLowerCase()} volatility zone).`);
  }

  let score = indexTrend.score;
  if (bankNiftyTrend) {
    score = Math.round(indexTrend.score * 0.6 + bankNiftyTrend.score * 0.4);
    notes.push(`NIFTY trend is ${indexTrend.label}; Bank NIFTY trend is ${bankNiftyTrend.label}.`);
  } else {
    notes.push(`NIFTY trend is ${indexTrend.label}.`);
  }

  let label: MarketRegime['label'] = 'Neutral';
  if (vixZone === 'High' || vixZone === 'Elevated') {
    label = 'Choppy';
  } else if (score >= 25) {
    label = 'Risk-On';
  } else if (score <= -25) {
    label = 'Risk-Off';
  }

  return { label, score, vix, vixZone, notes };
}

/**
 * Simple return-differential relative strength versus a benchmark (e.g. NIFTY) over the same
 * number of closed candles. Positive = the stock is leading its benchmark.
 */
export function computeRelativeStrength(
  stockCandles: Candle[],
  benchmarkCandles: Candle[],
  lookback = 20,
): RelativeStrengthResult | undefined {
  if (stockCandles.length < lookback + 1 || benchmarkCandles.length < lookback + 1) return undefined;

  const stockStart = stockCandles[stockCandles.length - 1 - lookback]?.close;
  const stockEnd = stockCandles[stockCandles.length - 1]?.close;
  const benchStart = benchmarkCandles[benchmarkCandles.length - 1 - lookback]?.close;
  const benchEnd = benchmarkCandles[benchmarkCandles.length - 1]?.close;

  if (!stockStart || !stockEnd || !benchStart || !benchEnd) return undefined;

  const stockReturnPct = ((stockEnd - stockStart) / stockStart) * 100;
  const benchmarkReturnPct = ((benchEnd - benchStart) / benchStart) * 100;
  const relativeStrengthPct = stockReturnPct - benchmarkReturnPct;

  const label: RelativeStrengthResult['label'] = relativeStrengthPct > 1.5
    ? 'Leading'
    : relativeStrengthPct < -1.5
      ? 'Lagging'
      : 'In-Line';

  return { lookback, stockReturnPct, benchmarkReturnPct, relativeStrengthPct, label };
}

export interface TradePlanLevel {
  price: number;
  /** Distance from entry expressed in multiples of the initial risk (1R = entry-to-stop
   * distance) - the standard way professional traders size and communicate targets,
   * popularized by Van Tharp's R-multiple framework. */
  rMultiple: number;
  label: string;
  guidance: string;
}

export interface TradePlan {
  entry: number;
  stopLoss: number;
  /** The 1R unit: distance in price from entry to stop. */
  riskPerShare: number;
  target1: TradePlanLevel;
  target2: TradePlanLevel;
  target3: TradePlanLevel;
}

/**
 * Computes a stop-loss and three staged profit targets (T1/T2/T3) for a directional
 * setup, with a hard, structural guarantee: T1 is never closer than 1R, T2 never closer
 * than 2R, T3 never closer than 3R - "R" being the actual risk this specific stop-loss
 * implies, not a fixed percentage. This directly fixes a real failure mode of a purely
 * support/resistance-driven target: a nearby resistance level can sit just 1-2% above
 * entry while the nearest support (used for the stop) sits much further below, producing
 * a risk-reward ratio worse than 1:1 - profitable only with an unrealistically high win
 * rate. Bounding both legs against the ATR-derived risk unit, the way a Minervini-style
 * "never risk more than you can make" rule or Paul Tudor Jones' 5:1 asymmetry principle
 * would, guarantees every generated plan clears a minimum 1:2 reward-to-risk on the main
 * target before technical levels are even considered.
 *
 * Support/resistance still matters: when a real technical level falls beyond the R-based
 * minimum for that tier, it's used (a genuine resistance level is more informative than
 * an arbitrary ATR multiple) - it just can never pull a target inside the minimum, or
 * push a stop beyond a sane maximum.
 */
function buildTradePlan(
  signal: string,
  score: number,
  referenceClose: number,
  liveClose: number,
  atr: number,
  support?: { price: number },
  resistance?: { price: number },
): TradePlan {
  const entry = liveClose > 0 ? liveClose : referenceClose;
  const isBuy = signal.includes('Buy') || (!signal.includes('Sell') && score > 0);

  // Risk unit: bounded to a sane band around the instrument's own recent volatility so a
  // stop is never noise-tight (< 0.8x ATR) nor unreasonably loose (> 2.2x ATR), regardless
  // of how far away a matched support/resistance level happens to sit.
  const minRisk = Math.max(atr * 0.8, entry * 0.006);
  const maxRisk = Math.max(atr * 2.2, entry * 0.02);

  const levelDistance = isBuy
    ? (support?.price && support.price < entry ? entry - support.price : undefined)
    : (resistance?.price && resistance.price > entry ? resistance.price - entry : undefined);

  const riskPerShare = Math.min(maxRisk, Math.max(minRisk, levelDistance ?? atr * 1.5));
  const stopLoss = isBuy ? entry - riskPerShare : entry + riskPerShare;

  const oppositeLevelDistance = isBuy
    ? (resistance?.price && resistance.price > entry ? resistance.price - entry : undefined)
    : (support?.price && support.price < entry ? entry - support.price : undefined);

  // Each tier's distance is the larger of (its R-multiple floor) and (a real technical
  // level, if one exists beyond that floor) - the guarantee comes from taking the max,
  // never the level alone. T1 only adopts the technical level when it falls in the
  // 1R-1.5R band (a natural "quick" target); further out, it more naturally belongs to
  // T2 instead.
  const t1UsesLevel = oppositeLevelDistance !== undefined
    && oppositeLevelDistance > riskPerShare
    && oppositeLevelDistance <= riskPerShare * 1.5;
  const t1Distance = Math.max(riskPerShare * 1.0, t1UsesLevel ? oppositeLevelDistance! : 0);
  const t2Distance = Math.max(riskPerShare * 2.0, oppositeLevelDistance ?? 0);
  const t3Distance = Math.max(riskPerShare * 3.0, atr * 4);

  const direction = isBuy ? 1 : -1;
  const target1Price = entry + direction * t1Distance;
  const target2Price = entry + direction * t2Distance;
  const target3Price = entry + direction * t3Distance;

  return {
    entry,
    stopLoss,
    riskPerShare,
    target1: {
      price: target1Price,
      rMultiple: t1Distance / riskPerShare,
      label: 'Target 1',
      guidance: 'Book 40-50% of the position here and move the stop to breakeven on the rest - this locks in a profit and removes risk from the trade.',
    },
    target2: {
      price: target2Price,
      rMultiple: t2Distance / riskPerShare,
      label: 'Target 2',
      guidance: 'Book another 30-40% here. This is the primary technical target for the setup.',
    },
    target3: {
      price: target3Price,
      rMultiple: t3Distance / riskPerShare,
      label: 'Target 3',
      guidance: 'Let the remaining 15-25% run with a trailing stop for trend continuation, rather than a fixed exit.',
    },
  };
}

export function generateAIPrediction(
  candles: Candle[],
  patterns: Array<{ index: number; name: string; type: string }>,
  indicators: IndicatorSet,
  backtestResults: BacktestResult[],
  context?: PredictionContext,
) {
  const referenceIdx = Math.max(0, candles.length - 2);
  const signalCandle = candles[referenceIdx];
  const prevSignalCandle = candles[Math.max(0, referenceIdx - 1)];
  const liveCandle = candles[candles.length - 1] || signalCandle;

  if (!signalCandle || !prevSignalCandle || !indicators) return null;

  let score = 0;
  let confidence = 0;
  let volumeAnalysis = 'Normal Volume';
  let trendAnalysis: string = indicators.trendScore?.label || 'Neutral';
  const riskNotes: string[] = [];
  const bullishReasons: string[] = [];
  const bearishReasons: string[] = [];
  const neutralReasons: string[] = [];
  const scoreBreakdown: ScoreBreakdownItem[] = [];

  const addLogic = (label: string, value: number, maxScore: number, detail: string) => {
    if (!Number.isFinite(value) || value === 0) return;
    const direction: ScoreBreakdownItem['direction'] = value > 0 ? 'bullish' : 'bearish';
    scoreBreakdown.push({
      label,
      score: Math.round(value),
      maxScore,
      direction,
      detail,
    });
    if (direction === 'bullish') bullishReasons.push(detail);
    else bearishReasons.push(detail);
  };

  const baseTrendScore = indicators.trendScore?.score ? indicators.trendScore.score * 0.45 : 0;
  if (baseTrendScore) {
    score += baseTrendScore;
    addLogic(
      'Trend Score',
      baseTrendScore,
      45,
      `Overall trend model is ${indicators.trendScore.label} (${indicators.trendScore.score}/100).`,
    );
  }
  confidence += Math.min(20, Math.abs(score) * 0.25);

  const adx = closedValue(indicators.adx);
  const ema20 = closedValue(indicators.ema20);
  const ema50 = closedValue(indicators.ema50);
  const ema200 = closedValue(indicators.ema200);
  const vwap = closedValue(indicators.vwap);
  const isStrongTrend = Boolean(adx && adx.adx > 25);

  if (ema20 && ema50) {
    if (signalCandle.close > ema20 && ema20 > ema50) {
      const value = isStrongTrend ? 22 : 14;
      score += value;
      addLogic('EMA Stack', value, 22, 'Price is above 20 EMA and 20 EMA is above 50 EMA.');
      trendAnalysis = isStrongTrend ? 'Strong Bullish Trend' : 'Bullish Trend';
    } else if (signalCandle.close < ema20 && ema20 < ema50) {
      const value = isStrongTrend ? -22 : -14;
      score += value;
      addLogic('EMA Stack', value, 22, 'Price is below 20 EMA and 20 EMA is below 50 EMA.');
      trendAnalysis = isStrongTrend ? 'Strong Bearish Trend' : 'Bearish Trend';
    } else {
      neutralReasons.push('EMA stack is mixed, so trend confirmation is not clean.');
    }
  }

  if (ema200) {
    const value = signalCandle.close > ema200 ? 8 : -8;
    score += value;
    addLogic('Long Trend', value, 8, value > 0 ? 'Price is above 200 EMA.' : 'Price is below 200 EMA.');
  }
  if (vwap) {
    const value = signalCandle.close > vwap ? 8 : -8;
    score += value;
    addLogic('VWAP', value, 8, value > 0 ? 'Price is trading above VWAP.' : 'Price is trading below VWAP.');
  }

  const rsi = closedValue(indicators.rsi);
  const stoch = closedValue(indicators.stoch);
  if (typeof rsi === 'number') {
    if (rsi < 30) {
      score += 18;
      confidence += 8;
      addLogic('RSI', 18, 18, `RSI is oversold at ${rsi.toFixed(1)}, so rebound probability improves.`);
      riskNotes.push('RSI is oversold; reversals can fail in strong downtrends.');
    } else if (rsi > 70) {
      score -= 18;
      confidence += 8;
      addLogic('RSI', -18, 18, `RSI is overbought at ${rsi.toFixed(1)}, so pullback risk is higher.`);
      riskNotes.push('RSI is overbought; momentum can stay elevated in strong uptrends.');
    } else {
      neutralReasons.push(`RSI is balanced at ${rsi.toFixed(1)}.`);
    }
  }

  if (stoch) {
    if (stoch.k < 20 && stoch.d < 20 && stoch.k > stoch.d) {
      score += 12;
      confidence += 5;
      addLogic('Stochastic', 12, 12, 'Stochastic is turning up from oversold zone.');
    } else if (stoch.k > 80 && stoch.d > 80 && stoch.k < stoch.d) {
      score -= 12;
      confidence += 5;
      addLogic('Stochastic', -12, 12, 'Stochastic is turning down from overbought zone.');
    }
  }

  const macd = closedValue(indicators.macd);
  const prevMacd = closedValue(indicators.macd, 3);
  if (macd?.histogram !== undefined && prevMacd?.histogram !== undefined) {
    const histogramValue = macd.histogram > 0 ? 10 : -10;
    score += histogramValue;
    addLogic('MACD', histogramValue, 14, histogramValue > 0 ? 'MACD histogram is above zero.' : 'MACD histogram is below zero.');
    if (macd.histogram > prevMacd.histogram) {
      score += 4;
      addLogic('MACD Momentum', 4, 4, 'MACD histogram is improving versus the previous closed candle.');
    }
    if (macd.histogram < prevMacd.histogram) {
      score -= 4;
      addLogic('MACD Momentum', -4, 4, 'MACD histogram is weakening versus the previous closed candle.');
    }
  }

  const bb = closedValue(indicators.bb);
  if (bb) {
    if (signalCandle.close <= bb.lower) {
      score += 12;
      confidence += 7;
      addLogic('Bollinger Band', 12, 12, 'Price is near or below the lower Bollinger Band.');
    } else if (signalCandle.close >= bb.upper) {
      score -= 12;
      confidence += 7;
      addLogic('Bollinger Band', -12, 12, 'Price is near or above the upper Bollinger Band.');
    }
  }

  const recentPatterns = patterns.filter(p => p.index <= referenceIdx && p.index >= referenceIdx - 3);
  if (recentPatterns.length > 0) {
    const latestPattern = recentPatterns[recentPatterns.length - 1];
    const bt = backtestResults.find(b => b.patternName === latestPattern.name);
    if (bt) {
      const recencyDecay = 1 - (referenceIdx - latestPattern.index) * 0.1;
      const qualityWeight = bt.sampleQuality === 'high' ? 1 : bt.sampleQuality === 'medium' ? 0.75 : 0.45;
      const directionalWeight = 26 * qualityWeight * recencyDecay;
      const bias = patternBias(latestPattern.name);

      if (bias === 'bullish' && bt.winRate >= 52) {
        score += directionalWeight;
        addLogic('Pattern Backtest', directionalWeight, 26, `${latestPattern.name} has ${bt.winRate.toFixed(1)}% directional win rate from ${bt.totalOccurrences} samples.`);
      }
      if (bias === 'bearish' && bt.winRate >= 52) {
        score -= directionalWeight;
        addLogic('Pattern Backtest', -directionalWeight, 26, `${latestPattern.name} has ${bt.winRate.toFixed(1)}% bearish directional win rate from ${bt.totalOccurrences} samples.`);
      }
      confidence += Math.min(14, bt.confidenceScore * 0.15) * recencyDecay;
    }
  }

  const volSlice = candles.slice(Math.max(0, referenceIdx - 20), referenceIdx);
  const avgVol = volSlice.length > 0 ? volSlice.reduce((acc, candle) => acc + candle.volume, 0) / volSlice.length : 0;
  if (avgVol > 0 && signalCandle.volume > avgVol * 1.5) {
    const priceUp = signalCandle.close > prevSignalCandle.close;
    const value = priceUp ? 12 : -12;
    score += value;
    volumeAnalysis = priceUp ? 'High Volume Buying' : 'High Volume Selling';
    addLogic('Volume', value, 12, priceUp ? 'High volume came with a green candle.' : 'High volume came with a red candle.');
    confidence += 8;
  } else if (avgVol > 0) {
    neutralReasons.push('Volume is not strong enough for breakout confirmation.');
  }

  const liveChange = signalCandle.close !== 0 ? ((liveCandle.close - signalCandle.close) / signalCandle.close) * 100 : 0;
  if (liveChange > 0.5) {
    score += 4;
    addLogic('Live Price Action', 4, 4, `Live candle is ${liveChange.toFixed(2)}% above the locked signal candle.`);
  } else if (liveChange < -0.5) {
    score -= 4;
    addLogic('Live Price Action', -4, 4, `Live candle is ${liveChange.toFixed(2)}% below the locked signal candle.`);
  }

  // --- Multi-timeframe confluence (optional) ---
  let higherTimeframeAlignment: 'aligned' | 'conflict' | 'unavailable' = 'unavailable';
  if (context?.higherTimeframeTrend) {
    const higherTrend = context.higherTimeframeTrend;
    const dailyDirection = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    const higherDirection = higherTrend.score > 15 ? 'bullish' : higherTrend.score < -15 ? 'bearish' : 'neutral';
    if (dailyDirection !== 'neutral' && higherDirection !== 'neutral') {
      if (dailyDirection === higherDirection) {
        higherTimeframeAlignment = 'aligned';
        const bonus = dailyDirection === 'bullish' ? 10 : -10;
        score += bonus;
        confidence += 6;
        addLogic('Multi-Timeframe', bonus, 10, `Higher timeframe trend (${higherTrend.label}) confirms this setup.`);
      } else {
        higherTimeframeAlignment = 'conflict';
        riskNotes.push(`Higher timeframe trend is ${higherTrend.label}, which conflicts with this timeframe's setup; treat as counter-trend and reduce size.`);
      }
    }
  }

  // --- Market regime context (optional) ---
  if (context?.marketRegime) {
    const regime = context.marketRegime;
    const dailyDirection = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    if (regime.label === 'Risk-On' && dailyDirection === 'bullish') {
      score += 6;
      confidence += 4;
      addLogic('Market Regime', 6, 8, 'Broader market (NIFTY) is in a Risk-On uptrend, supporting bullish setups.');
    } else if (regime.label === 'Risk-Off' && dailyDirection === 'bearish') {
      score -= 6;
      confidence += 4;
      addLogic('Market Regime', -6, 8, 'Broader market (NIFTY) is in a Risk-Off downtrend, supporting bearish setups.');
    } else if (regime.label === 'Risk-On' && dailyDirection === 'bearish') {
      riskNotes.push('This bearish setup goes against a broader Risk-On market trend; win rate may be lower than the backtest suggests.');
    } else if (regime.label === 'Risk-Off' && dailyDirection === 'bullish') {
      riskNotes.push('This bullish setup goes against a broader Risk-Off market trend; win rate may be lower than the backtest suggests.');
    }
    if (regime.label === 'Choppy') {
      riskNotes.push('Market-wide volatility (India VIX) is elevated; expect wider whipsaws and consider reduced position size.');
    }
  }

  // --- Relative strength vs benchmark (optional) ---
  if (context?.relativeStrength) {
    const rs = context.relativeStrength;
    const dailyDirection = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    if (rs.label === 'Leading' && dailyDirection === 'bullish') {
      score += 5;
      confidence += 3;
      addLogic('Relative Strength', 5, 6, `Stock is outperforming its benchmark by ${rs.relativeStrengthPct.toFixed(1)}% over the last ${rs.lookback} candles.`);
    } else if (rs.label === 'Lagging' && dailyDirection === 'bearish') {
      score -= 5;
      confidence += 3;
      addLogic('Relative Strength', -5, 6, `Stock is underperforming its benchmark by ${Math.abs(rs.relativeStrengthPct).toFixed(1)}% over the last ${rs.lookback} candles.`);
    } else if (rs.label === 'Lagging' && dailyDirection === 'bullish') {
      neutralReasons.push('Stock is lagging its benchmark despite a bullish technical setup.');
    } else if (rs.label === 'Leading' && dailyDirection === 'bearish') {
      neutralReasons.push('Stock is still outperforming its benchmark despite a bearish technical setup.');
    }
  }

  let signal = 'Neutral';
  if (score >= 30) signal = 'Buy';
  if (score <= -30) signal = 'Sell';
  if (score >= 60) signal = 'Strong Buy';
  if (score <= -60) signal = 'Strong Sell';

  const rawAtr = closedValue(indicators.atr) || signalCandle.close * 0.02;
  const atrPct = atrPercentile(indicators.atr, rawAtr);
  const volatilityMultiplier = atrPct >= 80 ? 1.2 : atrPct <= 20 ? 0.9 : 1.0;
  const atr = rawAtr * volatilityMultiplier;
  if (volatilityMultiplier > 1) {
    riskNotes.push('Volatility (ATR) is in the top 20% of its recent range; targets and stops have been widened accordingly.');
  } else if (volatilityMultiplier < 1) {
    riskNotes.push('Volatility (ATR) is in the bottom 20% of its recent range; targets and stops have been tightened accordingly.');
  }

  const support = nearestLevel(indicators.supportResistance || [], signalCandle.close, 'support');
  const resistance = nearestLevel(indicators.supportResistance || [], signalCandle.close, 'resistance');

  const breakoutRisk = assessBreakoutRisk(signalCandle, prevSignalCandle, support, resistance, avgVol);
  if (breakoutRisk.risk && breakoutRisk.note) {
    riskNotes.push(breakoutRisk.note);
  }

  const tradePlan = buildTradePlan(
    signal,
    score,
    signalCandle.close,
    liveCandle.close,
    atr,
    support,
    resistance,
  );
  const targetPrice = tradePlan.target2.price;
  const stopLoss = tradePlan.stopLoss;
  const risk = tradePlan.riskPerShare;
  const reward = Math.abs(targetPrice - tradePlan.entry);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;
  const riskRewardQuality: 'poor' | 'fair' | 'good' = riskRewardRatio >= 2 ? 'good' : riskRewardRatio >= 1.2 ? 'fair' : 'poor';
  const riskRewardReason = riskRewardRatio >= 1.5 ? `Risk-reward is acceptable at ${riskRewardRatio.toFixed(2)}x.` : '';
  if (riskRewardRatio > 0 && riskRewardRatio < 1.5) {
    riskNotes.push(`Risk-reward is only ${riskRewardRatio.toFixed(2)}x; setup needs caution.`);
  }

  if (backtestResults.every(result => result.totalOccurrences < 10)) {
    riskNotes.push('Backtest sample size is limited; confidence should be discounted.');
  }
  riskNotes.push('This is educational analysis only and not financial advice.');
  const logicBias = signal.includes('Buy')
    ? 'bullish'
    : signal.includes('Sell')
      ? 'bearish'
      : score > 0
        ? 'bullish'
        : score < 0
          ? 'bearish'
          : 'neutral';

  let confluenceScore = Math.max(0, Math.min(100, Math.round(Math.abs(score))));
  if (breakoutRisk.risk) confluenceScore = Math.max(0, confluenceScore - 12);
  if (riskRewardQuality === 'poor') confluenceScore = Math.max(0, confluenceScore - 8);
  if (riskRewardQuality === 'good') confluenceScore = Math.min(100, confluenceScore + 5);
  if (higherTimeframeAlignment === 'aligned') confluenceScore = Math.min(100, confluenceScore + 5);
  if (higherTimeframeAlignment === 'conflict') confluenceScore = Math.max(0, confluenceScore - 10);

  const logicSummary = logicBias === 'bullish'
    ? 'Bullish bias because positive trend, momentum, volume or pattern factors are stronger than bearish factors.'
    : logicBias === 'bearish'
      ? 'Bearish bias because negative trend, momentum, volume or pattern factors are stronger than bullish factors.'
      : 'Neutral bias because bullish and bearish evidence is mixed or weak.';
  if (riskRewardReason) {
    if (logicBias === 'bullish') bullishReasons.push(riskRewardReason);
    else if (logicBias === 'bearish') bearishReasons.push(riskRewardReason);
    else neutralReasons.push(riskRewardReason);
  }

  return {
    signal,
    confidence: Math.max(10, Math.min(Math.round(Math.abs(score) + confidence), 99)),
    targetPrice,
    stopLoss,
    tradePlan,
    riskRewardRatio,
    riskRewardQuality,
    score: Math.round(score),
    confluenceScore,
    logicBias,
    logicSummary,
    bullishReasons,
    bearishReasons,
    neutralReasons,
    scoreBreakdown,
    volumeAnalysis,
    trendAnalysis,
    trendScore: indicators.trendScore,
    support,
    resistance,
    riskNotes,
    falseBreakoutRisk: breakoutRisk.risk,
    volatilityContext: {
      atrPercentile: atrPct,
      widened: volatilityMultiplier > 1,
      tightened: volatilityMultiplier < 1,
    },
    higherTimeframeAlignment,
    marketRegime: context?.marketRegime,
    higherTimeframeTrend: context?.higherTimeframeTrend,
    relativeStrength: context?.relativeStrength,
    educationalDisclaimer: 'For educational and analytical purposes only. Not financial advice.',
    isConfirmed: true,
    liveSentiment: liveChange >= 0 ? 'Bullish' : 'Bearish',
    referenceTime: signalCandle.time,
  };
}
