'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CircleDollarSign, HourglassIcon, Inbox, ReceiptText, Users } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { PageHeader } from '@/components/platform/PlatformShell';
import { CardSkeleton, money, OrgMark, RelativeTime, SectionCard, StatusPill, TileSkeleton } from '@/components/platform/primitives';
import { MetricTile } from '@/components/shared/MetricTile';
import { ErrorState } from '@/components/shared/ErrorState';

/**
 * The console overview, in the same shapes as the admin dashboard: MetricTile
 * stat tiles and the hand-rolled segment/bucket charts OrganizationCharts
 * established - aggregated counts that stay readable at any scale.
 */
const STATUS_GROUPS = [
  { key: 'active', label: 'Active', color: 'bg-teal-500' },
  { key: 'trial', label: 'Trial', color: 'bg-sky-400' },
  { key: 'past_due', label: 'Past due', color: 'bg-amber-400' },
  { key: 'suspended', label: 'Suspended', color: 'bg-rose-500' },
  { key: 'archived', label: 'Archived', color: 'bg-slate-300 dark:bg-slate-600' },
] as const;

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

  if (loading) {
    return (
      <div className="space-y-5">
        <TileSkeleton />
        <div className="grid gap-5 xl:grid-cols-2">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    );
  }
  if (error || !metrics) return <ErrorState message={error || undefined} onRetry={refetch} variant="page" />;

  const orgs = metrics.organizations;
  const statusTotal = Math.max(1, orgs.total);
  const maxPlanCount = Math.max(1, ...metrics.billing.planDistribution.map((plan) => plan.count));

  return (
    <div>
      <PageHeader title="Overview" description="Every workspace on the platform, at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Workspaces" value={orgs.total.toLocaleString()} icon={Building2} tone={0}
          hint={`+${orgs.newLast30Days} in the last 30 days`} />
        <MetricTile label="Accounts" value={metrics.users.total.toLocaleString()} icon={Users} tone={1}
          hint={`${metrics.users.activeMemberships.toLocaleString()} active memberships · +${metrics.users.newLast30Days} new`} />
        <MetricTile label="MRR (list price)" value={money(metrics.billing.mrrCents)} icon={CircleDollarSign} tone={2}
          hint="Active + past-due subscriptions, monthly-ized" />
        <MetricTile label="Plan requests" value={metrics.billing.pendingPlanRequests} icon={ReceiptText} tone={3}
          hint={`${metrics.billing.trialsExpiringIn14Days} trial${metrics.billing.trialsExpiringIn14Days === 1 ? '' : 's'} end within 14 days`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg">Workspace lifecycle</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {orgs.total.toLocaleString()} workspace{orgs.total === 1 ? '' : 's'} on the platform · current snapshot
          </p>
          <div className="my-6 flex h-7 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {STATUS_GROUPS.map((group) => {
              const count = orgs.byStatus[group.key] || 0;
              if (!count) return null;
              return <div key={group.key} className={group.color} style={{ width: `${(count / statusTotal) * 100}%` }} />;
            })}
          </div>
          <ul className="space-y-2.5">
            {STATUS_GROUPS.map((group) => (
              <li key={group.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${group.color}`} aria-hidden />
                  {group.label}
                </span>
                <span className="font-semibold tabular-nums">{(orgs.byStatus[group.key] || 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg">Plan distribution</h2>
          <p className="mt-1 text-sm text-muted-foreground">Subscriptions per published plan</p>
          <ul className="mt-6 space-y-4">
            {metrics.billing.planDistribution.map((plan) => (
              <li key={plan.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{plan.name}</span>
                  <span className="tabular-nums text-muted-foreground">{plan.count.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, Math.round((plan.count / maxPlanCount) * 100))}%` }} />
                </div>
              </li>
            ))}
            {!metrics.billing.planDistribution.length ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : null}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Inbox className="h-4 w-4" aria-hidden /> {metrics.leads.new} new lead{metrics.leads.new === 1 ? '' : 's'} waiting
            </span>
            <Link href="/platform/leads" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              Open inbox <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard
          title="Newest workspaces"
          description="Most recently created, any status."
          actions={<Link href="/platform/organizations" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">All workspaces <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <ul className="divide-y divide-border">
            {(recent?.organizations || []).map((org) => (
              <li key={org.id}>
                <Link href={`/platform/organizations/${org.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50">
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
                  <p className="truncate text-sm font-medium capitalize">{entry.action.replace(/^PLATFORM_/, '').replace(/_/g, ' ').toLowerCase()}</p>
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

      {metrics.billing.trialsExpiringIn14Days > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <HourglassIcon className="h-3.5 w-3.5" aria-hidden />
          {metrics.billing.trialsExpiringIn14Days} trial{metrics.billing.trialsExpiringIn14Days === 1 ? '' : 's'} expiring in the next 14 days — see the workspace directory, filtered by trial.
        </p>
      ) : null}
    </div>
  );
}
