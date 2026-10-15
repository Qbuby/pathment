'use client';

import { CalendarDays, Loader2 } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { qk, useApiQuery } from '@/lib/query';

interface ProgressDay {
  dateKey: string;
  isToday: boolean;
  isFuture: boolean;
  entry: { note: string; minutesSpent: number | null } | null;
}
interface ProgressSummary {
  loggedDays: number;
  elapsedDays: number;
  label: string;
  lastNote: string | null;
  lastLoggedOn: string | null;
}

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
 */
export function TaskProgressTimeline({ taskId }: { taskId: string }) {
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
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }
  // Nothing to say before anything has happened, and no empty box either.
  if (!days?.length || !summary) return null;

  const past = days.filter((d) => !d.isFuture);
  const written = past.filter((d) => d.entry);

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          <CalendarDays className="h-3 w-3" aria-hidden />Day by day
        </p>
        <span className={`text-xs ${summary.loggedDays === 0 ? 'font-medium text-amber-600' : 'text-slate-500'}`}>
          {summary.label}
        </span>
      </div>

      {/* One square a day, so a run of silence is visible at a glance rather
          than something you have to count. */}
      <div className="flex flex-wrap gap-1">
        {past.map((d) => (
          <span
            key={d.dateKey}
            title={d.entry
              ? `${d.dateKey}: ${d.entry.note}`
              : `${d.dateKey}: nothing logged`}
            className={`h-4 w-4 rounded-[4px] ${
              d.entry
                ? 'bg-emerald-500'
                : d.isToday
                  ? 'border border-dashed border-slate-300 dark:border-slate-600'
                  : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>

      {written.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {written.slice(-3).reverse().map((d) => (
            <li key={d.dateKey} className="text-xs">
              <span className="font-mono tabular-nums text-slate-400">
                {new Date(`${d.dateKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <span className="ml-2 text-slate-600 dark:text-slate-300">{d.entry!.note}</span>
              {d.entry!.minutesSpent != null && (
                <span className="ml-1.5 text-slate-400">· {d.entry!.minutesSpent}m</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
