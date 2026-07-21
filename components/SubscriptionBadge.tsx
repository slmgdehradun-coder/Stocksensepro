'use client';

import { ClientUser } from '@/lib/auth';

interface SubscriptionBadgeProps {
  user: ClientUser | null;
}

const STYLES: Record<string, string> = {
  pro: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  free: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  expired: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  blocked: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

export default function SubscriptionBadge({ user }: SubscriptionBadgeProps) {
  const status = user?.effectiveStatus || 'free';
  const label = user?.role === 'admin' ? 'Admin Pro' : `${status} Plan`;
  const className = STYLES[status] || STYLES.free;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}
