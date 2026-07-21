import { Candle } from './dataFetcher';

export function isBullishEngulfing(prev: Candle, curr: Candle) {
  const isPrevBearish = prev.close < prev.open;
  const isCurrBullish = curr.close > curr.open;
  const engulfsBody = curr.open <= prev.close && curr.close >= prev.open;
  return isPrevBearish && isCurrBullish && engulfsBody;
}

export function isBearishEngulfing(prev: Candle, curr: Candle) {
  const isPrevBullish = prev.close > prev.open;
  const isCurrBearish = curr.close < curr.open;
  const engulfsBody = curr.open >= prev.close && curr.close <= prev.open;
  return isPrevBullish && isCurrBearish && engulfsBody;
}

export function isHammer(candle: Candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return lowerShadow >= 2 * bodySize && upperShadow <= bodySize * 0.1;
}

export function isShootingStar(candle: Candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return upperShadow >= 2 * bodySize && lowerShadow <= bodySize * 0.1;
}

export function isDoji(candle: Candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  return bodySize <= totalSize * 0.1;
}

export function isMarubozuBullish(candle: Candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  return candle.close > candle.open && bodySize >= totalSize * 0.95;
}

export function isMarubozuBearish(candle: Candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  return candle.close < candle.open && bodySize >= totalSize * 0.95;
}

export function isMorningStar(c1: Candle, c2: Candle, c3: Candle) {
  const isC1Bearish = c1.close < c1.open;
  const isC2Small = Math.abs(c2.close - c2.open) <= (c1.open - c1.close) * 0.3;
  const isC3Bullish = c3.close > c3.open;
  const c3ClosesAboveMidC1 = c3.close > (c1.open + c1.close) / 2;
  return isC1Bearish && isC2Small && isC3Bullish && c3ClosesAboveMidC1;
}

export function isEveningStar(c1: Candle, c2: Candle, c3: Candle) {
  const isC1Bullish = c1.close > c1.open;
  const isC2Small = Math.abs(c2.close - c2.open) <= (c1.close - c1.open) * 0.3;
  const isC3Bearish = c3.close < c3.open;
  const c3ClosesBelowMidC1 = c3.close < (c1.open + c1.close) / 2;
  return isC1Bullish && isC2Small && isC3Bearish && c3ClosesBelowMidC1;
}

export function detectPatterns(candles: Candle[]) {
  const patterns = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    if (isBullishEngulfing(c2, c3)) patterns.push({ index: i, name: 'Bullish Engulfing', type: 'Bullish' });
    if (isBearishEngulfing(c2, c3)) patterns.push({ index: i, name: 'Bearish Engulfing', type: 'Bearish' });
    if (isHammer(c3)) patterns.push({ index: i, name: 'Hammer', type: 'Bullish' });
    if (isShootingStar(c3)) patterns.push({ index: i, name: 'Shooting Star', type: 'Bearish' });
    if (isDoji(c3)) patterns.push({ index: i, name: 'Doji', type: 'Neutral' });
    if (isMarubozuBullish(c3)) patterns.push({ index: i, name: 'Marubozu Bullish', type: 'Bullish' });
    if (isMarubozuBearish(c3)) patterns.push({ index: i, name: 'Marubozu Bearish', type: 'Bearish' });
    if (isMorningStar(c1, c2, c3)) patterns.push({ index: i, name: 'Morning Star', type: 'Bullish' });
    if (isEveningStar(c1, c2, c3)) patterns.push({ index: i, name: 'Evening Star', type: 'Bearish' });
  }
  return patterns;
}
