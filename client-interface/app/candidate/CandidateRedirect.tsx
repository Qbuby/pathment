'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { workspacePath } from '@/lib/services/workspace-scope';

/**
 * The old candidate area, pointing at where it went.
 *
 * A selection-pool candidate now works in the learner workspace with their
 * round as the scope, so `/candidate/*` is gone as a place. These routes
 * remain because links to them do not: every notification sent before this
 * change carries one in `action_url`, and those rows live in the database for
 * as long as the account does. A redirect costs one file; a dead link in a
 * stored email costs somebody their qualifying work.
 *
 * `replace`, so the old URL does not sit in the back button.
 */
export function CandidateRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(workspacePath(to)); }, [router, to]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      <span className="sr-only">Taking you to your qualifying round…</span>
    </div>
  );
}
