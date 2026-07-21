import { describe, expect, it } from 'vitest';
import { calculateIndicators } from '@/lib/indicators';
import { Candle } from '@/lib/types';

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const base = 100 + index * 0.6 + Math.sin(index / 4) * 3;
    return {
      time: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      open: base - 0.5,
      high: base + 2,
      low: base - 2,
      close: base + 0.75,
      volume: 100000 + index * 100,
    };
  });
}

describe('calculateIndicators', () => {
  it('calculates key indicators and trend score for sufficient candles', () => {
    const indicators = calculateIndicators(makeCandles(240));
    expect(indicators.ema20.length).toBeGreaterThan(0);
    expect(indicators.sma200.length).toBeGreaterThan(0);
    expect(indicators.rsi.length).toBeGreaterThan(0);
    expect(indicators.macd.length).toBeGreaterThan(0);
    expect(indicators.bb.length).toBeGreaterThan(0);
    expect(indicators.trendScore.score).toBeGreaterThan(-100);
    expect(indicators.trendScore.score).toBeLessThanOrEqual(100);
  });
});
