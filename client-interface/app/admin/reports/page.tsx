'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { ProgramClanFilter } from '@/components/shared/ProgramClanFilter';
import { MenteeReportPanel } from '@/components/shared/reports/MenteeReportPanel';

/**
 * Mentee progress reports, from the admin side.
 *
 * The mentor version of this lives inside their own Reports page and is
 * already scoped to the clan they are working in. An admin has no such
 * default, so the only thing this page adds is the choice: a programme, and
 * optionally one clan inside it.
 *
 * The panel itself is the same component. Who may actually be reported on is
 * decided by the server from the caller's access, so a programme admin gets
 * their programmes and nobody else's without this page having to know the
 * difference.
 */
export default function AdminReportsPage() {
  const [scope, setScope] = useState({ programId: '', clanId: '' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="How each mentee is doing over a period you choose - ready to download or send on."
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      <div className="no-print rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Who to report on</h2>
            <p className="text-sm text-muted-foreground">
              Pick a programme for everybody on it, or narrow to a single clan.
            </p>
          </div>
          <ProgramClanFilter
            value={scope}
            onChange={setScope}
          />
        </div>
      </div>

      {!scope.programId && !scope.clanId ? (
        <div className="rounded-2xl border border-border bg-card py-14 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-medium text-foreground">Choose a programme to begin</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A clan is optional - without one you get everybody on the programme.
          </p>
        </div>
      ) : (
        <MenteeReportPanel
          // A clan is the narrower of the two, so it wins when both are set.
          clanId={scope.clanId || null}
          programId={scope.clanId ? null : scope.programId || null}
          title="Mentee reports"
          description="Any period, defaulting to this month. Download them, or email them to somebody without a Pathment account."
        />
      )}
    </div>
  );
}
