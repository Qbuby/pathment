'use client';

import { useMemo, useState } from 'react';
import { Activity, Eye, Users, CircleSlash, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { qk, useApiQuery } from '@/lib/query';
import { activityApi } from '@/lib/services/activity-api';
import type { FeatureUsageResponse } from '@/lib/types/activity';
import { getFlatNavItems } from '@/lib/config/navigation';
import { pageKey } from '@/lib/utils/page-key';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorView } from '@/components/shared/ErrorView';

/**
 * Which screens anybody actually opens.
 *
 * The question behind this page is not "how busy is the product" — that is the
 * Activity tab — but "what can we delete". So the list is not the pages with
 * traffic; it is every page the role can reach, with its traffic beside it,
 * and the ones at zero sorted to where they cannot be missed. A report built
 * only from rows that exist can never show you an empty room.
 *
 * The denominator matters as much as the count. Three people on an admin
 * screen when there are three admins is everybody; three on a mentee screen
 * when there are six hundred mentees is nobody. Both say "3".
 */

const ROLES = [
  { key: 'admin' as const, label: 'Admin' },
  { key: 'mentor' as const, label: 'Mentor' },
  { key: 'mentee' as const, label: 'Mentee' },
];

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

interface Row {
  path: string;
  label: string;
  group?: string;
  views: number;
  people: number;
  lastUsed: string | null;
}

/**
 * The bar is people over the whole role, not people over the busiest screen.
 *
 * Scaling to the busiest screen was the first version and it said nothing: on
 * a quiet week every row has the same one or two people, so every bar was
 * full and the chart agreed with itself. Against the role's population, one
 * mentee out of twenty-seven is the sliver it actually is, and that is the
 * comparison this page exists to make.
 */
function Bar({ value, outOf }: { value: number; outOf: number }) {
  const pct = outOf > 0 ? Math.min(Math.round((value / outOf) * 100), 100) : 0;
  return (
    <div
      className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800"
      title={outOf > 0 ? `${value} of ${outOf}` : undefined}
    >
      <div
        // A screen used by one person in a thousand still has to be visible,
        // or the bar reads as zero and contradicts the number beside it.
        className={`h-full rounded-full ${value > 0 ? 'bg-brand-500' : 'bg-transparent'}`}
        style={{ width: `${value > 0 ? Math.max(pct, 2) : 0}%` }}
      />
    </div>
  );
}

