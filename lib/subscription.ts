export type UserRole = 'admin' | 'user';
export type SubscriptionStatus = 'free' | 'pro' | 'pending' | 'expired' | 'blocked';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type PlanId = 'week' | 'month' | 'year';

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  amount: number;
  durationDays: number;
  enabled: boolean;
}

export interface SubscriptionUserLike {
  role: UserRole;
  status: SubscriptionStatus;
  proStartDate?: string;
  proEndDate?: string;
  proActiveDates?: string[];
}

export interface EffectiveAccess {
  status: SubscriptionStatus;
  isPro: boolean;
  remainingDays: number;
  reason: string;
}

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  { id: 'week', name: 'Pro Weekly', amount: 100, durationDays: 7, enabled: true },
  { id: 'month', name: 'Pro Monthly', amount: 200, durationDays: 30, enabled: true },
  { id: 'year', name: 'Pro Yearly', amount: 1500, durationDays: 365, enabled: true },
];

export function dateToYmd(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const next = new Date(utc + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

export function getEffectiveAccess(user: SubscriptionUserLike, now = new Date()): EffectiveAccess {
  const today = dateToYmd(now);

  if (user.status === 'blocked') {
    return { status: 'blocked', isPro: false, remainingDays: 0, reason: 'User is blocked by admin.' };
  }

  if (user.role === 'admin') {
    return { status: 'pro', isPro: true, remainingDays: 36500, reason: 'Admin access.' };
  }

  const activeDates = new Set((user.proActiveDates || []).filter(isDateOnly));
  if (activeDates.has(today)) {
    return { status: 'pro', isPro: true, remainingDays: 1, reason: 'Calendar Pro access is active today.' };
  }

  if (user.proStartDate && user.proEndDate && isDateOnly(user.proStartDate) && isDateOnly(user.proEndDate)) {
    if (today >= user.proStartDate && today <= user.proEndDate) {
      return {
        status: 'pro',
        isPro: true,
        remainingDays: daysBetweenInclusive(today, user.proEndDate),
        reason: 'Pro date range is active.',
      };
    }

    if (today > user.proEndDate) {
      return { status: 'expired', isPro: false, remainingDays: 0, reason: 'Pro subscription is expired.' };
    }
  }

  if (user.status === 'pending') {
    return { status: 'pending', isPro: false, remainingDays: 0, reason: 'Payment request is pending admin approval.' };
  }

  if (user.status === 'pro') {
    return { status: 'pro', isPro: true, remainingDays: 36500, reason: 'Manual Pro access is active.' };
  }

  return { status: 'free', isPro: false, remainingDays: 0, reason: 'Free access.' };
}
