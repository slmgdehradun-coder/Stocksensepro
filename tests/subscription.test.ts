import { describe, expect, it } from 'vitest';
import { addDays, daysBetweenInclusive, getEffectiveAccess } from '@/lib/subscription';

describe('subscription access', () => {
  it('treats a date range as active through the end date', () => {
    const access = getEffectiveAccess({
      role: 'user',
      status: 'pro',
      proStartDate: '2026-07-01',
      proEndDate: '2026-07-10',
      proActiveDates: [],
    }, new Date('2026-07-10T12:00:00.000+05:30'));

    expect(access.isPro).toBe(true);
    expect(access.status).toBe('pro');
    expect(access.remainingDays).toBe(1);
  });

  it('expires a user after the subscription date range', () => {
    const access = getEffectiveAccess({
      role: 'user',
      status: 'pro',
      proStartDate: '2026-07-01',
      proEndDate: '2026-07-07',
      proActiveDates: [],
    }, new Date('2026-07-08T08:00:00.000+05:30'));

    expect(access.isPro).toBe(false);
    expect(access.status).toBe('expired');
  });

  it('allows a one-day calendar override', () => {
    const access = getEffectiveAccess({
      role: 'user',
      status: 'free',
      proActiveDates: ['2026-07-09'],
    }, new Date('2026-07-09T10:00:00.000+05:30'));

    expect(access.isPro).toBe(true);
    expect(access.remainingDays).toBe(1);
  });

  it('blocks access before all other rules', () => {
    const access = getEffectiveAccess({
      role: 'user',
      status: 'blocked',
      proStartDate: '2026-07-01',
      proEndDate: '2026-08-01',
      proActiveDates: ['2026-07-09'],
    }, new Date('2026-07-09T10:00:00.000+05:30'));

    expect(access.isPro).toBe(false);
    expect(access.status).toBe('blocked');
  });

  it('calculates inclusive dates predictably', () => {
    expect(addDays('2026-07-09', 6)).toBe('2026-07-15');
    expect(daysBetweenInclusive('2026-07-09', '2026-07-15')).toBe(7);
  });
});
