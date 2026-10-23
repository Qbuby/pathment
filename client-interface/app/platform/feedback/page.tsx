'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bug, Lightbulb, MessageSquarePlus, Building2, Monitor, Paperclip, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformFeedbackQuery } from '@/lib/services/platform-api';
import type { FeedbackReport, FeedbackStatus, FeedbackLane } from '@/lib/services/feedback-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { btn, Pager, RelativeTime, StatusPill, TableSkeleton } from '@/components/platform/primitives';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

/**
 * The product feedback inbox, spanning every workspace.
 *
 * The other half of "What's new". An entry there is authored once and reaches
 * every workspace; a bug report used to reach only the admin board of the
 * workspace that filed it, where nobody could set it to `fixed` and the person
 * who could never saw it. Reports land here now, carrying the customer and the
 * build they came from, and setting a status still notifies the reporter.
 */

const STATUSES: Array<{ key: '' | FeedbackStatus; label: string }> = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_review', label: 'In review' },
  { key: 'planned', label: 'Planned' },
  { key: 'fixed', label: 'Fixed' },
  { key: 'added', label: 'Added' },
  { key: 'declined', label: 'Declined' },
];

const LANES: Array<{ key: FeedbackLane | 'all'; label: string; hint: string }> = [
  { key: 'product', label: 'Product', hint: 'Bugs and suggestions about Pathment' },
  { key: 'workspace', label: 'Workspace', hint: 'Questions a workspace admin owns' },
  { key: 'all', label: 'Everything', hint: 'Both lanes' },
];

const TYPE_ICON = { bug: Bug, suggestion: Lightbulb, other: MessageSquarePlus } as const;

/** The next statuses worth one click, in the order a report usually travels. */
const QUICK: FeedbackStatus[] = ['in_review', 'planned', 'fixed', 'added', 'declined'];

function ReportCard({ report }: { report: FeedbackReport }) {
  const canSupport = useGate('support');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(report.resolutionNote || '');
  const Icon = TYPE_ICON[report.type] || MessageSquarePlus;

  const update = useMutation({
    mutationFn: (input: { status?: FeedbackStatus; resolutionNote?: string; priority?: 'low' | 'normal' | 'high' }) =>
      platformApi.feedback.update(report.id, input),
    onSuccess: () => {
      toast.success('Updated, and the reporter has been told');
      queryClient.invalidateQueries({ queryKey: ['platform', 'feedback'] });
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the report')),
  });

  // The questions anyone triaging asks first: which customer, which build,
  // which device. A report missing them needs a reply before it needs a fix.
  const facts = [
    report.organization?.name,
    report.platformLabel,
    report.appVersion && `v${report.appVersion}`,
    report.device,
    report.reporter?.role,
  ].filter(Boolean) as string[];

  return (
    <li className="rounded-3xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{report.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{report.reporter?.name || 'Someone'}</span>
              {report.reporter?.email ? <span className="opacity-70">{report.reporter.email}</span> : null}
              <span aria-hidden>·</span>
              <RelativeTime date={report.createdAt} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report.lane === 'workspace' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Building2 className="h-3 w-3" aria-hidden /> Workspace
            </span>
          ) : null}
          <StatusPill status={report.status} />
        </div>
      </div>

      {report.description ? (
        <p className="mt-2.5 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{report.description}</p>
      ) : null}

      {facts.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <Monitor className="h-3 w-3" aria-hidden />
          {facts.map((fact, index) => (
            <span key={`${fact}-${index}`} className="rounded bg-muted px-1.5 py-0.5">{fact}</span>
          ))}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        {report.pageUrl ? (
          <span className="truncate text-muted-foreground" title={report.pageUrl}>Where: {report.pageUrl}</span>
        ) : null}
        {report.attachmentUrl ? (
          <a
            href={report.attachmentUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
          >
            <Paperclip className="h-3 w-3" aria-hidden />
            {report.attachmentName || 'Attachment'}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>

      {report.resolutionNote && !open ? (
        <p className="mt-2.5 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          Replied: {report.resolutionNote}
        </p>
      ) : null}

      {canSupport ? (
        <div className="mt-3 border-t border-border pt-3">
          {open ? (
            <div className="space-y-2">
              <label htmlFor={`note-${report.id}`} className="text-[11px] font-medium text-foreground">
                What should the reporter be told?
              </label>
              <textarea
                id={`note-${report.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Fixed in v1.4.2 — thanks for the screenshot."
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                {QUICK.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ status, resolutionNote: note })}
                    className={cn(btn.ghostSm, 'capitalize')}
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
                <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-muted-foreground hover:underline">
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Setting a status notifies the reporter, so write the note first.
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className={btn.ghostSm}>
              Set status / reply
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function PlatformFeedbackPage() {
  const [lane, setLane] = useState<FeedbackLane | 'all'>('product');
  const [status, setStatus] = useState<'' | FeedbackStatus>('');
  const [page, setPage] = useState(1);

  const params = useMemo<PlatformFeedbackQuery>(
    () => ({ lane, status: status || undefined, page, limit: 25 }),
    [lane, status, page],
  );

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.feedback(params as Record<string, unknown>),
    queryFn: () => platformApi.feedback.list(params),
    staleTime: STALE.short,
  });

  const activeLane = LANES.find((entry) => entry.key === lane);

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Bugs and suggestions from every workspace — the return path on the same channel as What's new."
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {LANES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            title={entry.hint}
            onClick={() => { setLane(entry.key); setPage(1); }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium',
              lane === entry.key ? 'bg-brand-600 text-white' : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {entry.label}
          </button>
        ))}
        {data ? (
          <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
            {data.openCount} open in product
          </span>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((entry) => {
          const count = entry.key === ''
            ? Object.values(data?.byStatus || {}).reduce((sum, value) => sum + value, 0)
            : data?.byStatus?.[entry.key] || 0;
          return (
            <button
              key={entry.key || 'all'}
              type="button"
              onClick={() => { setStatus(entry.key); setPage(1); }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium',
                status === entry.key ? 'bg-foreground text-background' : 'border border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {entry.label}
              {data && lane === 'product' ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card"><TableSkeleton rows={6} /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.reports.length ? (
        <EmptyState
          icon={<Bug className="h-8 w-8" aria-hidden />}
          title="Nothing here"
          description={`No ${activeLane?.label.toLowerCase() || 'product'} reports match this filter.`}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data.reports.map((report) => <ReportCard key={report.id} report={report} />)}
          </ul>
          <div className="mt-3 rounded-3xl border border-border bg-card">
            <Pager page={data.page} pages={data.pages} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
