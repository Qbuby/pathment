'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, TriangleAlert } from 'lucide-react';

/**
 * Console-local error boundary. The console is an internal operator surface,
 * so unlike the product boundary it shows the REAL error - an operator
 * staring at "Something went wrong" with the fix one message away helps
 * nobody. This also stops a console crash from unmounting the whole app
 * shell through the global boundary.
 */
export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[platform console error]', error); }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-8">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-red-50 p-3 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <TriangleAlert className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">The console hit an error</h1>
            <p className="mt-1 text-sm text-muted-foreground">This page failed to render. The exact error:</p>
            <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-muted/60 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {error.message || String(error)}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden /> Try again
              </button>
              <Link href="/platform" className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Console overview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
