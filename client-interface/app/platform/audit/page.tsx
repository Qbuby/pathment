'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformAuditEntry } from '@/lib/services/platform-api';
import { PageHeader } from '@/components/platform/PlatformShell';
import { Pager, RelativeTime, TableSkeleton } from '@/components/platform/primitives';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { cn } from '@/components/ui/utils';

/** Append-only operator evidence. Nothing here can be edited, including by owners. */
function Entry({ entry }: { entry: PlatformAuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.oldValues || entry.newValues || entry.reason);
  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((value) => !value)}
        className={cn('flex w-full items-center justify-between gap-3 text-left', hasDetail && 'cursor-pointer')}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {entry.action.replace(/^PLATFORM_/, '').replace(/_/g, ' ').toLowerCase()}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ''}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName} <${entry.actor.email}>` : entry.actorEmail || 'system'}
            {entry.targetOrganization ? (
              <> · <Link href={`/platform/organizations/${entry.targetOrganization.id}`} className="hover:underline" onClick={(event) => event.stopPropagation()}>{entry.targetOrganization.name}</Link></>
            ) : null}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <RelativeTime date={entry.createdAt} />
          {hasDetail ? <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden /> : null}
        </span>
      </button>
      {open ? (
        <div className="mt-2.5 space-y-2 rounded-xl bg-muted/50 p-3 text-xs">
          {entry.reason ? <p><span className="font-semibold">Reason:</span> {entry.reason}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.oldValues ? (
              <div>
                <p className="mb-1 font-semibold text-muted-foreground">Before</p>
                <pre className="overflow-x-auto rounded-lg bg-background p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(entry.oldValues, null, 2)}</pre>
              </div>
            ) : null}
            {entry.newValues ? (
              <div>
                <p className="mb-1 font-semibold text-muted-foreground">After</p>
                <pre className="overflow-x-auto rounded-lg bg-background p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(entry.newValues, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 300);

  const { data: actions } = useApiQuery({
    queryKey: qk.platform.auditActions,
    queryFn: platformApi.audit.actions,
    staleTime: STALE.long,
  });

  const params = useMemo(() => ({ q: debounced || undefined, action: action || undefined, page, limit: 50 }), [debounced, action, page]);
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.audit(params),
    queryFn: () => platformApi.audit.list(params),
    staleTime: STALE.short,
  });

  const actionOptions = useMemo(() => ([
    { value: '', label: 'Any action' },
    ...(actions || []).map((name) => ({ value: name, label: name.replace(/^PLATFORM_/, '').replace(/_/g, ' ').toLowerCase() })),
  ]), [actions]);

  return (
    <div>
      <PageHeader title="Audit trail" description="Append-only evidence of every operator action. Nobody can edit it, including owners." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:flex-none sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(event) => { setQ(event.target.value); setPage(1); }}
            placeholder="Search action, target or actor…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </label>
        <SelectMenu value={action} onChange={(value) => { setAction(value); setPage(1); }} options={actionOptions} ariaLabel="Filter by action" className="w-64" />
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card"><TableSkeleton rows={8} /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.entries.length ? (
        <EmptyState icon={<ScrollText className="h-8 w-8" aria-hidden />} title="No entries match" description="Operator actions will appear here as they happen." />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {data.entries.map((entry) => <Entry key={entry.id} entry={entry} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
