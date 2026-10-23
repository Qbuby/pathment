'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Printer, Send, FileText, CalendarRange, CheckCircle2,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { menteeReportsApi, type MenteeReport } from '@/lib/services/mentee-reports-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Avatar } from '@/components/shared/Avatar';
import { SendReportsDrawer } from './SendReportsDrawer';

/**
 * Mentee progress reports for a period, for whoever is allowed to see them.
 *
 * One component for both sides of the product. A mentor opens it already
 * scoped to the clan they are in; an admin picks a programme and a clan first
 * and passes the result down. The server decides who may actually be reported
 * on either way, so the only difference here is which scope arrives in props.
 *
 * Defaults to the current month because that is the report somebody wants nine
 * times out of ten, and making them choose two dates before seeing anything is
 * a tax on the common case.
 */

const firstOfThisMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const MOMENTUM = {
  up: { Icon: TrendingUp, cls: 'text-emerald-600 dark:text-emerald-400', label: 'Picking up' },
  down: { Icon: TrendingDown, cls: 'text-rose-600 dark:text-rose-400', label: 'Slowing down' },
  flat: { Icon: Minus, cls: 'text-slate-500', label: 'Steady' },
} as const;

const RISK = {
  high: { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300', label: 'Needs attention' },
  watch: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300', label: 'Worth watching' },
  low: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', label: 'On track' },
} as const;

const readableDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One mentee, laid out to be read top to bottom and to print cleanly. */
function ReportCard({ report, selected, onToggle }: {
  report: MenteeReport;
  selected: boolean;
  onToggle: () => void;
}) {
  const momentum = MOMENTUM[report.progress.momentum as keyof typeof MOMENTUM] ?? MOMENTUM.flat;
  const risk = RISK[report.progress.risk as keyof typeof RISK] ?? RISK.low;
  const place = report.standing.inClan;

  return (
    <article className="break-inside-avoid rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <label className="no-print flex items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              aria-label={`Include ${report.mentee.name}`}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
          </label>
          <Avatar name={report.mentee.name} src={report.mentee.avatarUrl} size="md" />
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">{report.mentee.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {report.context.program?.name || 'No programme'}
              {report.context.clan ? ` · ${report.context.clan.name}` : ''}
              {report.context.week ? ` · week ${report.context.week}${report.context.totalWeeks ? ` of ${report.context.totalWeeks}` : ''}` : ''}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${risk.cls}`}>{risk.label}</span>
      </header>

      {/* The four numbers somebody judges a month by. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Overall progress', value: `${report.progress.absolute}%`, hint: 'of their roadmap' },
          { label: 'Finished', value: String(report.activity.completed), hint: 'this period' },
          { label: 'On time', value: `${report.progress.onTimeRate}%`, hint: 'of deadlines met' },
          {
            label: 'In their clan',
            value: place?.rank ? `${place.rank}` : '—',
            hint: place?.rank ? `of ${place.of}` : place?.notRankedBecause || 'not ranked',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{stat.value}</p>
            <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finished this period</p>
          {report.activity.completedTasks.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">Nothing was completed in this window.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {report.activity.completedTasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{task.title}</span>
                    {task.late && <span className="ml-1 text-[11px] text-amber-600">late</span>}
                  </span>
                  {task.rating != null && (
                    <span className="shrink-0 text-xs text-muted-foreground">{task.rating}/5</span>
                  )}
                </li>
              ))}
              {report.activity.completedTasks.length > 8 && (
                <li className="text-xs text-muted-foreground">
                  and {report.activity.completedTasks.length - 8} more
                </li>
              )}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Still open</p>
          {report.activity.openTasks.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">Nothing overdue at the end of this period.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {report.activity.openTasks.slice(0, 6).map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                  <span className="min-w-0 flex-1 text-foreground">{task.title}</span>
                  {task.dueDate && (
                    <span className="shrink-0 text-xs text-muted-foreground">{readableDate(task.dueDate)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {report.roadmaps.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roadmap</p>
          <div className="mt-1.5 space-y-2">
            {report.roadmaps.map((roadmap) => (
              <div key={roadmap.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{roadmap.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {roadmap.completed} of {roadmap.steps} steps
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${roadmap.percentOfRoadmap}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${momentum.cls}`}>
          <momentum.Icon className="h-3.5 w-3.5" aria-hidden /> {momentum.label}
        </span>
        <span>Last active {report.progress.lastActive}</span>
        {report.progress.openBlockers > 0 && <span>{report.progress.openBlockers} open roadblock(s)</span>}
        {report.progress.extensions > 0 && <span>{report.progress.extensions} extension(s) granted</span>}
        {report.progress.riskReason && <span className="w-full">{report.progress.riskReason}</span>}
      </footer>
    </article>
  );
}

