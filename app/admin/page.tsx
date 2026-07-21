'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, CalendarDays, CheckCircle2, CreditCard, Loader2, RefreshCw, Save, Search, Settings, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { addDays, dateToYmd, PaymentStatus, SubscriptionPlan, SubscriptionStatus } from '@/lib/subscription';
import { ClientUser, useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import AuthModal from '@/components/AuthModal';
import LegalDisclaimer from '@/components/LegalDisclaimer';
import SubscriptionBadge from '@/components/SubscriptionBadge';

interface AdminUser extends ClientUser {
  updatedAt: string;
  blockedAt?: string;
  paymentRequests: number;
}

interface AdminPayment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planName: string;
  amount: number;
  utr: string;
  paymentDate: string;
  screenshotUrl?: string;
  status: PaymentStatus;
  remarks?: string;
  createdAt: string;
}

interface AdminSettings {
  upiId: string;
  qrImageUrl: string;
  paymentInstructions: string;
}

const statusOptions: SubscriptionStatus[] = ['free', 'pending', 'pro', 'expired', 'blocked'];
const defaultNewUser = () => ({
  name: '',
  mobile: '',
  email: '',
  password: '',
  status: 'free' as SubscriptionStatus,
  proStartDate: dateToYmd(),
  proEndDate: addDays(dateToYmd(), 29),
});

async function readApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || `Request failed with ${response.status}`;
}

