'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-fg-muted">
      <h2 className="text-4xl font-bold mb-4 text-bearish">Something went wrong!</h2>
      <p className="text-fg-muted mb-8 max-w-md text-center">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-3 bg-accent hover:bg-accent-strong text-ink font-semibold rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
