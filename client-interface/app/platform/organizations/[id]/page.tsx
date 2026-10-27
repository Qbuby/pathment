'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { CardSkeleton, OrgMark, Region, RelativeTime, StatusPill } from '@/components/platform/primitives';
import { OverviewTab, PlanSummary, PeopleTab, ActivityTab } from '@/components/platform/OrgDetailTabs';
import { ErrorState } from '@/components/shared/ErrorState';
import { cn } from '@/components/ui/utils';
import { PlanActions } from '@/components/platform/PlanActions';
import { LifecycleTab } from '@/components/platform/LifecycleTab';
import { FeatureUsageTab } from '@/components/platform/FeatureUsageTab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan & billing' },
  { key: 'people', label: 'People' },
  { key: 'activity', label: 'Activity' },
  { key: 'usage', label: 'Feature usage' },
  { key: 'danger', label: 'Lifecycle' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabKey>('overview');

  const { data: detail, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.organization(id),
    queryFn: () => platformApi.organizations.detail(id),
    staleTime: STALE.short,
  });

  if (loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton lines={2} />
        <div className="grid gap-5 xl:grid-cols-2"><CardSkeleton lines={5} /><CardSkeleton lines={5} /></div>
      </div>
    );
  }
  if (error || !detail) return <ErrorState message={error || 'Workspace not found'} onRetry={refetch} variant="page" />;

  const { organization } = detail;

  return (
    <div>
      <Link href="/platform/organizations" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All workspaces
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <OrgMark name={organization.name} logoUrl={organization.logoUrl} color={organization.primaryColor} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{organization.name}</h1>
            <StatusPill status={organization.status} />
            {organization.isDemo ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">demo</span> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">/w/{organization.slug}</span>
            <span>created <RelativeTime date={organization.createdAt} /></span>
            <span>last activity <RelativeTime date={detail.lastActivityAt || organization.updatedAt} /></span>
          </p>
        </div>
        <a
          href={`/w/${organization.slug}/login`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Open workspace <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <div className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              tab === item.key
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-200 dark:shadow-none'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <Region label="overview"><OverviewTab detail={detail} /></Region> : null}
      {tab === 'plan' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Region label="plan summary"><PlanSummary detail={detail} /></Region>
          <Region label="operator actions"><PlanActions detail={detail} organizationId={id} onChanged={refetch} /></Region>
        </div>
      ) : null}
      {tab === 'people' ? <Region label="people"><PeopleTab organizationId={id} /></Region> : null}
      {tab === 'activity' ? <Region label="activity"><ActivityTab organizationId={id} /></Region> : null}
      {tab === 'usage' ? <Region label="feature usage"><FeatureUsageTab organizationId={id} /></Region> : null}
      {tab === 'danger' ? <Region label="lifecycle"><LifecycleTab detail={detail} organizationId={id} onChanged={refetch} /></Region> : null}
    </div>
  );
}
