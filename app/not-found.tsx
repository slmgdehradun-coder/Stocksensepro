'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-fg-muted">
      <h2 className="text-4xl font-bold mb-4 text-fg">404 - Not Found</h2>
      <p className="text-fg-muted mb-8">Could not find requested resource</p>
      <Link 
        href="/"
        className="px-6 py-3 bg-accent hover:bg-accent-strong text-ink font-semibold rounded-lg transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
