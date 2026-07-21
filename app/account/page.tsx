'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import AuthModal from '@/components/AuthModal';
import LegalDisclaimer from '@/components/LegalDisclaimer';
import SubscriptionBadge from '@/components/SubscriptionBadge';

async function readApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || `Request failed with ${response.status}`;
}

export default function AccountPage() {
  const { user, isLoaded } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (nextPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!isLoaded ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : !user ? (
          <div className="surface-card p-8 text-center">
            <h1 className="text-2xl font-bold text-fg">Sign in to manage account</h1>
            <button onClick={() => setIsAuthModalOpen(true)} className="mt-5 rounded-lg bg-accent px-5 py-3 font-medium text-ink hover:bg-accent-strong">
              Sign In
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="surface-card p-6">
              <h1 className="text-2xl font-bold text-fg">Account</h1>
              <div className="mt-5 space-y-3 text-sm data-mono">
                <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Name</span><span className="text-fg">{user.name}</span></div>
                <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Email</span><span className="text-fg">{user.email}</span></div>
                <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Mobile</span><span className="text-fg">{user.mobile}</span></div>
                <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Status</span><SubscriptionBadge user={user} /></div>
                {user.proStartDate && <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Pro Start</span><span className="text-fg">{user.proStartDate}</span></div>}
                {user.proEndDate && <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Pro End</span><span className="text-fg">{user.proEndDate}</span></div>}
                {user.isPro && user.remainingProDays < 36500 && (
                  <div className="flex justify-between gap-4"><span className="text-fg-subtle font-sans">Remaining</span><span className="text-bullish">{user.remainingProDays} days</span></div>
                )}
              </div>
            </section>

            <section className="surface-card p-6">
              <div className="mb-5 flex items-center gap-3">
                <KeyRound className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-bold text-fg">Change Password</h2>
              </div>
              <form onSubmit={changePassword} className="space-y-4">
                <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required placeholder="Current password" className="w-full rounded-lg border border-border-hair bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent" />
                <input type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} required minLength={8} placeholder="New password" className="w-full rounded-lg border border-border-hair bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent" />
                <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} placeholder="Confirm new password" className="w-full rounded-lg border border-border-hair bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent" />
                {error && <div className="flex items-center gap-2 rounded-lg border border-bearish/30 bg-bearish-soft p-3 text-sm text-bearish"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
                {message && <div className="flex items-center gap-2 rounded-lg border border-bullish/30 bg-bullish-soft p-3 text-sm text-bullish"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}
                <button disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-ink hover:bg-accent-strong disabled:opacity-60">
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Change Password
                </button>
              </form>
            </section>
          </div>
        )}
        <LegalDisclaimer className="mt-6" />
      </main>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
