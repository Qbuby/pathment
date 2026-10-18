'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Database, HardDrive, Loader2, Layers, Trash2, Info } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type StorageOverview } from '@/lib/services/platform-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { btn, CardSkeleton, TileSkeleton } from '@/components/platform/primitives';
import { ErrorState } from '@/components/shared/ErrorState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

/**
 * Where the database size is.
 *
 * The question this answers — "it says 700 MB, what can we delete?" — had no
 * way to be answered: nothing reported which tables were large, so the only
 * available move was to guess, and the guess is always "it must be rows".
 * Usually it is not. Two things this says out loud, because both are
 * counter-intuitive and both change what you would do about it:
 *
 * Indexes are not free and deleting rows does not shrink them much. On a
 * schema this wide they outweigh the data several times over.
 *
 * Deleted rows do not give space back to the disk. Postgres returns the pages
 * to the table for reuse; the number on the hosting dashboard only moves after
 * a VACUUM FULL or pg_repack, which take an exclusive lock and are an
 * operator's decision rather than a button on this page.
 *
 * So the page reports, and the only destructive thing it offers is running the
 * standing retention policies a day early.
 */

function bytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** What each policy removes, in the words of somebody deciding whether to run it. */
const POLICY_COPY: Record<string, { label: string; detail: string }> = {
  expiredTokens: {
    label: 'Expired sign-in tokens',
    detail: 'Refresh tokens that expired over a week ago. Nobody can sign in with one.',
  },
  sentEmailBodies: {
    label: 'Bodies of sent email',
    detail: 'The text of mail delivered over 30 days ago. The record that it was sent stays.',
  },
  routineAudit: {
    label: 'Routine audit noise',
    detail: 'Successful heartbeats and session pings older than 90 days — not real actions.',
  },
  readNotifications: {
    label: 'Read notifications',
    detail: 'Read and over 90 days old. Unread ones are kept however old. The thing each one announced is untouched.',
  },
  oldPageViews: {
    label: 'Page views over a year old',
    detail: 'Older than any window the feature-usage report can show.',
  },
  deliveredEmails: {
    label: 'Delivered mail records',
    detail: 'Sent over 180 days ago. Failed and dead-lettered mail is kept — that is the evidence for a missing email.',
  },
};

