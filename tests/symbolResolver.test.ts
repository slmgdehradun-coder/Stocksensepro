import { describe, expect, it } from 'vitest';
import { resolveSymbol } from '@/lib/symbolResolver';

describe('resolveSymbol', () => {
  it('resolves common NSE equity aliases', () => {
    const result = resolveSymbol('Reliance', 'NSE');
    expect(result.primary.symbol).toBe('RELIANCE.NS');
    expect(result.candidates.map(item => item.symbol)).toContain('RELIANCE.BO');
  });

  it('resolves company-name style Adani aliases to listed tickers', () => {
    expect(resolveSymbol('ADANIENTERPRISES', 'NSE').primary.symbol).toBe('ADANIENT.NS');
    expect(resolveSymbol('Adani Enterprises Ltd', 'BSE').primary.symbol).toBe('ADANIENT.BO');
    expect(resolveSymbol('Adani Ports', 'NSE').primary.symbol).toBe('ADANIPORTS.NS');
  });

  it('resolves Indian index aliases', () => {
    expect(resolveSymbol('NIFTY', 'NSE').primary.symbol).toBe('^NSEI');
    expect(resolveSymbol('BANKNIFTY', 'NSE').primary.symbol).toBe('^NSEBANK');
  });

  it('creates MCX commodity candidates with estimated benchmark fallback', () => {
    const result = resolveSymbol('GOLD', 'MCX');
    expect(result.primary.symbol).toBe('GOLDM.NS');
    expect(result.candidates.some(item => item.symbol === 'GC=F' && item.dataQuality === 'estimated')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('keeps global raw symbols raw before trying crypto or Indian fallbacks', () => {
    const result = resolveSymbol('AAPL', 'GLOBAL');
    expect(result.primary.symbol).toBe('AAPL');
    expect(result.candidates.map(item => item.symbol)).toContain('AAPL-USD');
  });

  it('resolves US equities without adding Indian suffixes', () => {
    const result = resolveSymbol('AAPL', 'US');
    expect(result.primary.symbol).toBe('AAPL');
    expect(result.primary.exchange).toBe('US');
    expect(result.candidates.map(item => item.symbol)).not.toContain('AAPL.NS');
  });

  it('resolves common US index aliases', () => {
    const result = resolveSymbol('SP500', 'US');
    expect(result.primary.symbol).toBe('^GSPC');
    expect(result.primary.exchange).toBe('US');
  });
});
