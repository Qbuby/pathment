'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, Rocket } from 'lucide-react';
import Link from 'next/link';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type DirectoryRow } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { btn, OrgMark, Pager, RelativeTime, StatusPill, TableSkeleton, UsageMeter } from '@/components/platform/primitives';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDebounce } from '@/lib/hooks/useDebounce';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'past_due', label: 'Past due' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'created', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'members', label: 'Most members' },
  { value: 'activity', label: 'Recently updated' },
];

export default function WorkspacesDirectoryPage() {
  const router = useRouter();
  const canProvision = useGate('billing');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [planKey, setPlanKey] = useState('');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [sort, setSort] = useState<'created' | 'name' | 'members' | 'activity'>('created');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: status || undefined,
    planKey: planKey || undefined,
    hasOverrides: onlyOverrides || undefined,
    sort, page, limit: 25,
  }), [debouncedSearch, status, planKey, onlyOverrides, sort, page]);

  const { data, loading, error, refetch, fetching } = useApiQuery({
    queryKey: qk.platform.organizations(params),
    queryFn: () => platformApi.organizations.list(params),
    staleTime: STALE.short,
  });

  const { data: metrics } = useApiQuery({
    queryKey: qk.platform.metrics,
    queryFn: platformApi.metrics,
    staleTime: STALE.medium,
  });

  const planOptions = useMemo(() => ([
    { value: '', label: 'Any plan' },
    ...(metrics?.billing.planDistribution || []).map((plan) => ({ value: plan.key, label: plan.name })),
  ]), [metrics]);

  const setFilter = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="Every organization on the platform — plan, usage and health."
        actions={canProvision ? (
          <Link href="/platform/provision" className={btn.primary}>
            <Rocket className="h-4 w-4" aria-hidden /> Provision workspace
          </Link>
        ) : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:flex-none sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search name or slug…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </label>
        <SelectMenu value={status} onChange={setFilter(setStatus)} options={STATUS_OPTIONS} ariaLabel="Filter by status" className="w-36" />
        <SelectMenu value={planKey} onChange={setFilter(setPlanKey)} options={planOptions} ariaLabel="Filter by plan" className="w-36" />
        <SelectMenu value={sort} onChange={(value) => { setSort(value as typeof sort); setPage(1); }} options={SORT_OPTIONS} ariaLabel="Sort" className="w-44" />
        <button
          type="button"
          onClick={() => setFilter(setOnlyOverrides)(!onlyOverrides)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${onlyOverrides ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-border hover:bg-muted'}`}
          aria-pressed={onlyOverrides}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Custom arrangements
        </button>
        {fetching && !loading ? <Spinner size="sm" /> : null}
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card"><TableSkeleton rows={8} /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.organizations.length ? (
        <EmptyState title="No workspaces match" description="Try removing a filter, or provision the first workspace." />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Members</th>
                  <th className="hidden xl:table-cell">Programs · Clans</th>
                  <th className="hidden lg:table-cell">Owner</th>
                  <th className="hidden md:table-cell">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {data.organizations.map((org: DirectoryRow) => (
                  <tr
                    key={org.id}
                    onClick={() => router.push(`/platform/organizations/${org.id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <OrgMark name={org.name} logoUrl={org.logoUrl} color={org.primaryColor} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium">
                            {org.name}
                            {org.isDemo ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">demo</span> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">/{org.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td><StatusPill status={org.status} /></td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{org.plan?.name || '—'}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {org.requestedPlan ? <span className="text-amber-600 dark:text-amber-400">→ {org.requestedPlan.name} requested</span> : null}
                          {org.overriddenKeys.length ? <span className="text-violet-600 dark:text-violet-400" title={org.overriddenKeys.join(', ')}>⚑ custom</span> : null}
                        </span>
                      </div>
                    </td>
                    <td><UsageMeter used={org.usage.members} limit={org.limits.members} /></td>
                    <td className="hidden xl:table-cell tabular-nums text-muted-foreground">
                      {org.usage.programs} · {org.usage.clans}
                    </td>
                    <td className="hidden lg:table-cell">
                      {org.owner ? (
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{org.owner.firstName} {org.owner.lastName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{org.owner.email}</p>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden md:table-cell text-xs text-muted-foreground">
                      <RelativeTime date={org.lastActivityAt || org.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
