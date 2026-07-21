import { describe, expect, it } from 'vitest';
import { buyPosition, calculatePositionPnl, getRiskTrigger, sellPosition } from '@/lib/portfolio';

describe('portfolio helpers', () => {
  it('updates average price on multiple buys and realizes P&L on sell', () => {
    const first = buyPosition(100000, [], { symbol: 'RELIANCE.NS', price: 1000, shares: 10, currency: 'INR' });
    const second = buyPosition(first.balance, first.positions, { symbol: 'RELIANCE.NS', price: 1200, shares: 10, currency: 'INR' });
    expect(second.positions[0].avgPrice).toBe(1100);

    const sold = sellPosition(second.balance, second.positions, { symbol: 'RELIANCE.NS', price: 1300, shares: 5, currency: 'INR' });
    expect(sold.trade.realizedPnl).toBe(1000);
    expect(sold.positions[0].shares).toBe(15);
  });

  it('calculates live P&L and risk triggers', () => {
    const position = { symbol: 'TCS.NS', shares: 5, avgPrice: 100, stopLoss: 90, target: 130 };
    expect(calculatePositionPnl(position, 120).pnl).toBe(100);
    expect(getRiskTrigger(position, 85)).toBe('STOP_LOSS');
    expect(getRiskTrigger(position, 135)).toBe('TARGET');
  });

  it('records the exchange a position was bought on, and preserves it across averaging buys', () => {
    const first = buyPosition(100000, [], { symbol: 'AAPL', price: 150, shares: 5, currency: 'USD', exchange: 'US' });
    expect(first.positions[0].exchange).toBe('US');

    const second = buyPosition(first.balance, first.positions, { symbol: 'AAPL', price: 160, shares: 5, currency: 'USD', exchange: 'US' });
    expect(second.positions[0].exchange).toBe('US');
  });

  it('leaves exchange undefined when not supplied, for backward compatibility with positions saved before this field existed', () => {
    const result = buyPosition(100000, [], { symbol: 'INFY.NS', price: 1500, shares: 2, currency: 'INR' });
    expect(result.positions[0].exchange).toBeUndefined();
  });
});
