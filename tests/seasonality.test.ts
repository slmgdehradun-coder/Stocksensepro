import { describe, expect, it } from 'vitest';
import { calculateMonthlySeasonality, summarizeStockSeasonality } from '@/lib/seasonality';
import { Candle } from '@/lib/types';

function monthlyCandles(year: number, month: number, open: number, close: number): Candle[] {
  const monthText = String(month).padStart(2, '0');
  return [
    {
      time: `${year}-${monthText}-01`,
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close: open,
      volume: 100000,
    },
    {
      time: `${year}-${monthText}-28`,
      open: close,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 120000,
    },
  ];
}

describe('seasonality calculations', () => {
  it('calculates ten-year monthly up/down seasonality from completed months', () => {
    const candles = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].flatMap(year => [
      ...monthlyCandles(year, 1, 100, 94),
      ...monthlyCandles(year, 12, 100, 120),
    ]);

    const months = calculateMonthlySeasonality(candles, 10, new Date('2026-02-10T00:00:00Z'));
    const january = months[0];
    const december = months[11];

    expect(january.samples).toBe(10);
    expect(january.downYears).toBe(10);
    expect(january.avgReturn).toBe(-6);
    expect(january.consistency).toBe('Strong Down');

    expect(december.samples).toBe(10);
    expect(december.upYears).toBe(10);
    expect(december.avgReturn).toBe(20);
    expect(december.winRate).toBe(100);
    expect(december.consistency).toBe('Strong Up');
  });

  it('summarizes best and worst month and excludes the current incomplete month', () => {
    const candles = [
      ...[2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].flatMap(year => [
        ...monthlyCandles(year, 3, 100, 103),
        ...monthlyCandles(year, 7, 100, 92),
      ]),
      ...monthlyCandles(2026, 7, 100, 135),
    ];

    const asOf = new Date('2026-07-10T00:00:00Z');
    const months = calculateMonthlySeasonality(candles, 10, asOf);
    const july = months[6];
    const summary = summarizeStockSeasonality('RELIANCE', 'NIFTY 50', candles, [], 10, asOf);

    expect(july.samples).toBe(10);
    expect(july.yearly.some(item => item.year === 2026)).toBe(false);
    expect(july.avgReturn).toBe(-8);
    expect(summary.bestMonth?.monthName).toBe('March');
    expect(summary.worstMonth?.monthName).toBe('July');
  });
});
