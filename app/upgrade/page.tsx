'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Crown, Loader2, QrCode, Upload } from 'lucide-react';
import { SubscriptionPlan } from '@/lib/subscription';
import { useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import AuthModal from '@/components/AuthModal';
import LegalDisclaimer from '@/components/LegalDisclaimer';
import SubscriptionBadge from '@/components/SubscriptionBadge';

interface PublicPaymentSettings {
  upiId: string;
  qrImageUrl: string;
  paymentInstructions: string;
}

interface PaymentRequest {
  id: string;
  planName: string;
  amount: number;
  utr: string;
  paymentDate: string;
  status: 'pending' | 'approved' | 'rejected';
  remarks?: string;
  createdAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function UpgradePage() {
  const { user, isLoaded, refresh } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [settings, setSettings] = useState<PublicPaymentSettings | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [utr, setUtr] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPlan = useMemo(
    () => plans.find(plan => plan.id === selectedPlanId) || plans[0],
    [plans, selectedPlanId],
  );

  useEffect(() => {
    const loadPlans = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch('/api/subscription/plans');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Failed to load plans');
        setPlans(payload.plans || []);
        setSettings(payload.settings || null);
        setSelectedPlanId((payload.plans || [])[0]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plans');
      } finally {
        setIsLoading(false);
      }
    };
    loadPlans();
  }, []);

  useEffect(() => {
    const loadRequests = async () => {
      if (!user) {
        setRequests([]);
        return;
      }

      const response = await fetch('/api/payments', { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (response.ok) setRequests(payload?.requests || []);
    };
    loadRequests();
  }, [user]);

  const copyUpi = async () => {
    if (!settings?.upiId) return;
    await navigator.clipboard?.writeText(settings.upiId).catch(() => null);
    setMessage('UPI ID copied.');
  };

  const handleFile = async (file?: File) => {
    setError('');
    if (!file) return;
    if (file.size > 1_500_000) {
      setError('Screenshot should be below 1.5 MB for local JSON storage.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setScreenshotUrl(String(reader.result || ''));
    reader.onerror = () => setError('Could not read screenshot file.');
    reader.readAsDataURL(file);
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!selectedPlan) {
      setError('Select a valid plan.');
      return;
    }
    if (!acceptedDisclaimer) {
      setError('Accept the educational-purpose disclaimer before submitting payment.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
          utr,
          paymentDate,
          screenshotUrl,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Payment request failed');

      setMessage('Payment request submitted. Pro access will start only after admin approval.');
      setUtr('');
      setScreenshotUrl('');
      setAcceptedDisclaimer(false);
      await refresh();
      const requestsResponse = await fetch('/api/payments', { credentials: 'include' });
      const requestsPayload = await requestsResponse.json().catch(() => null);
      if (requestsResponse.ok) setRequests(requestsPayload?.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
              <Crown className="h-8 w-8 text-amber-300" />
              Upgrade to Pro
            </h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Manual UPI payment verification. Your account remains Free/Pending until admin approves the request.
            </p>
          </div>
          {user?.isPro && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Active Pro access{user.remainingProDays < 36500 ? `, ${user.remainingProDays} days left` : ''}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-9 w-9 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {plans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-2xl border p-5 text-left transition-all ${selectedPlan?.id === plan.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
                  >
                    <div className="text-sm font-medium text-slate-400">{plan.name}</div>
                    <div className="mt-3 text-3xl font-bold text-white">₹{plan.amount}</div>
                    <div className="mt-2 text-sm text-slate-400">{plan.durationDays} days Pro access</div>
                  </button>
                ))}
              </div>

              <form onSubmit={submitRequest} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-500/10 p-3">
                    <QrCode className="h-6 w-6 text-blue-300" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Payment Details</h2>
                    <p className="mt-1 text-sm text-slate-400">{settings?.paymentInstructions}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
                  <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    {settings?.qrImageUrl ? (
                      <img src={settings.qrImageUrl} alt="Payment QR code" className="max-h-48 max-w-full rounded-lg object-contain" />
                    ) : (
                      <div className="text-center text-sm text-slate-500">
                        <QrCode className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                        Admin has not configured QR image yet.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-slate-500">UPI ID</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="break-all font-mono text-lg font-bold text-white">{settings?.upiId || 'Not configured'}</span>
                        <button type="button" onClick={copyUpi} disabled={!settings?.upiId} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40">
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-400">UTR / Transaction ID</label>
                        <input
                          value={utr}
                          onChange={event => setUtr(event.target.value)}
                          required
                          minLength={6}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white outline-none focus:border-blue-500"
                          placeholder="Enter UTR"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-400">Payment Date</label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={event => setPaymentDate(event.target.value)}
                          required
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300 hover:border-blue-500/60">
                      <Upload className="h-4 w-4" />
                      {screenshotUrl ? 'Screenshot attached' : 'Attach payment screenshot'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => handleFile(event.target.files?.[0])} />
                    </label>
                  </div>
                </div>

                <LegalDisclaimer />
                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={acceptedDisclaimer}
                    onChange={event => setAcceptedDisclaimer(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600"
                  />
                  <span>I understand Pro tools are educational analytics only and not investment advice.</span>
                </label>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                {message && (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedPlan}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Payment Request
                </button>
              </form>
            </section>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-bold text-white">Access Status</h2>
                {!isLoaded ? (
                  <Loader2 className="mt-4 h-5 w-5 animate-spin text-blue-500" />
                ) : user ? (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">User</span>
                      <span className="text-white">{user.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Status</span>
                      <SubscriptionBadge user={user} />
                    </div>
                    {user.proEndDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Expiry</span>
                        <span className="font-mono text-white">{user.proEndDate}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => setIsAuthModalOpen(true)} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Sign in to submit
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-bold text-white">Payment History</h2>
                <div className="mt-4 space-y-3">
                  {requests.length === 0 ? (
                    <p className="text-sm text-slate-500">No payment requests yet.</p>
                  ) : (
                    requests.map(request => (
                      <div key={request.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-white">{request.planName}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${request.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : request.status === 'rejected' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>
                            {request.status}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">₹{request.amount} | UTR: {request.utr}</div>
                        {request.remarks && <div className="mt-2 text-xs text-slate-500">Admin remarks: {request.remarks}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