function RoleSection({
  label, rows, active, eligible,
}: {
  label: string;
  rows: Row[];
  active: number;
  eligible: number;
}) {
  const used = rows.filter((r) => r.people > 0);
  const unused = rows.filter((r) => r.people === 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-card dark:border-slate-800">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{label}</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{active}</span>
          {' of '}
          <span className="tabular-nums">{eligible}</span>
          {` ${label.toLowerCase()}${eligible === 1 ? '' : 's'} opened anything · `}
          <span className="tabular-nums">{used.length}</span>
          {` of ${rows.length} screens used`}
        </p>
      </header>

      {used.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {used.map((r) => (
            <li key={r.path} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {r.label}
                  {r.group && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.group}</span>}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-400">{r.path}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300" title={`${r.people} different people`}>
                  <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />{r.people}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={`${r.views} opens`}>
                  <Eye className="h-3.5 w-3.5 text-slate-400" aria-hidden />{r.views}
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {r.lastUsed ? formatDistanceToNow(new Date(r.lastUsed), { addSuffix: true }) : '—'}
                </span>
              </div>
              <div className="col-span-2"><Bar value={r.people} outOf={eligible} /></div>
            </li>
          ))}
        </ul>
      )}

      {/* The reason the page exists: rooms with nobody in them. */}
      {unused.length > 0 && (
        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <CircleSlash className="h-3.5 w-3.5" aria-hidden />
            Not opened once ({unused.length})
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {unused.map((r) => (
              <li
                key={r.path}
                title={r.path}
                className="rounded-lg border border-dashed border-slate-200 px-2 py-1 text-xs text-slate-500 dark:border-slate-700"
              >
                {r.label}
                {r.group && <span className="ml-1 text-slate-400">· {r.group}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 && (
        <p className="px-5 py-6 text-sm text-muted-foreground">No screens configured for this role.</p>
      )}
    </section>
  );
}

export default function AdminFeatureUsagePage() {
  const [days, setDays] = useState('30');

  const { data, loading, error, refetch } = useApiQuery<FeatureUsageResponse>({
    queryKey: qk.admin.featureUsage(Number(days)),
    // apiClient.get resolves to the envelope, not the axios response; every
    // other admin hook unwraps `.data` the same way.
    queryFn: async () => (
      await activityApi.getFeatureUsage(Number(days)) as unknown as { data: FeatureUsageResponse }
    ).data,
    errorMessage: 'Could not load feature usage',
  });

  // Counts arrive keyed by page shape; the menu is the list of pages that
  // exist. Joining here rather than on the server keeps one registry of what
  // the product has, and it is already in the client.
  const { sections, offMenu } = useMemo(() => {
    const counts = new Map((data?.pages ?? []).map((p) => [p.page, p]));
    const claimed = new Set<string>();

    const sections = ROLES.map(({ key, label }) => {
      const rows: Row[] = getFlatNavItems(key).map((item) => {
        const path = pageKey(item.path);
        claimed.add(path);
        const hit = counts.get(path);
        return {
          path,
          label: item.label,
          group: item.group,
          views: hit?.views ?? 0,
          people: hit?.people ?? 0,
          lastUsed: hit?.lastUsed ?? null,
        };
      });
      // Most-used first; within the unused tail, alphabetical, so the list is
      // stable between refreshes instead of reshuffling on every tie.
      rows.sort((a, b) => b.people - a.people || b.views - a.views || a.label.localeCompare(b.label));
      return {
        key, label, rows,
        active: data?.activeByRole?.[key] ?? 0,
        eligible: data?.eligibleByRole?.[key] ?? 0,
      };
    });

    // Anything recorded that the menu does not list — a settings page reached
    // from an avatar, a mobile route, a screen somebody forgot to register.
    // Dropping these silently would make the report look complete when it is
    // not, and "what is this path?" is usually the interesting question.
    const offMenu = (data?.pages ?? [])
      .filter((p) => !claimed.has(p.page))
      .sort((a, b) => b.people - a.people || b.views - a.views);

    return { sections, offMenu };
  }, [data]);

  const since = data?.trackingSince ? new Date(data.trackingSince) : null;
  // Decided on the server, against one clock — see featureUsageService.overview.
  const partial = !!data && !!since && !data.coversFullWindow;

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-semibold text-slate-900 dark:text-slate-100">Feature usage</h1>
          <p className="text-sm text-slate-500">
            Which screens each role actually opens — and which nobody has.
          </p>
        </div>
        <div className="w-44">
          <SelectMenu value={days} onChange={setDays} options={WINDOWS} ariaLabel="Time window" />
        </div>
      </div>

      {/* Never let the page imply more history than there is. */}
      {since && (
        <p className="inline-flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span>
            Page views have been recorded since {since.toLocaleDateString()}
            {partial && ', which is less than this window — a screen can read as unused simply because nobody opened it in the days we have'}
            . A screen reached by a direct link rather than the menu still counts.
          </span>
        </p>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error ? (
        <ErrorView error={new Error(error)} reset={() => void refetch()} />
      ) : (
        <>
          {sections.map((s) => (
            <RoleSection key={s.key} label={s.label} rows={s.rows} active={s.active} eligible={s.eligible} />
          ))}

          {offMenu.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-card dark:border-slate-800">
              <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">Opened but not in any menu</h2>
                <p className="text-sm text-muted-foreground">
                  Reached by link, by the mobile app, or from a screen that is not registered in navigation.
                </p>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {offMenu.map((p) => (
                  <li key={p.page} className="flex items-center justify-between gap-4 px-5 py-2.5">
                    <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-400">{p.page}</span>
                    <span className="flex shrink-0 items-center gap-4 text-sm tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />{p.people}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Eye className="h-3.5 w-3.5 text-slate-400" aria-hidden />{p.views}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!data?.pages?.length && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center dark:border-slate-800">
              <Activity className="mx-auto mb-3 h-6 w-6 text-slate-300" aria-hidden />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing recorded yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Page views start the next time somebody signs in and moves around.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
