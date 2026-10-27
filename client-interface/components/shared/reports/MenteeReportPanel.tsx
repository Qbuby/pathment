'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Printer, Send, FileText, CalendarRange, CheckCircle2, Circle, CircleDot,
  AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  StickyNote, Pencil, X, Star, Clock, Ban, Route,
} from 'lucide-react';
import {
  menteeReportsApi, type MenteeReport, type RoadmapStep, type RoadmapStepState,
} from '@/lib/services/mentee-reports-api';
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

/**
 * How each roadmap step is drawn.
 *
 * Six states rather than a tick or nothing, because the interesting cases are
 * in between: a step handed out and never started reads very differently from
 * one submitted and waiting on a reviewer, and a progress bar flattens both
 * into the same empty space.
 */
const STEP: Record<RoadmapStepState, { Icon: typeof Circle; cls: string; label: string }> = {
  completed: { Icon: CheckCircle2, cls: 'text-emerald-500', label: 'Done' },
  submitted: { Icon: Clock, cls: 'text-sky-500', label: 'Waiting on review' },
  in_progress: { Icon: CircleDot, cls: 'text-brand-500', label: 'In progress' },
  overdue: { Icon: AlertTriangle, cls: 'text-amber-500', label: 'Overdue' },
  assigned: { Icon: Circle, cls: 'text-slate-400', label: 'Not started' },
  cancelled: { Icon: Ban, cls: 'text-slate-300', label: 'Cancelled' },
  not_assigned: { Icon: Circle, cls: 'text-slate-200 dark:text-slate-700', label: 'Not given out yet' },
};

const readableDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The roadmap, step by step, rather than one percentage nobody can check. */
function RoadmapBlock({ roadmap }: { roadmap: MenteeReport['roadmaps'][number] }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <Chevron className="no-print h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{roadmap.name}</span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: `${roadmap.percentOfRoadmap}%` }}
            />
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-foreground">
            {roadmap.percentOfRoadmap}%
          </span>
          <span className="block text-[11px] tabular-nums text-muted-foreground">
            {roadmap.completed} of {roadmap.steps} steps
          </span>
        </span>
      </button>

      {/*
        * Always rendered, hidden only on screen. A printed report that stopped
        * at whatever the reader happened to have expanded would be a different
        * document every time it was saved.
        */}
      <ol className={`report-steps border-t border-border px-3 py-2 ${open ? '' : 'hidden'}`}>
        {roadmap.tasks.map((step: RoadmapStep, index) => {
          const look = STEP[step.state] ?? STEP.not_assigned;
          const faded = step.state === 'not_assigned' || step.state === 'cancelled';
          return (
            <li key={step.id} className="flex items-start gap-2.5 py-1 text-sm">
              <span className="w-5 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <look.Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${look.cls}`} aria-hidden />
              <span className={`min-w-0 flex-1 ${faded ? 'text-muted-foreground' : 'text-foreground'}`}>
                {step.title}
                {step.type && (
                  <span className="ml-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {step.type.replace(/_/g, ' ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {step.state === 'completed' && step.completedAt
                  ? shortDate(step.completedAt)
                  : step.state === 'overdue' && step.dueDate
                    ? `due ${shortDate(step.dueDate)}`
                    : look.label}
              </span>
              {step.rating != null && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Star className="h-3 w-3 fill-current text-amber-400" aria-hidden />
                  {step.rating}
                </span>
              )}
            </li>
          );
        })}
        {roadmap.tasksHidden > 0 && (
          <li className="py-1 pl-7 text-xs text-muted-foreground">
            and {roadmap.tasksHidden} more step{roadmap.tasksHidden === 1 ? '' : 's'}
          </li>
        )}
      </ol>
    </div>
  );
}

