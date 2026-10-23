'use client';

import { useEffect } from 'react';
import { ErrorView } from '@/components/shared/ErrorView';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[global error boundary]', error); }, [error]);
  return (
    <html lang="en">
      <body>
        {/* No `title` override: ErrorView reads the error and says the most
            specific true thing — "You are offline" and "Your session ended"
            are both more useful than any headline this file could pick. */}
        <ErrorView error={error} reset={reset} home="/" />
      </body>
    </html>
  );
}