function Stat({ icon: Icon, label, value, hint }: {
  icon: typeof Database; label: string; value: string; hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />{label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function PlatformStoragePage() {
  const confirm = useConfirm();
  const canSweep = useGate('owner');
  const [sweeping, setSweeping] = useState(false);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.storage,
    queryFn: platformApi.storage.overview,
    staleTime: STALE.short,
  });

  const prunable = data?.prunable ?? {};
  const totalPrunable = Object.values(prunable).reduce((a, b) => a + b, 0);

  const runSweep = async () => {
    const ok = await confirm({
      title: 'Run the retention sweep now?',
      description:
        `This removes ${totalPrunable.toLocaleString()} row${totalPrunable === 1 ? '' : 's'} the standing policies `
        + 'already remove on a daily timer — nothing else. It will not shrink the figure your host reports, '
        + 'because Postgres keeps the freed pages for reuse until a VACUUM FULL.',
      confirmLabel: 'Run sweep',
    });
    if (!ok) return;
    try {
      setSweeping(true);
      const res = await platformApi.storage.sweep();
      const removed = Object.values(res.removed ?? {}).reduce((a, b) => a + b, 0);
      toast.success(removed ? `Removed ${removed.toLocaleString()} rows` : 'Nothing was due for removal');
      void refetch();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'The sweep did not finish'));
    } finally {
      setSweeping(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <TileSkeleton />
        <CardSkeleton lines={6} />
        <CardSkeleton lines={8} />
      </div>
    );
  }
  if (error) return <ErrorState message={error || undefined} onRetry={refetch} variant="page" />;
  if (!data) return null;

  const indexShare = data.tableBytes > 0 ? Math.round((data.indexBytes / data.tableBytes) * 100) : 0;
  const biggest = data.tables[0]?.totalBytes ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storage"
        description="What the WHOLE database's size is made of, and what can safely go. Every workspace's data lives here together."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={HardDrive} label="Database" value={bytes(data.totalBytes)} hint="as the server reports it" />
        <Stat
          icon={Layers}
          label="Indexes"
          value={bytes(data.indexBytes)}
          hint={`${indexShare}% of table space, across ${data.tableCount} tables`}
        />
        <Stat
          icon={Database}
          label="Rows"
          value={data.liveRows.toLocaleString()}
          hint={data.deadRows > 0 ? `${data.deadRows.toLocaleString()} dead, awaiting vacuum` : 'nothing awaiting vacuum'}
        />
        <Stat
          icon={Trash2}
          label="Removable now"
          value={totalPrunable.toLocaleString()}
          hint="rows the standing policies cover"
        />
      </div>

      {/* The two things that make people delete the wrong thing. */}
      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span>
          Indexes are {indexShare}% of the table space here, and they do not shrink when rows go. Deleting rows also
          returns pages to the table rather than to the disk, so the figure your host shows will not drop until
          somebody runs a <span className="font-mono">VACUUM FULL</span> or <span className="font-mono">pg_repack</span>,
          which lock the table and are an operator&rsquo;s call. If the number is bigger than this page can explain,
          it is almost certainly bloat rather than rows worth deleting.
        </span>
      </p>

      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Safe to remove</h2>
            <p className="text-sm text-muted-foreground">
              These run daily by themselves. The button only brings the next pass forward.
            </p>
          </div>
          <button
            onClick={runSweep}
            disabled={!canSweep || sweeping || totalPrunable === 0}
            title={canSweep ? undefined : 'Running the sweep requires the platform owner role'}
            className={cn(btn.primary)}
          >
            {sweeping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {totalPrunable === 0 ? 'Nothing due' : `Run sweep (${totalPrunable.toLocaleString()})`}
          </button>
        </header>
        <ul className="divide-y divide-border">
          {Object.entries(prunable).map(([key, count]) => {
            const copy = POLICY_COPY[key] ?? { label: key, detail: '' };
            return (
              <li key={key} className="flex items-start justify-between gap-4 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{copy.label}</p>
                  {copy.detail && <p className="mt-0.5 text-xs text-muted-foreground">{copy.detail}</p>}
                </div>
                <span className={`shrink-0 text-sm tabular-nums ${count > 0 ? 'font-medium text-foreground' : 'text-slate-400'}`}>
                  {count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Largest tables</h2>
          <p className="text-sm text-muted-foreground">
            Data and its indexes together. Nothing here is deletable from this screen — it is here so the size has an
            explanation.
          </p>
        </header>
        <ul className="divide-y divide-border">
          {data.tables.map((t) => (
            <li key={t.table} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-6 py-3">
              <p className="truncate font-mono text-sm text-slate-800 dark:text-slate-200">{t.table}</p>
              <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {bytes(t.totalBytes)}
              </p>
              <p className="col-span-2 text-xs text-muted-foreground">
                {t.liveRows.toLocaleString()} rows · {bytes(t.heapBytes)} data · {bytes(t.indexBytes)} indexes
                {t.deadRows > 0 && ` · ${t.deadRows.toLocaleString()} dead`}
              </p>
              <div className="col-span-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                {/* Data and indexes side by side, because which one is big is
                    the whole question and a single bar hides it. */}
                <div className="bg-brand-500" style={{ width: `${(t.heapBytes / biggest) * 100}%` }} title={`${bytes(t.heapBytes)} data`} />
                <div className="bg-brand-200 dark:bg-brand-500/40" style={{ width: `${(t.indexBytes / biggest) * 100}%` }} title={`${bytes(t.indexBytes)} indexes`} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
