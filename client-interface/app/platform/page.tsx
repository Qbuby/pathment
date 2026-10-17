'use client';

import Link from 'next/link';
import {
  Building2, Users, CircleDollarSign, ReceiptText, HourglassIcon, Inbox, ArrowRight,
} from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { PageHeader } from '@/components/platform/PlatformShell';
import { money, OrgMark, RelativeTime, SectionCard, StatusPill } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';

function Tile({ label, value, hint, icon: Icon, href }: {
  label: string; value: React.ReactNode; hint?: string; icon: typeof Users; href?: string;
}) {
  const body = (
    <div className="h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-500/40">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="rounded-xl bg-muted p-2"><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <p className="my-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function PlatformOverviewPage() {
  const { data: metrics, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.metrics,
    queryFn: platformApi.metrics,
    staleTime: STALE.short,
  });
  const { data: recent } = useApiQuery({
    queryKey: qk.platform.organizations({ sort: 'created', limit: 6 }),
    queryFn: () => platformApi.organizations.list({ sort: 'created', limit: 6 }),
    staleTime: STALE.short,
  });
  const { data: audit } = useApiQuery({
    queryKey: qk.platform.audit({ page: 1, limit: 8 }),
    queryFn: () => platformApi.audit.list({ page: 1, limit: 8 }),
    staleTime: STALE.short,
  });

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" label="Loading metrics" /></div>;
  if (error || !metrics) return <ErrorState message={error || undefined} onRetry={refetch} variant="page" />;

  const orgs = metrics.organizations;
  const statusOrder = ['active', 'trial', 'past_due', 'suspended', 'archived'] as const;
  const maxPlanCount = Math.max(1, ...metrics.billing.planDistribution.map((plan) => plan.count));

  return (
    <div>
      <PageHeader title="Overview" description="Every workspace on the platform, at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Workspaces" value={orgs.total.toLocaleString()} hint={`+${orgs.newLast30Days} in the last 30 days`} icon={Building2} href="/platform/organizations" />
        <Tile label="Accounts" value={metrics.users.total.toLocaleString()} hint={`${metrics.users.activeMemberships.toLocaleString()} active memberships · +${metrics.users.newLast30Days} new`} icon={Users} />
        <Tile label="MRR (list price)" value={money(metrics.billing.mrrCents)} hint="Active + past-due subscriptions, monthly-ized" icon={CircleDollarSign} href="/platform/billing" />
        <Tile label="Pending plan requests" value={metrics.billing.pendingPlanRequests} hint={`${metrics.billing.trialsExpiringIn14Days} trials end within 14 days`} icon={ReceiptText} href="/platform/billing" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Workspace status" description="Lifecycle distribution across the platform.">
          <ul className="space-y-2.5">
            {statusOrder.map((status) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <StatusPill status={status} />
                <span className="text-sm font-semibold tabular-nums">{orgs.byStatus[status] || 0}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Plan distribution" description="Subscriptions per published plan.">
          <ul className="space-y-3">
            {metrics.billing.planDistribution.map((plan) => (
              <li key={plan.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{plan.name}</span>
                  <span className="tabular-nums text-muted-foreground">{plan.count}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, Math.round((plan.count / maxPlanCount) * 100))}%` }} />
                </div>
              </li>
            ))}
            {!metrics.billing.planDistribution.length ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : null}
          </ul>
        </SectionCard>

        <SectionCard
          title="New leads"
          description="Marketing enquiries waiting for a reply."
          actions={<Link href="/platform/leads" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">Open inbox <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <div className="flex items-center gap-4">
            <span className="rounded-2xl bg-muted p-3"><Inbox className="h-6 w-6" aria-hidden /></span>
            <div>
              <p className="text-3xl font-semibold tabular-nums">{metrics.leads.new}</p>
              <p className="text-xs text-muted-foreground">leads with status “new”</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
            <HourglassIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {metrics.billing.trialsExpiringIn14Days} trial{metrics.billing.trialsExpiringIn14Days === 1 ? '' : 's'} expiring in the next 14 days
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Newest workspaces"
          description="Most recently created, any status."
          actions={<Link href="/platform/organizations" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">All workspaces <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <ul className="divide-y divide-border">
            {(recent?.organizations || []).map((org) => (
              <li key={org.id}>
                <Link href={`/platform/organizations/${org.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/50 -mx-2 px-2 rounded-lg">
                  <OrgMark name={org.name} logoUrl={org.logoUrl} color={org.primaryColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{org.name}</p>
                    <p className="truncate text-xs text-muted-foreground">/{org.slug} · {org.plan?.name || 'no plan'}</p>
                  </div>
                  <StatusPill status={org.status} />
                  <span className="text-xs text-muted-foreground"><RelativeTime date={org.createdAt} /></span>
                </Link>
              </li>
            ))}
            {!recent?.organizations?.length ? <p className="py-2 text-sm text-muted-foreground">Nothing yet.</p> : null}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent operator activity"
          description="The platform audit trail."
          actions={<Link href="/platform/audit" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">Full trail <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <ul className="divide-y divide-border">
            {(audit?.entries || []).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.action.replace(/^PLATFORM_/, '').replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : entry.actorEmail || 'system'}
                    {entry.targetOrganization ? ` · ${entry.targetOrganization.name}` : entry.targetId ? ` · ${entry.targetId}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground"><RelativeTime date={entry.createdAt} /></span>
              </li>
            ))}
            {!audit?.entries?.length ? <p className="py-2 text-sm text-muted-foreground">No operator actions recorded yet.</p> : null}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
