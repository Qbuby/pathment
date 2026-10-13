'use client';

import { CalendarClock } from 'lucide-react';
import { scheduleApi, type PlanStrip } from '@/lib/services/schedule-api';
import { qk, useApiQuery } from '@/lib/query';

/**
 * Today's blocks, on the mentee card in clan review.
 *
 * Clan review is a stepping-through flow — the mentor is going person by person
 * — so this is a signal, not a second planner. Each block says how far through
 * it this mentee is, green when it is clear and amber when nothing in it has
 * been touched, which is the one thing worth asking about in a review.
 *
 * Renders nothing at all when there is no schedule or no blocks, so a clan that
 * does not use schedules never grows a panel for a feature it ignores.
 */
export function PlanStripCard({ menteeId, clanId }: { menteeId: string; clanId?: string | null }) {
  // The shared query hook rather than a hand-rolled effect: it keys on the
  // mentee, so stepping to the next person in review cannot leave the previous
  // one's blocks on screen while the new ones load.
  const { data: strip } = useApiQuery<PlanStrip>({
    queryKey: qk.mentee.planStrip(menteeId, clanId),
    queryFn: async () => (await scheduleApi.getStrip(menteeId, clanId)).data,
    enabled: !!menteeId,
    // Context, not the job of this page: a failure must never replace the
    // review with an error, so nothing is surfaced and the card stays hidden.
    errorMessage: '',
  });

  if (!strip?.hasSchedule || !strip.blocks.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-card p-4 dark:border-slate-800" aria-label="Today's plan">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
        <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden /> Today&rsquo;s plan
      </h3>
      <ul className="flex flex-wrap gap-2">
        {strip.blocks.map((b) => {
          const clear = b.total > 0 && b.done === b.total;
          const untouched = b.total > 0 && b.done === 0;
          return (
            <li
              key={b.id}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${
                clear
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : untouched
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'
              }`}
            >
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{b.time}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{b.label}</span>
              <span className={`font-mono tabular-nums ${
                clear ? 'text-emerald-700 dark:text-emerald-300'
                  : untouched ? 'text-amber-700 dark:text-amber-300'
                    : 'text-slate-500'
              }`}>
                {b.done}/{b.total}
              </span>
            </li>
          );
        })}
      </ul>
      {strip.unplanned > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {strip.unplanned} item{strip.unplanned === 1 ? '' : 's'} not on the day yet
        </p>
      )}
    </section>
  );
}