/** The mentor's own words about this person, written here and sent with it. */
function NoteBlock({ note, onChange }: { note: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  useEffect(() => { setDraft(note); }, [note]);

  if (!editing) {
    return note ? (
      <div className="mt-4 rounded-xl border-l-[3px] border-slate-300 bg-muted/40 px-3 py-2.5 dark:border-slate-600">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">{note}</p>
          <button
            type="button" onClick={() => setEditing(true)}
            className="no-print shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Edit this note"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button" onClick={() => setEditing(true)}
        className="no-print mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <StickyNote className="h-3.5 w-3.5" /> Add a note
      </button>
    );
  }

  return (
    <div className="no-print mt-4">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        autoFocus
        maxLength={2000}
        placeholder="Anything the reader should know that the numbers do not say."
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { onChange(draft.trim()); setEditing(false); }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Save note
        </button>
        <button
          type="button"
          onClick={() => { setDraft(note); setEditing(false); }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {note && (
          <button
            type="button"
            onClick={() => { onChange(''); setEditing(false); }}
            className="ml-auto text-xs font-medium text-rose-600 hover:underline"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/** One mentee, laid out to be read top to bottom and to print cleanly. */
function ReportCard({ report, selected, onToggle, note, onNote }: {
  report: MenteeReport;
  selected: boolean;
  onToggle: () => void;
  note: string;
  onNote: (value: string) => void;
}) {
  const momentum = MOMENTUM[report.progress.momentum as keyof typeof MOMENTUM] ?? MOMENTUM.flat;
  const risk = RISK[report.progress.risk as keyof typeof RISK] ?? RISK.low;
  const place = report.standing.inClan;
  const inProgram = report.standing.inProgram;

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
        <div className="flex items-center gap-2">
          {note && (
            <span className="no-print inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <StickyNote className="h-3 w-3" /> Note
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${risk.cls}`}>{risk.label}</span>
        </div>
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

      {/* The numbers that only make sense alongside the four above. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{report.activity.submitted} handed in</span>
        <span>{report.activity.pointsEarned} points earned</span>
        {report.activity.averageRating != null && (
          <span>{report.activity.averageRating}/5 average on reviewed work</span>
        )}
        {inProgram?.rank && <span>{inProgram.rank} of {inProgram.of} across the programme</span>}
      </p>

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
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Route className="h-3.5 w-3.5" aria-hidden />
            {report.roadmaps.length === 1 ? 'Their roadmap' : 'Their roadmaps'}
          </p>
          <div className="mt-1.5 space-y-2">
            {report.roadmaps.map((roadmap) => (
              <RoadmapBlock key={roadmap.id} roadmap={roadmap} />
            ))}
          </div>
        </div>
      )}

      <NoteBlock note={note} onChange={onNote} />

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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulkNote, setBulkNote] = useState<string | null>(null);
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

  const setNote = (menteeId: string, value: string) => setNotes((prev) => {
    const next = { ...prev };
    if (value) next[menteeId] = value; else delete next[menteeId];
    return next;
  });

  const chosen = reports.filter((r) => selected.has(r.mentee.id));
  const noteCount = chosen.filter((r) => notes[r.mentee.id]).length;

  /** One line written once and stamped onto everybody currently ticked. */
  const applyBulkNote = () => {
    const text = (bulkNote || '').trim();
    setNotes((prev) => {
      const next = { ...prev };
      for (const report of chosen) {
        if (text) next[report.mentee.id] = text; else delete next[report.mentee.id];
      }
      return next;
    });
    setBulkNote(null);
    toast.success(text
      ? `Note added to ${chosen.length} report${chosen.length === 1 ? '' : 's'}`
      : `Notes cleared on ${chosen.length} report${chosen.length === 1 ? '' : 's'}`);
  };

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
      const picked = chosen.map((r) => r.mentee.id);
      const result = await menteeReportsApi.send({
        ...scope,
        menteeIds: picked,
        recipients,
        note,
        notes: Object.fromEntries(picked.filter((id) => notes[id]).map((id) => [id, notes[id]])),
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
          /* A printed roadmap shows every step, whatever is expanded on screen. */
          body.print-mentee-reports .report-steps { display: block !important; }
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
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
          <p className="text-sm text-muted-foreground">
            Building each report and working out where everybody places. A whole programme takes a moment.
          </p>
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
          <div className="no-print rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {chosen.length} of {reports.length} selected
                {noteCount > 0 && <span className="ml-1">· {noteCount} with a note</span>}
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
                  type="button"
                  onClick={() => setBulkNote((value) => (value === null ? '' : null))}
                  disabled={chosen.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  title="Write one note and put it on every selected report"
                >
                  <StickyNote className="h-4 w-4" /> Note for selected
                </button>
                <button
                  type="button" onClick={print}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  title="Print, or save as PDF"
                >
                  <Printer className="h-4 w-4" /> Download
                </button>
                <SendReportsDrawer
                  count={chosen.length}
                  noteCount={noteCount}
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

            {/*
              * One note on many reports. The per-card note still wins for the
              * people who need something said about them specifically, which
              * is why this writes into the same place rather than travelling
              * separately.
              */}
            {bulkNote !== null && (
              <div className="border-t border-border px-4 py-3">
                <label htmlFor="bulk-note" className="text-xs font-medium text-foreground">
                  This note goes on all {chosen.length} selected report{chosen.length === 1 ? '' : 's'}
                </label>
                <textarea
                  id="bulk-note"
                  value={bulkNote}
                  onChange={(event) => setBulkNote(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  autoFocus
                  placeholder="October stipend review. Ramadan hours agreed for the whole clan."
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button" onClick={applyBulkNote}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    Apply to {chosen.length}
                  </button>
                  <button
                    type="button" onClick={() => setBulkNote(null)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" /> Close
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Leave it empty to clear the notes on those reports.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div id="mentee-reports" className="space-y-4">
            {reports.map((report) => (
              <ReportCard
                key={report.mentee.id}
                report={report}
                selected={selected.has(report.mentee.id)}
                onToggle={() => toggle(report.mentee.id)}
                note={notes[report.mentee.id] || ''}
                onNote={(value) => setNote(report.mentee.id, value)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default MenteeReportPanel;