export default function AdminPage() {
  const { user, isLoaded, refresh } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [settings, setSettings] = useState<AdminSettings>({ upiId: '', qrImageUrl: '', paymentInstructions: '' });
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [query, setQuery] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'all'>('pending');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [draftStatus, setDraftStatus] = useState<SubscriptionStatus>('free');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [draftDates, setDraftDates] = useState<string[]>([]);
  const [newActiveDate, setNewActiveDate] = useState(dateToYmd());
  const [remarksByPayment, setRemarksByPayment] = useState<Record<string, string>>({});
  const [newUser, setNewUser] = useState(defaultNewUser);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedUser = useMemo(
    () => users.find(item => item.id === selectedUserId) || users[0],
    [selectedUserId, users],
  );

  const handleAdminResponse = useCallback(async (response: Response, sessionMessage = 'Admin session expired. Please sign in again.') => {
    if (response.status === 401) {
      await refresh();
      setIsAuthModalOpen(true);
      throw new Error(sessionMessage);
    }
    if (!response.ok) throw new Error(await readApiError(response));
  }, [refresh]);

  const loadAdminData = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setIsLoading(true);
    setError('');
    try {
      const userUrl = `/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      const paymentUrl = `/api/admin/payments${paymentStatus !== 'all' ? `?status=${paymentStatus}` : ''}`;
      const [usersResponse, paymentsResponse, settingsResponse] = await Promise.all([
        fetch(userUrl, { credentials: 'include', cache: 'no-store' }),
        fetch(paymentUrl, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/settings', { credentials: 'include', cache: 'no-store' }),
      ]);

      await handleAdminResponse(usersResponse, 'Admin session verify nahi ho rahi. Please dobara sign in karein.');
      await handleAdminResponse(paymentsResponse, 'Admin session verify nahi ho rahi. Please dobara sign in karein.');
      await handleAdminResponse(settingsResponse, 'Admin session verify nahi ho rahi. Please dobara sign in karein.');

      const usersPayload = await usersResponse.json();
      const paymentsPayload = await paymentsResponse.json();
      const settingsPayload = await settingsResponse.json();
      setUsers(usersPayload.users || []);
      setPayments(paymentsPayload.requests || []);
      setSettings(settingsPayload.settings || { upiId: '', qrImageUrl: '', paymentInstructions: '' });
      setPlans(settingsPayload.plans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin data load failed');
    } finally {
      setIsLoading(false);
    }
  }, [handleAdminResponse, paymentStatus, query, user]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!selectedUser) return;
    setDraftStatus(selectedUser.status);
    setDraftStart(selectedUser.proStartDate || '');
    setDraftEnd(selectedUser.proEndDate || '');
    setDraftDates(selectedUser.proActiveDates || []);
  }, [selectedUser]);

  const saveUser = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: draftStatus,
          proStartDate: draftStart,
          proEndDate: draftEnd,
          proActiveDates: draftDates,
        }),
      });
      await handleAdminResponse(response);
      setMessage('User subscription updated.');
      await loadAdminData();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User update failed');
    } finally {
      setIsSaving(false);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUser.name,
          mobile: newUser.mobile,
          email: newUser.email,
          password: newUser.password,
          status: newUser.status,
          proStartDate: newUser.status === 'pro' ? newUser.proStartDate : '',
          proEndDate: newUser.status === 'pro' ? newUser.proEndDate : '',
          proActiveDates: [],
        }),
      });
      await handleAdminResponse(response, 'Admin session expire ho gayi. Please dobara sign in karke user create karein.');
      const payload = await response.json();
      setUsers(prev => [payload.user, ...prev.filter(item => item.id !== payload.user.id)]);
      setSelectedUserId(payload.user.id);
      setQuery('');
      setNewUser(defaultNewUser());
      setMessage('User created. You can manage Pro access below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User creation failed');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBlock = async (target: AdminUser, blocked: boolean) => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked }),
      });
      await handleAdminResponse(response);
      setMessage(blocked ? 'User blocked.' : 'User unblocked.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Block update failed');
    } finally {
      setIsSaving(false);
    }
  };

  const reviewPayment = async (payment: AdminPayment, action: 'approve' | 'reject') => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/payments/${payment.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, remarks: remarksByPayment[payment.id] || '' }),
      });
      await handleAdminResponse(response);
      setMessage(action === 'approve' ? 'Payment approved and Pro dates assigned.' : 'Payment rejected.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment review failed');
    } finally {
      setIsSaving(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, plans }),
      });
      await handleAdminResponse(response);
      setMessage('Payment settings saved.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const addActiveDate = () => {
    if (!newActiveDate) return;
    setDraftDates(prev => Array.from(new Set([...prev, newActiveDate])).sort());
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-ink text-fg-muted">
        <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
          <ShieldCheck className="mb-4 h-12 w-12 text-accent" />
          <h1 className="text-3xl font-bold text-fg">Admin login required</h1>
          <p className="mt-3 text-fg-muted">Free signup users yahin show honge, lekin pehle admin account se login karein.</p>
          <div className="mt-5 rounded-xl border border-border-hair bg-surface p-4 text-left text-sm text-fg-muted">
            <p className="font-semibold text-fg">Default local admin</p>
            <p className="mt-2 font-mono text-xs text-fg-muted">admin@stocksense.local</p>
            <p className="font-mono text-xs text-fg-muted">Admin@12345</p>
            <p className="mt-3 text-xs text-fg-subtle">Production me ADMIN_EMAIL / ADMIN_PASSWORD env values use hongi.</p>
          </div>
          <button onClick={() => setIsAuthModalOpen(true)} className="mt-6 rounded-lg bg-accent px-5 py-3 font-medium text-ink hover:bg-accent-strong">
            Sign In
          </button>
        </main>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-ink text-fg-muted">
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <Ban className="mx-auto mb-4 h-12 w-12 text-bearish" />
          <h1 className="text-3xl font-bold text-fg">Admin access required</h1>
          <p className="mt-3 text-fg-muted">Your account does not have admin permission.</p>
          <Link href="/" className="mt-6 inline-flex rounded-lg bg-accent px-5 py-3 font-medium text-ink hover:bg-accent-strong">
            Back to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Subscription Control Center</h1>
          <p className="mt-2 text-slate-400">Approve payments, manage Free/Pro/Expired/Blocked users, and configure UPI payment plans.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
        )}
        {message && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <form onSubmit={createUser} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="mb-5 flex items-center gap-3">
                <UserPlus className="h-6 w-6 text-emerald-300" />
                <div>
                  <h2 className="text-xl font-bold text-white">Create User</h2>
                  <p className="text-sm text-slate-500">Admin se user banao, password set karo, aur Pro access assign karo.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  value={newUser.name}
                  onChange={event => setNewUser(prev => ({ ...prev, name: event.target.value }))}
                  placeholder="Name"
                  required
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={newUser.mobile}
                  onChange={event => setNewUser(prev => ({ ...prev, mobile: event.target.value }))}
                  placeholder="Mobile number"
                  required
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                />
                <input
                  type="email"
                  value={newUser.email}
                  onChange={event => setNewUser(prev => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  required
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                />
                <input
                  type="password"
                  value={newUser.password}
                  onChange={event => setNewUser(prev => ({ ...prev, password: event.target.value }))}
                  placeholder="Temporary password, min 8 chars"
                  minLength={8}
                  required
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <select
                  value={newUser.status}
                  onChange={event => {
                    const status = event.target.value as SubscriptionStatus;
                    setNewUser(prev => ({ ...prev, status }));
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none"
                >
                  {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <input
                  type="date"
                  value={newUser.proStartDate}
                  onChange={event => setNewUser(prev => ({ ...prev, proStartDate: event.target.value }))}
                  disabled={newUser.status !== 'pro'}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none disabled:opacity-50"
                />
                <input
                  type="date"
                  value={newUser.proEndDate}
                  onChange={event => setNewUser(prev => ({ ...prev, proEndDate: event.target.value }))}
                  disabled={newUser.status !== 'pro'}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none disabled:opacity-50"
                />
              </div>

              <button type="submit" disabled={isSaving} className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create User
              </button>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
              <div className="flex flex-col gap-4 border-b border-slate-800 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-6 w-6 text-blue-300" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Users</h2>
                    <p className="text-sm text-slate-500">{users.length} users loaded. New signups appear here as Free users.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                    <Search className="h-4 w-4 text-slate-500" />
                    <input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Search name, mobile, email"
                      className="w-56 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <button
                    onClick={loadAdminData}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Mobile</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Pro Dates</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users.map(item => (
                      <tr key={item.id} className={selectedUser?.id === item.id ? 'bg-blue-500/5' : 'hover:bg-slate-800/30'}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.email}</div>
                          <div className="mt-1 font-mono text-[10px] text-slate-600">ID: {item.id}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.mobile}</td>
                        <td className="px-4 py-3"><SubscriptionBadge user={item} /></td>
                        <td className="px-4 py-3 text-xs text-slate-400">{item.proStartDate || '-'} to {item.proEndDate || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setSelectedUserId(item.id)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedUser && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <h2 className="text-xl font-bold text-white">Manage {selectedUser.name}</h2>
                    <p className="text-sm text-slate-500">{selectedUser.email} | {selectedUser.mobile}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggleBlock(selectedUser, selectedUser.effectiveStatus !== 'blocked')} className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10">
                      {selectedUser.effectiveStatus === 'blocked' ? 'Unblock' : 'Block'}
                    </button>
                    <button
                      onClick={() => {
                        const start = dateToYmd();
                        setDraftStatus('pro');
                        setDraftStart(start);
                        setDraftEnd(addDays(start, 29));
                      }}
                      className="rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10"
                    >
                      Free Pro 30 Days
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Status</label>
                    <select value={draftStatus} onChange={event => setDraftStatus(event.target.value as SubscriptionStatus)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none">
                      {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Pro Start Date</label>
                    <input type="date" value={draftStart} onChange={event => setDraftStart(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Pro End Date</label>
                    <input type="date" value={draftEnd} onChange={event => setDraftEnd(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-blue-300" />
                    <h3 className="font-bold text-white">Calendar Active Days</h3>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input type="date" value={newActiveDate} onChange={event => setNewActiveDate(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                    <button type="button" onClick={addActiveDate} className="rounded-lg border border-blue-500/30 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/10">Add Active Day</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {draftDates.map(date => (
                      <button key={date} onClick={() => setDraftDates(prev => prev.filter(item => item !== date))} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:border-rose-500/50">
                        {date} x
                      </button>
                    ))}
                    {draftDates.length === 0 && <span className="text-sm text-slate-500">No specific calendar days selected.</span>}
                  </div>
                </div>

                <button onClick={saveUser} disabled={isSaving} className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save User Access
                </button>
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
              <div className="flex items-center justify-between border-b border-slate-800 p-5">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-emerald-300" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Payment Requests</h2>
                    <p className="text-sm text-slate-500">Approve or reject manual UPI payments</p>
                  </div>
                </div>
                <select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value as PaymentStatus | 'all')} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className="space-y-3 p-5">
                {payments.map(payment => (
                  <div key={payment.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-white">{payment.userName}</h3>
                        <p className="text-xs text-slate-500">{payment.userEmail}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${payment.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : payment.status === 'rejected' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>
                        {payment.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-400">
                      <span>{payment.planName}</span>
                      <span className="text-right font-mono text-white">₹{payment.amount}</span>
                      <span>UTR: {payment.utr}</span>
                      <span className="text-right">{payment.paymentDate}</span>
                    </div>
                    {payment.screenshotUrl && (
                      <a href={payment.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-blue-300 hover:text-blue-200">
                        View screenshot
                      </a>
                    )}
                    {payment.status === 'pending' && (
                      <>
                        <textarea
                          value={remarksByPayment[payment.id] || ''}
                          onChange={event => setRemarksByPayment(prev => ({ ...prev, [payment.id]: event.target.value }))}
                          placeholder="Admin remarks"
                          className="mt-3 h-20 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none"
                        />
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => reviewPayment(payment, 'approve')} disabled={isSaving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                          </button>
                          <button onClick={() => reviewPayment(payment, 'reject')} disabled={isSaving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      </>
                    )}
                    {payment.remarks && <p className="mt-2 text-xs text-slate-500">Remarks: {payment.remarks}</p>}
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
                    No payment requests found.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="mb-4 flex items-center gap-3">
                <Settings className="h-6 w-6 text-amber-300" />
                <h2 className="text-xl font-bold text-white">UPI & Plan Settings</h2>
              </div>
              <div className="space-y-4">
                <input value={settings.upiId} onChange={event => setSettings(prev => ({ ...prev, upiId: event.target.value }))} placeholder="UPI ID" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                <input value={settings.qrImageUrl} onChange={event => setSettings(prev => ({ ...prev, qrImageUrl: event.target.value }))} placeholder="QR image URL" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                <textarea value={settings.paymentInstructions} onChange={event => setSettings(prev => ({ ...prev, paymentInstructions: event.target.value }))} placeholder="Payment instructions" className="h-24 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none" />
                <div className="space-y-3">
                  {plans.map(plan => (
                    <div key={plan.id} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[1fr_90px_90px_70px]">
                      <input value={plan.name} onChange={event => setPlans(prev => prev.map(item => item.id === plan.id ? { ...item, name: event.target.value } : item))} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white outline-none" />
                      <input type="number" value={plan.amount} onChange={event => setPlans(prev => prev.map(item => item.id === plan.id ? { ...item, amount: Number(event.target.value) } : item))} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white outline-none" />
                      <input type="number" value={plan.durationDays} onChange={event => setPlans(prev => prev.map(item => item.id === plan.id ? { ...item, durationDays: Number(event.target.value) } : item))} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white outline-none" />
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={plan.enabled} onChange={event => setPlans(prev => prev.map(item => item.id === plan.id ? { ...item, enabled: event.target.checked } : item))} />
                        Live
                      </label>
                    </div>
                  ))}
                </div>
                <button onClick={saveSettings} disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Settings
                </button>
              </div>
            </div>

            <LegalDisclaimer />
          </section>
        </div>

        {isLoading && (
          <div className="fixed bottom-5 right-5 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 shadow-xl">
            Loading admin data...
          </div>
        )}
      </main>
    </div>
  );
}
