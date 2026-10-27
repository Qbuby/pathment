'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CircleSlash, Eye, Info, Users } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { getFlatNavItems } from '@/lib/config/navigation';
import { pageKey } from '@/lib/utils/page-key';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { ErrorState } from '@/components/shared/ErrorState';
import { CardSkeleton, RelativeTime } from '@/components/platform/primitives';
import { cn } from '@/components/ui/utils';

/**
 * Which screens this workspace's people actually open - the "what can we
 * delete" report, read by the operator across the tenant boundary.
 *
 * The list is every screen each role can reach (the client's navigation
 * registry), joined onto the server's counts; screens nobody opened fall out
 * of the join as zeroes, which is the point. Long tails are collapsed: the
 * first version of this page printed every row at full height and the result
 * was unreadable.
 */

const ROLES = [
  { key: 'admin' as const, label: 'Admins' },
  { key: 'mentor' as const, label: 'Mentors' },
  { key: 'mentee' as const, label: 'Mentees' },
];

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const TOP_ROWS = 8;

interface Row {
  path: string;
  label: string;
  group?: string;
  views: number;
  people: number;
  lastUsed: string | null;
}

function PeopleBar({ value, outOf }: { value: number; outOf: number }) {
  const pct = outOf > 0 ? Math.min(Math.round((value / outOf) * 100), 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-sm font-medium tabular-nums">{value}</span>
      <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800" title={outOf > 0 ? `${value} of ${outOf} active members` : undefined}>
        <div
          className={cn('h-full rounded-full', value > 0 ? 'bg-brand-500' : 'bg-transparent')}
          style={{ width: `${value > 0 ? Math.max(pct, 4) : 0}%` }}
        />
      </div>
    </div>
  );
}

