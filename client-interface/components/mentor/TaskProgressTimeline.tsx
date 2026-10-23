'use client';

import { useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { qk, useApiQuery } from '@/lib/query';

interface ProgressDay {
  dateKey: string;
  isToday: boolean;
  isFuture: boolean;
  entry: { note: string; minutesSpent: number | null; addedLate?: boolean } | null;
}
interface ProgressSummary {
  loggedDays: number;
  elapsedDays: number;
  label: string;
  lastNote: string | null;
  lastLoggedOn: string | null;
}

/** Day keys are plain labels, so read them as UTC or a timezone shifts the date. */
const asDate = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`);
const weekdayInitial = (dateKey: string) =>
  asDate(dateKey).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });
const dayNumber = (dateKey: string) => asDate(dateKey).getUTCDate();
const shortDate = (dateKey: string) =>
  asDate(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** How many notes are worth showing before the panel starts to run the drawer. */
const PREVIEW_NOTES = 3;

/**
 * What the mentee has written, day by day, on this one task.
 *
 * This read used to sit on the clan-review screen as a card listing every open
 * task with a one-line summary — beside the list of those same tasks, pushing
 * the review itself down the page. It belongs on the task: a mentor asking
 * "how's this going" has already opened the thing they are asking about.
 *
 * The gaps are the point. A four-day task with nothing written on days one and
 * two IS the signal, so empty days are drawn rather than collapsed away.
 *
 * It is drawn as a calendar strip rather than a list because the question a
 * mentor is actually asking is a shape question — are they working steadily,
 * did they do it all the night before, have they stopped — and a shape is read
 * faster than it is counted. The weekday letter sits above each cell for the
 * same reason: three missed days that are Friday, Saturday and Sunday is a
 * different conversation from three missed weekdays, and that difference is
 * invisible in a row of identical squares.
 */
export function TaskProgressTimeline({ taskId }: { taskId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data, loading } = useApiQuery<{ days: ProgressDay[]; summary: ProgressSummary }>({
    queryKey: qk.mentor.taskProgress(taskId),
    queryFn: async () => (await mentorApi.getTaskProgress(taskId)).data,
    enabled: !!taskId,
    // Context, not the job of this drawer: a failure shows nothing rather than
    // an error over the task the mentor came here to read.
    errorMessage: '',
  });
  const days = data?.days ?? null;
  const summary = data?.summary ?? null;

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
      </div>
    );
  }
  // Nothing to say before anything has happened, and no empty box either.
  if (!days?.length || !summary) return null;

  const past = days.filter((d) => !d.isFuture);
  const written = past.filter((d) => d.entry);
  const notes = showAll ? written : written.slice(-PREVIEW_NOTES);

  // Days since anything was written. The number a mentor would otherwise work
  // out by counting backwards along the strip, which is what it is for.
  let quiet = 0;
  for (let i = past.length - 1; i >= 0 && !past[i].entry; i -= 1) quiet += 1;

  const alarm = written.length === 0
    ? 'Nothing logged on this task yet'
    : quiet >= 2
      ? `Nothing for ${quiet} days — last wrote ${shortDate(summary.lastLoggedOn || past[past.length - 1].dateKey)}`
      : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-card px-3.5 py-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <CalendarDays className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          Day by day
        </p>
        <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {summary.loggedDays}
          </span>
          <span className="tabular-nums"> of {summary.elapsedDays}</span>
          {' '}day{summary.elapsedDays === 1 ? '' : 's'}
        </p>
      </div>

      {/* One cell a day, in order, so a run of silence is a shape rather than
          something you have to count. */}
      <ol className="mt-2.5 flex flex-wrap gap-x-1 gap-y-1.5" aria-label="Days logged">
        {past.map((d) => {
          const filled = !!d.entry;
          const late = !!d.entry?.addedLate;
          return (
            <li key={d.dateKey} className="flex w-5 flex-col items-center gap-0.5">
              <span aria-hidden className="text-[9px] uppercase leading-none text-slate-300 dark:text-slate-600">
                {weekdayInitial(d.dateKey)}
              </span>
              <span
                title={d.entry
                  ? `${shortDate(d.dateKey)}: ${d.entry.note}${late ? ' (added later)' : ''}`
                  : `${shortDate(d.dateKey)}: nothing logged`}
                className={`h-5 w-5 rounded-[5px] ${
                  d.isToday ? 'outline outline-2 outline-offset-1 outline-brand-400/70' : ''
                } ${
                  filled
                    // A day filled in afterwards is still a day written about,
                    // so it is not drawn as empty — just not as solid.
                    ? late
                      ? 'border border-dashed border-brand-400 bg-brand-100 dark:bg-brand-500/20'
                      : 'bg-brand-600'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span className="sr-only">
                  {shortDate(d.dateKey)}: {filled ? 'logged' : 'nothing logged'}
                </span>
              </span>
              <span aria-hidden className="text-[9px] leading-none tabular-nums text-slate-300 dark:text-slate-600">
                {dayNumber(d.dateKey)}
              </span>
            </li>
          );
        })}
      </ol>

      {alarm && (
        <p className="mt-2.5 text-xs font-medium text-amber-600 dark:text-amber-500">{alarm}</p>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-2.5 dark:border-slate-700/60">
          {[...notes].reverse().map((d) => (
            <li key={d.dateKey} className="flex gap-2.5 text-xs">
              <span className="mt-px shrink-0 tabular-nums font-medium text-slate-400 dark:text-slate-500">
                {shortDate(d.dateKey)}
              </span>
              <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
                <span className="whitespace-pre-wrap">{d.entry!.note}</span>
                {d.entry!.minutesSpent != null && (
                  <span className="ml-1.5 text-slate-400">· {d.entry!.minutesSpent}m</span>
                )}
                {d.entry!.addedLate && (
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    added later
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Cutting silently to three hides the early days of a long task, which
          is often where the story started. */}
      {written.length > PREVIEW_NOTES && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {showAll ? 'Show less' : `Show all ${written.length} entries`}
        </button>
      )}
    </div>
  );
}
