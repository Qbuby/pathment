'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { OrganizationCharts } from '@/components/admin/OrganizationCharts';
import { PageHeader } from '@/components/admin/ui';
import { ReviewRecordsPanel } from '@/components/admin/review-records/ReviewRecordsPanel';
import { useOrgInsights } from '@/lib/hooks/admin';


/**
 * Insights → Overview.
 *
 * "Compare clans" lived here as a second view: a table of clans ranked by
 * concern, with its own search and pager. Review records lived a tab away as
 * a whole page of its own. Both answer "how are the clans doing", from two
 * directions, and keeping them apart meant the org's review history was
 * never on screen next to the org's health.
 *
 * So the comparison table goes — the follow-up queue already ranks the people
 * inside those clans, and review records cover the clan-by-clan read in far
 * more detail — and review records take its place as the second tab here.
 */
function AdminInsightsContent() {
  const params = useSearchParams();
  const [view, setView] = useState<'overview' | 'records'>(
    params.get('tab') === 'records' ? 'records' : 'overview',
  );
  const { insights, loading, error, refetch } = useOrgInsights();

  if (loading) return <div role="status" className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading insights…</div>;
  if (error || !insights) return <div className="rounded-xl border bg-card p-8 text-center"><p>{error || 'No insights available.'}</p><button onClick={refetch} className="mt-3 text-sm text-brand-700">Try again</button></div>;

  const { kpis, fairness } = insights;

  return (
    <div className="space-y-5">
      <PageHeader title="Insights" subtitle={`${kpis.activeMentees.toLocaleString()} active mentees · ${kpis.clans.toLocaleString()} clans · current snapshot`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-card p-1" aria-label="Insight views">
          {([['overview', 'At a glance'], ['records', 'Review records']] as const).map(([item, label]) => (
            <button key={item} aria-pressed={view === item} onClick={() => setView(item)} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === item ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
          ))}
        </div>
        <Link href="/admin/follow-ups" className="text-sm font-medium text-brand-700 hover:underline">Open follow-up queue →</Link>
      </div>

      {view === 'overview' ? <>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold text-foreground">{kpis.clansRed ? `${kpis.clansRed.toLocaleString()} ${kpis.clansRed === 1 ? 'clan needs' : 'clans need'} priority attention` : 'No clans in the highest concern group'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{kpis.avgCompletion}% average completion · {kpis.totalOpenBlockers.toLocaleString()} open roadblocks</p>
          </div>
          {/* Went to the clan table; the follow-up queue is where the work is. */}
          <Link href={kpis.clansRed ? '/admin/follow-ups?risk=high' : '/admin/follow-ups'} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Review clans →</Link>
        </section>
        <OrganizationCharts summary={insights.summary} />
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">How adjustments affect progress</summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Recorded progress averages {fairness.avgAbsolute}%; adjusted progress averages {fairness.avgRelative}%. There are {kpis.totalExtensions.toLocaleString()} approved extensions. Adjustments provide context, not a ranking of individual mentees.</p>
        </details>
      </> : <ReviewRecordsPanel />}
    </div>
  );
}

export default function AdminInsights() {
  // useSearchParams needs a boundary; the page is client-rendered either way.
  return (
    <Suspense fallback={<div role="status" className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>}>
      <AdminInsightsContent />
    </Suspense>
  );
}
