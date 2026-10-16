'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Lock, PenLine, Plus, Trash2 } from 'lucide-react';

import { menteeApi, type TaskProgress, type TaskProgressDay } from '@/lib/services/mentee-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/** "Mon 24" — short enough for a dense timeline, unambiguous enough to scan. */
const dayLabel = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
};

/**
 * A quiet stretch only earns its own row once it is long enough to be a story.
 *
 * Two silent days between work is ordinary and reads fine as two rows. A week
 * is a different thing and deserves to be said in one line, out loud.
 */
const COLLAPSE_RUN_FROM = 3;

type TimelineRow =
  | { kind: 'day'; day: TaskProgressDay }
  | { kind: 'gap'; days: TaskProgressDay[] };

/** Fold runs of empty days into single rows, leaving filled days untouched. */
function toRows(days: TaskProgressDay[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let run: TaskProgressDay[] = [];
  const flush = () => {
    if (!run.length) return;
    // Today is never swallowed into a gap — it is where the mentee writes.
    if (run.length >= COLLAPSE_RUN_FROM) rows.push({ kind: 'gap', days: run });
    else run.forEach((day) => rows.push({ kind: 'day', day }));
    run = [];
  };
  for (const day of days) {
    if (!day.entry && !day.isToday) { run.push(day); continue; }
    flush();
    rows.push({ kind: 'day', day });
  }
  flush();
  return rows;
}

/**
 * TaskProgressTimeline — a mentee's day-by-day notes on one task.
 *
 * One component, two readers. The mentee gets a box to write in; the mentor gets
 * the same timeline read only, so both are looking at exactly the same thing
 * during a review rather than two versions of the truth.
 *
 * The gaps are the signal and they stay. A four day task with two filled days
 * and two hollow ones tells a mentor something a status field never will.
 *
 * What changed is how a LONG gap is drawn. A task assigned four weeks ago
 * rendered twenty-eight rows, twenty-three of them reading "nothing logged",
 * and the five days that mattered were lost inside it. A run of quiet days is
 * now one row that says how long it was — which is not less information than
 * nine identical lines, it is the same information said once and read at a
 * glance. Clicking it opens the individual days.
 *
 * Which days may be written is the server's call, not this component's. While
 * the task is still the mentee's, every day in the window is open: today, and
 * any day they meant to write and did not. The moment it goes to the mentor
 * the whole log freezes, and `canLog` comes back false with a sentence saying
 * why. Backfilled lines are marked as such rather than passed off as same-day
 * ones — being able to fill a gap in is not the same as the gap never having
 * been there, and the mentor reading this should be able to tell.
 */
export function TaskProgressTimeline({
  taskId, mode, className = '', readOnly = false,
}: {
  taskId: string;
  /** 'mentee' can write; 'mentor' is read only. */
  mode: 'mentee' | 'mentor';
  /** Frozen/closed cohort — hide write controls even in mentee mode. */
  readOnly?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  /** The past day being rewritten, and the text in its box. One at a time. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * The whole panel folds away. On a task that has run for weeks the log is the
   * longest thing on the screen, and somebody opening the task to read the
   * brief should not have to scroll past a month of their own notes to reach
   * it. It opens by default, because for a mentee writing today's line is the
   * point of the panel; the header keeps the summary visible either way.
   */
  const [open, setOpen] = useState(true);
  const [openGaps, setOpenGaps] = useState<Set<string>>(new Set());

  const canWrite = mode === 'mentee' && !readOnly && (data?.canLog ?? false);

  const load = useCallback(async () => {
    try {
      const res = mode === 'mentee'
        ? await menteeApi.getTaskProgress(taskId)
        : await mentorApi.getTaskProgress(taskId) as { data?: TaskProgress };
      const next = (res as { data?: TaskProgress })?.data ?? null;
      setData(next);
      // Prefill today's box so editing feels like editing, not overwriting blind.
      const today = next?.days.find((d) => d.isToday);
      setNote(today?.entry?.note ?? '');
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [taskId, mode]);

  useEffect(() => { load(); }, [load]);

  /**
   * Above the early returns on purpose: `data` is null while loading, and a
   * hook that only runs once there is data changes the hook order between
   * renders.
   */
  const rows = useMemo(
    () => toRows((data?.days ?? []).filter((d) => !d.isFuture)),
    [data],
  );

  /** Write one day. No dateKey means today, which is what the box below sends. */
  const write = async (text: string, dateKey?: string) => {
    await menteeApi.logTaskProgress(taskId, text, dateKey ? { dateKey } : undefined);
    await load();
  };

  const save = async () => {
    if (!canWrite) return;
    const text = note.trim();
    if (!text) { toast.error('Write a line about what you did'); return; }
    setSaving(true);
    try {
      await write(text);
      toast.success('Progress saved');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save your progress'));
    } finally {
      setSaving(false);
    }
  };

  const saveDay = async (dateKey: string) => {
    if (!canWrite) return;
    const text = draft.trim();
    if (!text) { toast.error('Write a line about what you did'); return; }
    setBusyDay(dateKey);
    try {
      await write(text, dateKey);
      setEditing(null);
      setDraft('');
      toast.success(`${dayLabel(dateKey)} saved`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save that day'));
    } finally {
      setBusyDay(null);
    }
  };

  const remove = async (dateKey: string) => {
    if (!canWrite) return;
    setBusyDay(dateKey);
    try {
      await menteeApi.removeTaskProgress(taskId, dateKey);
      if (editing === dateKey) setEditing(null);
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not remove that day'));
    } finally {
      setBusyDay(null);
    }
  };

  const startEdit = (day: TaskProgressDay) => {
    setEditing(day.dateKey);
    setDraft(day.entry?.note ?? '');
  };

  if (loading) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-card p-6 flex justify-center ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!data) return null;

  // Nothing to show a mentor on a task that was never started.
  if (mode === 'mentor' && data.summary.loggedDays === 0) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-card p-5 ${className}`}>
        <h3 className="text-sm font-medium text-slate-900 mb-1">Progress</h3>
        <p className="text-sm text-slate-500">Nothing logged on this task yet.</p>
      </div>
    );
  }

  const renderDay = (day: TaskProgressDay, isLast: boolean) => (
    <DayRow
      key={day.dateKey}
      day={day}
      isLast={isLast}
      // Today is written in the box at the bottom, so it gets the delete
      // control but not a second editor saying the same thing twice.
      canEdit={canWrite}
      canRewrite={canWrite && !day.isToday}
      editing={editing === day.dateKey}
      draft={draft}
      busy={busyDay === day.dateKey}
      onDraft={setDraft}
      onStartEdit={() => startEdit(day)}
      onCancelEdit={() => { setEditing(null); setDraft(''); }}
      onSave={() => saveDay(day.dateKey)}
      onRemove={() => remove(day.dateKey)}
    />
  );

  return (
    <div className={`rounded-2xl border border-slate-200 bg-card ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <h3 className="text-sm font-medium text-slate-900 inline-flex items-center gap-1.5">
          <PenLine className="w-4 h-4 text-brand-600" /> Progress
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-xs text-slate-500 tabular-nums">{data.summary.label}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      {open && (
      <div className="px-5 py-4 border-t border-slate-200">
        <ol className="space-y-0">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            if (row.kind === 'gap' && !openGaps.has(row.days[0].dateKey)) {
              return (
                <GapRow
                  key={`gap-${row.days[0].dateKey}`}
                  days={row.days}
                  isLast={isLast}
                  canWrite={canWrite}
                  onExpand={() => setOpenGaps((prev) => new Set(prev).add(row.days[0].dateKey))}
                />
              );
            }
            const days = row.kind === 'gap' ? row.days : [row.day];
            return days.map((day, j) => renderDay(day, isLast && j === days.length - 1));
          })}
        </ol>

        {canWrite && (
          <div className="mt-4">
            <label htmlFor={`progress-${taskId}`} className="sr-only">What did you do today?</label>
            <textarea
              id={`progress-${taskId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What did you do today?"
              className="w-full rounded-xl border border-slate-200 bg-card px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Your mentor can see this. Being stuck is worth writing down.
              </p>
              <button
                onClick={save}
                disabled={saving || !note.trim()}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        )}

        {/* The log has gone with the work. Say so rather than showing controls
            that would be refused, or nothing at all and leaving them guessing. */}
        {mode === 'mentee' && !readOnly && !data.canLog && data.closedBecause && (
          <p className="mt-4 inline-flex items-start gap-1.5 text-xs text-slate-500">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {data.closedBecause}
          </p>
        )}
        {mode === 'mentee' && readOnly && (
          <p className="mt-4 text-xs text-slate-500">Completed programs are read-only.</p>
        )}
      </div>
      )}
    </div>
  );
}

/** A stretch of quiet, said once. Opens into its individual days. */
function GapRow({ days, isLast, canWrite, onExpand }: {
  days: TaskProgressDay[];
  isLast: boolean;
  canWrite: boolean;
  onExpand: () => void;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        {/* Dashed, not hollow: this marker stands for a span, not a day. */}
        <span aria-hidden className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-dashed border-slate-300" />
        {!isLast && <span className="w-px flex-1 bg-slate-200 my-1" />}
      </div>
      <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <button
          type="button"
          onClick={onExpand}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 underline-offset-4 hover:underline"
        >
          {days.length} days with nothing logged
          <span className="ml-1.5 text-slate-300">({dayLabel(days[0].dateKey)} – {dayLabel(days[days.length - 1].dateKey)})</span>
          {/* Without this the folded row looks like a dead end, and the days
              you most want to fill in are the ones hidden inside it. */}
          {canWrite && <span className="ml-1.5 text-brand-600">· open to fill one in</span>}
        </button>
      </div>
    </li>
  );
}

/** One day. Filled days get a solid marker, empty days a hollow one. */
function DayRow({
  day, isLast, canEdit, canRewrite, editing, draft, busy,
  onDraft, onStartEdit, onCancelEdit, onSave, onRemove,
}: {
  day: TaskProgressDay;
  isLast: boolean;
  /** The log is open to this mentee at all. */
  canEdit: boolean;
  /** …and this day has its own editor (today's lives in the box below). */
  canRewrite: boolean;
  editing: boolean;
  draft: string;
  busy: boolean;
  onDraft: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const filled = !!day.entry;
  return (
    <li className="flex gap-3 group">
      <div className="flex flex-col items-center shrink-0">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${
            filled ? 'bg-brand-600 border-brand-600' : 'bg-transparent border-slate-300'
          }`}
        />
        {!isLast && <span className="w-px flex-1 bg-slate-200 my-1" />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <div className="flex items-center gap-2">
          <p className={`text-xs font-medium ${filled ? 'text-slate-700' : 'text-slate-400'}`}>
            {dayLabel(day.dateKey)}
            {day.isToday && <span className="ml-1.5 text-brand-600">today</span>}
          </p>
          {/* Written afterwards, and said so. A filled-in gap is still worth
              more than an empty one; it is just not the same thing. */}
          {day.entry?.addedLate && (
            <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">
              added later
            </span>
          )}
          {canRewrite && filled && !editing && (
            <button
              onClick={onStartEdit}
              aria-label={`Edit progress for ${dayLabel(day.dateKey)}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-slate-300 hover:text-brand-600 transition-opacity"
            >
              <PenLine className="w-3 h-3" />
            </button>
          )}
          {canEdit && filled && !editing && (
            <button
              onClick={onRemove}
              disabled={busy}
              aria-label={`Remove progress for ${dayLabel(day.dateKey)}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-slate-300 hover:text-red-600 transition-opacity disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5">
            <label htmlFor={`progress-day-${day.dateKey}`} className="sr-only">
              What you did on {dayLabel(day.dateKey)}
            </label>
            <textarea
              id={`progress-day-${day.dateKey}`}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              placeholder={`What did you do on ${dayLabel(day.dateKey)}?`}
              className="w-full rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={onSave}
                disabled={busy || !draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : filled ? (
          <p className="mt-0.5 text-sm text-slate-600 whitespace-pre-wrap">{day.entry!.note}</p>
        ) : canRewrite ? (
          // A hover-only affordance on an empty row is undiscoverable, and an
          // empty row is exactly the one somebody came here to fill.
          <button
            onClick={onStartEdit}
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-400 italic hover:text-brand-600"
          >
            <Plus className="w-3 h-3" aria-hidden /> nothing logged — add it
          </button>
        ) : (
          <p className="mt-0.5 text-sm text-slate-300 italic">nothing logged</p>
        )}
      </div>
    </li>
  );
}
