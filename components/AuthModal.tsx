'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Lock, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import LegalDisclaimer from '@/components/LegalDisclaimer';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void | Promise<void> }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
  }
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const modalScrollRef = useRef<HTMLDivElement | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const { login, signup, googleLogin } = useAuth();

  // Belt-and-suspenders fix for the modal ever appearing to open "mid-scroll" (reported
  // as the form looking cut off / half-shown, with only the password hint, disclaimer,
  // and Google section visible on open instead of the name/email fields at the top).
  // Runs on every open and every login/signup mode switch, since switching modes changes
  // the content height and should also reset the scroll position.
  useEffect(() => {
    if (isOpen) modalScrollRef.current?.scrollTo({ top: 0 });
  }, [isOpen, isLogin]);

  useEffect(() => {
    if (!isOpen || !googleClientId) return;

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const handleReady = () => setIsGoogleReady(true);

    if (window.google?.accounts?.id) {
      handleReady();
      return;
    }

    if (existingScript) {
      existingScript.addEventListener('load', handleReady, { once: true });
      return () => existingScript.removeEventListener('load', handleReady);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleReady, { once: true });
    script.addEventListener('error', () => setError('Google Sign-In could not be loaded.'));
    document.head.appendChild(script);

    return () => script.removeEventListener('load', handleReady);
  }, [googleClientId, isOpen]);

  useEffect(() => {
    if (!isOpen || !googleClientId || !isGoogleReady || !googleButtonRef.current || !window.google?.accounts?.id) return;

    googleButtonRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!response.credential) {
          setError('Google sign-in token missing.');
          return;
        }
        if (!acceptedDisclaimer) {
          setError('Google sign-in ke liye disclaimer accept karna zaroori hai.');
          return;
        }

        setError('');
        setIsSubmitting(true);
        try {
          await googleLogin(response.credential, acceptedDisclaimer);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
          setIsSubmitting(false);
        }
      },
    });
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: isLogin ? 'signin_with' : 'signup_with',
      shape: 'rectangular',
      width: 360,
    });
  }, [acceptedDisclaimer, googleClientId, googleLogin, isGoogleReady, isLogin, isOpen, onClose]);

  if (!isOpen) return null;

  const resetTransientState = () => {
    setError('');
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup({ name, mobile, email, password, acceptedDisclaimer });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div ref={modalScrollRef} className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-border-hair bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-hair p-4">
          <div>
            <h2 className="text-xl font-bold text-fg">
              {isLogin ? 'Welcome Back' : 'Create Free Account'}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              {isLogin ? 'Use your registered email and password.' : 'New users start as Free until admin approves Pro access.'}
            </p>
          </div>
          <button onClick={onClose} className="text-fg-muted transition-colors hover:text-fg" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Only shown for signup - a returning user logging in doesn't need this
              context, and skipping it keeps the login form (the more common path,
              since most people open this modal to sign back in) short enough to fit
              without scrolling on typical screens. */}
          {!isLogin && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-hair bg-ink-raised p-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-accent-soft p-2">
                  <Lock className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg">Free by default</h3>
                  <p className="mt-1 text-xs text-fg-muted">Basic search, chart and education tools.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-bullish-soft p-2">
                  <UserPlus className="h-4 w-4 text-bullish" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg">Admin-approved Pro</h3>
                  <p className="mt-1 text-xs text-fg-muted">No user can self-upgrade to Pro.</p>
                </div>
              </div>
            </div>
          )}

          {!isLogin && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-fg-muted">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-fg-muted">Mobile</label>
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="9876543210"
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-fg-muted">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-fg-muted">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-fg outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <LegalDisclaimer compact={isLogin} />

          {!isLogin && (
            <label className="flex items-start gap-3 rounded-xl border border-border-hair bg-ink-raised p-3 text-left text-xs text-fg-muted">
              <input
                type="checkbox"
                required
                checked={acceptedDisclaimer}
                onChange={e => setAcceptedDisclaimer(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border-strong bg-surface-raised accent-accent"
              />
              <span>I accept the educational-purpose disclaimer and understand this is not financial advice.</span>
            </label>
          )}

          {googleClientId && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-fg-subtle">
                <span className="h-px flex-1 bg-border-hair" />
                Google
                <span className="h-px flex-1 bg-border-hair" />
              </div>
              {isLogin && (
                <label className="flex items-start gap-3 rounded-xl border border-border-hair bg-ink-raised p-3 text-left text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={acceptedDisclaimer}
                    onChange={e => setAcceptedDisclaimer(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border-strong bg-surface-raised accent-accent"
                  />
                  <span>I accept the educational-purpose disclaimer for Google sign-in.</span>
                </label>
              )}
              <div className="flex justify-center rounded-xl border border-border-hair bg-ink-raised p-3">
                <div ref={googleButtonRef} className={isSubmitting ? 'pointer-events-none opacity-60' : ''} />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-bearish/30 bg-bearish-soft p-3 text-sm text-bearish">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 font-semibold text-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLogin ? 'Sign In' : 'Create Free Account'}
          </button>

          <p className="text-center text-sm text-fg-muted">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                resetTransientState();
              }}
              className="font-medium text-accent hover:text-accent-strong"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