export function MenteeReportPanel({
  clanId = null,
  programId = null,
  title = 'Mentee reports',
  description = 'Pick a period and share how each person is doing. Defaults to this month.',
}: {
  clanId?: string | null;
  programId?: string | null;
  title?: string;
  description?: string;
}) {
  const [from, setFrom] = useState(firstOfThisMonth);
  const [to, setTo] = useState(today);
  const [reports, setReports] = useState<MenteeReport[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState(0);

  const scope = useMemo(
    () => ({ clanId: clanId || undefined, programId: programId || undefined, from, to }),
    [clanId, programId, from, to],
  );

  const load = useCallback(async () => {
    if (!clanId && !programId) return;
    setLoading(true);
    try {
      const data = await menteeReportsApi.batch(scope);
      setReports(data.reports);
      setRefused(data.refused || 0);
      // Everybody is included by default: the common case is "send the lot",
      // and unticking a few is less work than ticking twenty.
      setSelected(new Set(data.reports.map((r) => r.mentee.id)));
      setLoaded(true);
      if (data.capped) toast.message('Showing the first 200 mentees. Narrow the clan to see the rest.');
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not build those reports'));
    } finally {
      setLoading(false);
    }
  }, [scope, clanId, programId]);

  // Re-running on every keystroke of a date field would be a request per digit.
  useEffect(() => { setLoaded(false); }, [clanId, programId, from, to]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const chosen = reports.filter((r) => selected.has(r.mentee.id));

  /**
   * Print just this panel, wherever it is mounted.
   *
   * The mentor page already isolates its own cohort report for printing, so a
   * bare window.print() here comes out blank. Rather than teach every host
   * page about this section, the panel carries its own print scope and turns
   * it on only for the duration of the dialog - which also means the brand new
   * admin page needs no print CSS of its own.
   */
  const print = () => {
    const body = document.body;
    body.classList.add('print-mentee-reports');
    const clear = () => {
      body.classList.remove('print-mentee-reports');
      window.removeEventListener('afterprint', clear);
    };
    window.addEventListener('afterprint', clear);
    window.print();
    // Safari does not always fire afterprint; the timeout is the backstop.
    setTimeout(clear, 1000);
  };

  const send = async (recipients: string[], note: string) => {
    setSending(true);
    try {
      const result = await menteeReportsApi.send({
        ...scope,
        menteeIds: chosen.map((r) => r.mentee.id),
        recipients,
        note,
      });
      toast.success(
        `Sent ${result.mentees} report${result.mentees === 1 ? '' : 's'} to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}`,
      );
      return true;
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not send those reports'));
      return false;
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body.print-mentee-reports * { visibility: hidden !important; }
          body.print-mentee-reports #mentee-reports,
          body.print-mentee-reports #mentee-reports * { visibility: visible !important; }
          body.print-mentee-reports #mentee-reports { position: absolute; left: 0; top: 0; width: 100%; }
          body.print-mentee-reports .no-print { display: none !important; }
          #mentee-reports article { box-shadow: none !important; }
        }
      ` }} />
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-border bg-card p-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date" value={from} max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date" value={to} min={from}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"
            />
          </label>
          <button
            type="button" onClick={load} disabled={loading || (!clanId && !programId)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
            {loaded ? 'Refresh' : 'Build reports'}
          </button>
        </div>
      </div>

      {!clanId && !programId ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">Choose a programme or a clan to report on.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        </div>
      ) : !loaded ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Pick your dates, then build the reports.
          </p>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">Nobody to report on in that selection.</p>
        </div>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {chosen.length} of {reports.length} selected
              {refused > 0 && <span className="ml-1">· {refused} outside your access</span>}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(reports.map((r) => r.mentee.id)))}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Select all
            </button>
            <button
              type="button" onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-muted-foreground hover:underline"
            >
              Clear
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button" onClick={print}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                title="Print, or save as PDF"
              >
                <Printer className="h-4 w-4" /> Download
              </button>
              <SendReportsDrawer
                count={chosen.length}
                sending={sending}
                onSend={send}
                trigger={(open) => (
                  <button
                    type="button" onClick={open} disabled={chosen.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> Email
                  </button>
                )}
              />
            </div>
          </div>

          <div id="mentee-reports" className="space-y-4">
            {reports.map((report) => (
              <ReportCard
                key={report.mentee.id}
                report={report}
                selected={selected.has(report.mentee.id)}
                onToggle={() => toggle(report.mentee.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default MenteeReportPanel;
