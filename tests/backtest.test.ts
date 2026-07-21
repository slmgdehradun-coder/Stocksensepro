import { describe, expect, it } from 'vitest';
import { backtestPattern } from '@/lib/aiPrediction';
import { Candle } from '@/lib/types';

function risingCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: `2025-02-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1000,
  }));
}

describe('backtestPattern', () => {
  it('returns directional win-rate and drawdown metrics', () => {
    const result = backtestPattern(risingCandles(80), [5, 15, 25, 35], 'Bullish Engulfing');
    expect(result.totalOccurrences).toBe(4);
    expect(result.winRate).toBe(100);
    expect(result.averageReturn).toBeGreaterThan(0);
    expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.confidenceScore).toBeGreaterThan(0);
  });

  it('computes profit factor and expectancy for a fully winning pattern', () => {
    const result = backtestPattern(risingCandles(80), [5, 15, 25, 35], 'Bullish Engulfing');
    expect(result.profitFactor).toBeGreaterThan(0);
    expect(result.expectancy).toBeGreaterThan(0);
  });

  it('reports zero profit factor and non-positive expectancy when every occurrence loses', () => {
    const falling = risingCandles(80).map(c => ({ ...c, close: 200 - c.close, open: 200 - c.open, high: 200 - c.low, low: 200 - c.high }));
    const result = backtestPattern(falling, [5, 15, 25, 35], 'Bullish Engulfing');
    expect(result.profitFactor).toBe(0);
    expect(result.expectancy).toBeLessThanOrEqual(0);
  });
});
