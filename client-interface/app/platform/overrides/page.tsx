'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Infinity as InfinityIcon, SlidersHorizontal } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type OverrideReportRow } from '@/lib/services/platform-api';
import { PageHeader } from '@/components/platform/PlatformShell';
import { OrgMark, RelativeTime, StatusPill, TableSkeleton } from '@/components/platform/primitives';
import { entitlementLabel, isEnforcedLimit, isShippedFeature, NOT_ENFORCED_HINT } from '@/lib/config/platform-entitlements';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/components/ui/utils';

/**
 * Every workspace carried by a custom arrangement - so nothing negotiated by
 * hand ever gets lost or silently contradicted by a plan change. Redundant
 * overrides (equal to what the plan now publishes) are pruned at write time,
 * so each row here is a real difference.
 */

function LimitValue({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (value < 0) return <InfinityIcon className="inline h-4 w-4 align-[-2px]" aria-label="Unlimited" />;
  return <>{value.toLocaleString()}</>;
}

function FeatureValue({ value }: { value: boolean | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
      value
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400',
    )}>
      {value ? 'On' : 'Off'}
    </span>
  );
}

function OverrideLine({ label, unenforced, plan, value }: {
  label: string; unenforced: boolean; plan: React.ReactNode; value: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2', unenforced && 'opacity-60')}>
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate">{label}</span>
        {unenforced ? (
          <span title={NOT_ENFORCED_HINT} className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            not enforced
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums">
        <span className="text-sm text-muted-foreground" title="What the plan publishes">{plan}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
        <span className="text-sm font-semibold" title="The custom arrangement">{value}</span>
      </span>
    </div>
  );
}

function WorkspaceCard({ row }: { row: OverrideReportRow }) {
  const total = row.limits.length + row.features.length;
  return (
    <Link
      href={`/platform/organizations/${row.organization.id}`}
      className="group block overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-brand-500/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <OrgMark name={row.organization.name} color="#0f766e" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="truncate">{row.organization.name}</span>
              <StatusPill status={row.organization.status} />
            </p>
            <p className="font-mono text-xs text-muted-foreground">/{row.organization.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            {row.plan?.name || 'No plan'}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total} override{total === 1 ? '' : 's'}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>

      <div className="grid gap-x-10 px-6 py-3 sm:grid-cols-2">
        {row.limits.length ? (
          <div className="divide-y divide-border/60">
            <p className="pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Limits</p>
            {row.limits.map((limit) => (
              <OverrideLine
                key={limit.key}
                label={entitlementLabel(limit.key)}
                unenforced={!isEnforcedLimit(limit.key)}
                plan={<LimitValue value={limit.planValue} />}
                value={<LimitValue value={limit.value} />}
              />
            ))}
          </div>
        ) : null}
        {row.features.length ? (
          <div className="divide-y divide-border/60">
            <p className="pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Features</p>
            {row.features.map((feature) => (
              <OverrideLine
                key={feature.key}
                label={entitlementLabel(feature.key)}
                unenforced={!isShippedFeature(feature.key)}
                plan={<FeatureValue value={feature.planValue} />}
                value={<FeatureValue value={feature.value} />}
              />
            ))}
          </div>
        ) : null}
      </div>

      {row.meta?.reason ? (
        <p className="border-t border-border bg-muted/30 px-6 py-2.5 text-xs text-muted-foreground">
          “{row.meta.reason}”
          {row.meta.updatedBy ? <> — {row.meta.updatedBy}</> : null}
          {row.meta.updatedAt ? <>, <RelativeTime date={row.meta.updatedAt} /></> : null}
        </p>
      ) : null}
    </Link>
  );
}

export default function OverridesReportPage() {
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.overridesReport,
    queryFn: platformApi.billing.overridesReport,
    staleTime: STALE.short,
  });

  return (
    <div>
      <PageHeader
        title="Custom arrangements"
        description="Workspaces whose limits or features differ from what their plan publishes. Plan value on the left, the negotiated value on the right."
      />
      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card"><TableSkeleton rows={5} /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.length ? (
        <EmptyState
          icon={<SlidersHorizontal className="h-8 w-8" aria-hidden />}
          title="No custom arrangements"
          description="Every workspace currently runs exactly what its plan publishes."
        />
      ) : (
        <div className="space-y-4">
          {data.map((row) => <WorkspaceCard key={row.organization.id} row={row} />)}
        </div>
      )}
    </div>
  );
}
