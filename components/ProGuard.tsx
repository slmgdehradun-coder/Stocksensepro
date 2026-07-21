'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AuthModal from '@/components/AuthModal';
import LegalDisclaimer from '@/components/LegalDisclaimer';

interface ProGuardProps {
  children: React.ReactNode;
  featureName: string;
}

export default function ProGuard({ children, featureName }: ProGuardProps) {
  const { user, isLoaded } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (user?.isPro) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-300 font-sans">
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">StockSense Pro</span>
          </Link>
          {user ? (
            <Link href="/upgrade" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              Upgrade
            </Link>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10">
          <Lock className="h-7 w-7 text-blue-300" />
        </div>
        <h1 className="text-3xl font-bold text-white">{featureName} is a Pro module</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Your current access is {user?.effectiveStatus || 'guest'}. Pro access starts only after admin approval or an active subscription date.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/upgrade" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
            Upgrade to Pro
          </Link>
          <Link href="/" className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800">
            Back to Dashboard
          </Link>
        </div>
        <LegalDisclaimer className="mt-8 text-left" />
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
