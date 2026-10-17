'use client';

import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { PageHeader } from '@/components/platform/PlatformShell';
import { StatusPill, TableSkeleton } from '@/components/platform/primitives';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Every workspace carried by a custom arrangement - so nothing negotiated by
 * hand ever gets lost or silently contradicted by a plan change. Redundant
 * overrides (equal to what the plan now publishes) are pruned at write time,
 * so each row here is a real difference.
 */
export default function OverridesReportPage() {
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.overridesReport,
    queryFn: platformApi.billing.overridesReport,
    staleTime: STALE.short,
  });

  const fmt = (value: number | boolean | null) =>
    value == null ? '—' : typeof value === 'boolean' ? (value ? 'on' : 'off') : value < 0 ? '∞' : value.toLocaleString();

  return (
    <div>
      <PageHeader title="Custom arrangements" description="Workspaces whose enforced limits or features differ from their plan." />
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
        <div className="space-y-3">
          {data.map((row) => (
            <Link
              key={row.organization.id}
              href={`/platform/organizations/${row.organization.id}`}
              className="block rounded-3xl border border-border bg-card p-4 transition-colors hover:border-brand-500/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="font-medium">{row.organization.name}</p>
                  <span className="font-mono text-xs text-muted-foreground">/{row.organization.slug}</span>
                  <StatusPill status={row.organization.status} />
                </div>
                <span className="text-xs text-muted-foreground">on {row.plan?.name || 'no plan'}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.limits.map((limit) => (
                  <span key={limit.key} className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300">
                    {limit.key}: {fmt(limit.planValue)} → <strong>{fmt(limit.value)}</strong>
                  </span>
                ))}
                {row.features.map((feature) => (
                  <span key={feature.key} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {feature.key}: {fmt(feature.planValue)} → <strong>{fmt(feature.value)}</strong>
                  </span>
                ))}
              </div>
              {row.meta?.reason ? (
                <p className="mt-2.5 text-xs text-muted-foreground">“{row.meta.reason}” — {row.meta.updatedBy}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
