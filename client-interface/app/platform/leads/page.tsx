'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Rocket, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type BuyerLeadRow, type LeadStatus } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { Pager, RelativeTime, StatusPill } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

const PIPELINE: Array<{ key: '' | LeadStatus; label: string }> = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'provisioned', label: 'Provisioned' },
  { key: 'lost', label: 'Lost' },
];

/** Prefill the provisioning wizard from what the lead already told us. */
function provisionHref(lead: BuyerLeadRow): string {
  const [first, ...rest] = lead.fullName.trim().split(/\s+/);
  const params = new URLSearchParams({
    lead: lead.id,
    name: lead.organizationName,
    email: lead.email,
    first: first || '',
    last: rest.join(' ') || first || '',
  });
  if (lead.planInterest) {
    const plan = lead.planInterest.toLowerCase().match(/starter|growth|scale/)?.[0];
    if (plan) params.set('plan', plan);
  }
  return `/platform/provision?${params.toString()}`;
}

function LeadCard({ lead }: { lead: BuyerLeadRow }) {
  const canSupport = useGate('support');
  const canBilling = useGate('billing');
  const queryClient = useQueryClient();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');

  const update = useMutation({
    mutationFn: (input: { status?: LeadStatus; notes?: string }) => platformApi.leads.update(lead.id, input),
    onSuccess: () => {
      toast.success('Lead updated');
      queryClient.invalidateQueries({ queryKey: ['platform', 'leads'] });
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the lead')),
  });

  const facts = [
    lead.organizationSize && `${lead.organizationSize} people`,
    lead.participants && `${lead.participants} participants`,
    lead.programType,
    lead.launchTimeframe && `launch: ${lead.launchTimeframe}`,
    lead.planInterest && `interested in ${lead.planInterest}`,
  ].filter(Boolean);

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {lead.organizationName}
            <StatusPill status={lead.status} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {lead.fullName} · <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
            {' · '}<RelativeTime date={lead.createdAt} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSupport ? (
            <button
              type="button"
              onClick={() => setNotesOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <StickyNote className="h-3.5 w-3.5" aria-hidden /> Notes
            </button>
          ) : null}
          {canBilling && lead.status !== 'provisioned' ? (
            <Link
              href={provisionHref(lead)}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden /> Provision
            </Link>
          ) : null}
          {lead.provisionedOrganization ? (
            <Link
              href={`/platform/organizations/${lead.provisionedOrganization.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
            >
              Open {lead.provisionedOrganization.name}
            </Link>
          ) : null}
        </div>
      </div>

      {facts.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <span key={fact as string} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{fact}</span>
          ))}
        </div>
      ) : null}
      {lead.message ? <p className="mt-2.5 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed">{lead.message}</p> : null}

      {canSupport ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {(['new', 'contacted', 'qualified', 'lost'] as const).map((status) => (
            <button
              key={status}
              type="button"
              disabled={update.isPending || lead.status === status}
              onClick={() => update.mutate({ status })}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize',
                lead.status === status ? 'bg-brand-600 text-white' : 'border border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {status}
            </button>
          ))}
        </div>
      ) : null}

      {notesOpen ? (
        <div className="mt-3">
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
            placeholder="Internal notes for this lead…"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ notes })}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-brand-700"
            >
              Save notes
            </button>
          </div>
        </div>
      ) : lead.notes ? (
        <p className="mt-2.5 text-[11px] text-muted-foreground">📝 {lead.notes}</p>
      ) : null}
    </li>
  );
}

export default function LeadsPage() {
  const [status, setStatus] = useState<'' | LeadStatus>('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ status: status || undefined, page, limit: 25 }), [status, page]);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.leads(params),
    queryFn: () => platformApi.leads.list(params),
    staleTime: STALE.short,
  });

  return (
    <div>
      <PageHeader title="Leads" description="Enquiries from the marketing site, ready to become workspaces." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {PIPELINE.map((stage) => {
          const count = stage.key === ''
            ? Object.values(data?.countsByStatus || {}).reduce((sum, value) => sum + value, 0)
            : data?.countsByStatus?.[stage.key] || 0;
          return (
            <button
              key={stage.key || 'all'}
              type="button"
              onClick={() => { setStatus(stage.key); setPage(1); }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium',
                status === stage.key ? 'bg-brand-600 text-white' : 'border border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {stage.label}{data ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.leads.length ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" aria-hidden />}
          title="No leads here"
          description="New enquiries from the pricing and contact pages will appear in this inbox."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data.leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
          </ul>
          <div className="mt-3 rounded-2xl border border-border bg-card">
            <Pager page={data.page} pages={data.pages} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