function RoleCard({ label, rows, active, eligible }: { label: string; rows: Row[]; active: number; eligible: number }) {
  const [showAll, setShowAll] = useState(false);
  const [showUnused, setShowUnused] = useState(false);
  const used = rows.filter((row) => row.people > 0);
  const unused = rows.filter((row) => row.people === 0);
  const visible = showAll ? used : used.slice(0, TOP_ROWS);

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{active}</span> of <span className="tabular-nums">{eligible}</span> opened anything
          {' · '}<span className="tabular-nums">{used.length}</span> of {rows.length} screens used
        </p>
      </header>

      {used.length ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Screen</th>
                <th><span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden /> People</span></th>
                <th className="hidden sm:table-cell"><span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" aria-hidden /> Opens</span></th>
                <th className="hidden md:table-cell">Last opened</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.path}>
                  <td>
                    <p className="text-sm font-medium">
                      {row.label}
                      {row.group ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.group}</span> : null}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{row.path}</p>
                  </td>
                  <td><PeopleBar value={row.people} outOf={eligible} /></td>
                  <td className="hidden sm:table-cell tabular-nums text-muted-foreground">{row.views}</td>
                  <td className="hidden md:table-cell text-xs text-muted-foreground"><RelativeTime date={row.lastUsed} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-muted-foreground">Nobody opened anything in this window.</p>
      )}

      {used.length > TOP_ROWS ? (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full border-t border-border px-6 py-2.5 text-xs font-medium text-brand-600 hover:bg-muted">
          {showAll ? 'Show top screens only' : `Show all ${used.length} used screens`}
        </button>
      ) : null}

      {unused.length ? (
        <div className="border-t border-border px-6 py-3.5">
          <button
            type="button"
            onClick={() => setShowUnused((value) => !value)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showUnused}
          >
            <CircleSlash className="h-3.5 w-3.5" aria-hidden />
            Never opened: {unused.length} screen{unused.length === 1 ? '' : 's'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showUnused && 'rotate-180')} aria-hidden />
          </button>
          {showUnused ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {unused.map((row) => (
                <li key={row.path} title={row.path} className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                  {row.label}
                  {row.group ? <span className="ml-1 opacity-70">· {row.group}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DailyViews({ daily }: { daily: { day: string; views: number; people: number }[] }) {
  if (daily.length < 2) return null;
  const max = Math.max(1, ...daily.map((d) => d.views));
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Page views per day</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {daily.reduce((sum, d) => sum + d.views, 0).toLocaleString()} views in the window
        </p>
      </div>
      <div className="mt-4 flex h-20 items-end gap-[2px]" aria-hidden>
        {daily.map((d) => (
          <div
            key={d.day}
            className="min-w-[3px] flex-1 rounded-t bg-brand-500/80 hover:bg-brand-600"
            style={{ height: `${Math.max((d.views / max) * 100, d.views > 0 ? 4 : 1)}%` }}
            title={`${d.day}: ${d.views} views · ${d.people} people`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{daily[0].day}</span>
        <span>{daily[daily.length - 1].day}</span>
      </div>
    </div>
  );
}

export function FeatureUsageTab({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState('30');
  const [showOffMenu, setShowOffMenu] = useState(false);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.featureUsage(organizationId, Number(days)),
    queryFn: () => platformApi.organizations.featureUsage(organizationId, Number(days)),
    staleTime: STALE.short,
  });

  const { sections, offMenu } = useMemo(() => {
    const counts = new Map((data?.pages ?? []).map((page) => [page.page, page]));
    const claimed = new Set<string>();

    const sections = ROLES.map(({ key, label }) => {
      const rows: Row[] = getFlatNavItems(key).map((item) => {
        const path = pageKey(item.path);
        claimed.add(path);
        const hit = counts.get(path);
        return { path, label: item.label, group: item.group, views: hit?.views ?? 0, people: hit?.people ?? 0, lastUsed: hit?.lastUsed ?? null };
      });
      rows.sort((a, b) => b.people - a.people || b.views - a.views || a.label.localeCompare(b.label));
      return { key, label, rows, active: data?.activeByRole?.[key] ?? 0, eligible: data?.eligibleByRole?.[key] ?? 0 };
    });

    const offMenu = (data?.pages ?? [])
      .filter((page) => !claimed.has(page.page))
      .sort((a, b) => b.people - a.people || b.views - a.views);

    return { sections, offMenu };
  }, [data]);

  if (loading) {
    return <div className="space-y-5"><CardSkeleton lines={3} /><CardSkeleton lines={6} /><CardSkeleton lines={6} /></div>;
  }
  if (error) return <ErrorState message={error || undefined} onRetry={refetch} variant="page" />;

  const since = data?.trackingSince ? new Date(data.trackingSince) : null;
  const partial = Boolean(data && since && !data.coversFullWindow);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Which screens this workspace&apos;s people actually open — and which nobody has. Counts fold per page shape, so a hundred step pages read as one screen.
        </p>
        <div className="w-40 shrink-0">
          <SelectMenu value={days} onChange={setDays} options={WINDOWS} ariaLabel="Time window" />
        </div>
      </div>

      {since ? (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Recorded since {since.toLocaleDateString()}
            {partial ? ' — less than this window, so a screen can read as unused simply because nobody opened it in the days we have' : ''}.
            Screens reached by direct link still count.
          </span>
        </p>
      ) : null}

      {!data?.pages?.length ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">Nothing recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Page views start the next time somebody in this workspace signs in and moves around.</p>
        </div>
      ) : (
        <>
          <DailyViews daily={data?.daily ?? []} />

          {sections.map((section) => (
            <RoleCard key={section.key} label={section.label} rows={section.rows} active={section.active} eligible={section.eligible} />
          ))}

          {offMenu.length ? (
            <section className="overflow-hidden rounded-3xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setShowOffMenu((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left hover:bg-muted/50"
                aria-expanded={showOffMenu}
              >
                <span>
                  <span className="block text-sm font-semibold">Opened outside the menus ({offMenu.length})</span>
                  <span className="block text-xs text-muted-foreground">Direct links, the mobile app, or screens not registered in navigation.</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', showOffMenu && 'rotate-180')} aria-hidden />
              </button>
              {showOffMenu ? (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
                  {offMenu.map((page) => (
                    <li key={page.page} className="flex items-center justify-between gap-4 px-6 py-2">
                      <span className="truncate font-mono text-xs text-muted-foreground">{page.page}</span>
                      <span className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{page.people}</span>
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" aria-hidden />{page.views}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
