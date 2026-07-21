'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Crown, LogOut, Menu, User, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AuthModal from '@/components/AuthModal';
import SubscriptionBadge from '@/components/SubscriptionBadge';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/screener', label: 'AI Screener' },
  { href: '/fundamentals', label: 'Fundamentals' },
  { href: '/seasonality', label: 'Seasonality' },
  { href: '/options', label: 'Options Chain' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/strategies', label: 'Strategies' },
];

interface AppHeaderProps {
  /** Optional page-specific control - e.g. the Dashboard's symbol search bar - rendered
   * in the header's action row on desktop and as its own full-width row on mobile. */
  children?: React.ReactNode;
}

/**
 * Shared header + navigation used across every page. Centralizing this in one place
 * means every page gets a working mobile menu (the old per-page headers used
 * `hidden md:flex` for nav with no mobile fallback at all) and active-link
 * highlighting derived from the real URL via usePathname(), instead of each page
 * hardcoding which of its own copy-pasted links should look "active."
 *
 * Colors (bg-ink, text-accent, border-border-hair, ...) come from the @theme tokens in
 * app/globals.css - Tailwind v4 auto-generates a utility per `--color-*` custom
 * property, so these are ordinary utility classes, not arbitrary values.
 */
export default function AppHeader({ children }: AppHeaderProps) {
  const pathname = usePathname();
  const { user, isLoaded, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  return (
    <header className="sticky top-0 z-50 border-b border-border-hair bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong">
              <Activity className="h-4 w-4 text-ink" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-fg">
              StockSense <span className="text-accent">Pro</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`py-1 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'signal-underline text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className={`py-1 text-sm font-medium transition-colors ${
                  isActive('/admin') ? 'signal-underline text-accent-strong' : 'text-accent hover:text-accent-strong'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:block">{children}</div>

          <div className="hidden h-6 w-px bg-border-hair md:block" />

          {!isLoaded ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-surface-raised" />
          ) : user ? (
            <div className="hidden items-center gap-3 sm:flex">
              {!user.isPro && (
                <Link href="/upgrade" className="badge badge-bullish hover:opacity-80">
                  <Crown className="h-3 w-3" />
                  Upgrade
                </Link>
              )}
              <Link
                href="/account"
                className="hidden items-center gap-2 rounded-lg border border-border-hair bg-surface px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg lg:flex"
              >
                <User className="h-3.5 w-3.5" />
                {user.name || user.email.split('@')[0]}
              </Link>
              <SubscriptionBadge user={user} />
              <button
                onClick={() => logout()}
                className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-bearish-soft hover:text-bearish"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-strong sm:block"
            >
              Sign In
            </button>
          )}

          <button
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-hair text-fg-muted lg:hidden"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-border-hair bg-ink px-4 pb-4 pt-2 lg:hidden">
          {children && <div className="mb-3 pt-2">{children}</div>}

          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-accent-soft text-accent-strong'
                    : 'text-fg-muted hover:bg-surface-raised hover:text-fg'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-accent hover:bg-surface-raised"
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="mt-3 border-t border-border-hair pt-3">
            {!isLoaded ? null : user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border-hair bg-surface-raised">
                    <User className="h-4 w-4 text-fg-muted" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-fg">{user.name || user.email.split('@')[0]}</span>
                    <SubscriptionBadge user={user} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!user.isPro && (
                    <Link href="/upgrade" onClick={() => setIsMobileMenuOpen(false)} className="badge badge-bullish">
                      <Crown className="h-3 w-3" />
                      Upgrade
                    </Link>
                  )}
                  <button
                    onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                    className="rounded-lg p-2 text-fg-subtle hover:bg-bearish-soft hover:text-bearish"
                    aria-label="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Sign In / Up
              </button>
            )}
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
}
