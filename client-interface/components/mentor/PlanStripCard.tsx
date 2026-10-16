'use client';

import { useState } from 'react';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { scheduleApi, type PlanStrip } from '@/lib/services/schedule-api';
import { qk, useApiQuery } from '@/lib/query';
import { Drawer } from '@/components/shared/Drawer';
import { DayPlanner } from '@/components/mentee/DayPlanner';

/**
 * This mentee's day, on their card in clan review — and a way into it.
 *
 * It began as a read-only row of counts, which turned out to be worse than
 * nothing: a mentor in the middle of a review could see "Clan standup 0/0" and
 * had no way to put anything in it. The schedule was visible and untouchable at
 * the same moment the conversation about it was happening.
 *
 * So the strip is a door. Click any block — or the pencil — and the full
 * planner opens over the review, in the mentor's voice, with everything they
 * can do to that day: add work to a block, make a block, lock one so it cannot
 * be moved, drag work between them. Closing it drops the mentor back exactly
 * where they were, still on the same mentee.
 *
 * It stays a drawer rather than becoming a panel because review is a
 * stepping-through flow. The strip is the signal; the planner is the work.
 */
export function PlanStripCard({
  menteeId, menteeName, clanId, readOnly = false, compact = false, own = false,
}: {
  menteeId: string;
  menteeName?: string;
  clanId?: string | null;
  readOnly?: boolean;
  /**
   * The viewer is the mentee. Only changes the words: "Your day" rather than
   * "Their day", which is what a mentee saw on their own dashboard when this
   * component was reused there.
   */
  own?: boolean;
  /**
   * One row instead of a card.
   *
   * The strip's job on a review screen is to say whether today has a shape and
   * to be a door into it. Laid out as a full card with a block per chip it was
   * costing more height than the mentee it belonged to, and the detail it
   * showed is all in the planner one click away.
   */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const { data: strip, refetch } = useApiQuery<PlanStrip>({
    queryKey: qk.mentee.planStrip(menteeId, clanId),
    queryFn: async () => (await scheduleApi.getStrip(menteeId, clanId)).data,
    enabled: !!menteeId,
    // Context, not the job of this page: a failure must never replace the
    // review with an error, so nothing is surfaced and the card stays quiet.
    errorMessage: '',
  });

  const blocks = strip?.blocks ?? [];
  const planned = blocks.reduce((n, b) => n + b.total, 0);
  const done = blocks.reduce((n, b) => n + b.done, 0);

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => !readOnly && setOpen(true)}
          disabled={readOnly}
          aria-label={`Open ${own ? 'your' : menteeName ? `${menteeName}\u2019s` : 'their'} plan for today`}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-card px-4 py-2.5 text-left transition-colors hover:border-brand-300 disabled:cursor-default disabled:hover:border-slate-200 dark:border-slate-800"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="shrink-0 text-sm font-medium text-slate-900 dark:text-slate-100">Today&rsquo;s plan</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {blocks.length === 0
              ? 'No blocks yet — give the day a shape'
              : `${blocks.length} block${blocks.length === 1 ? '' : 's'} · ${done}/${planned} done`}
            {!!strip?.unplanned && ` · ${strip.unplanned} not in a block`}
          </span>
          {!readOnly && (
            <span className="shrink-0 text-xs font-medium text-brand-600">
              {blocks.length ? 'Open' : 'Set up'}
            </span>
          )}
        </button>

        <Drawer
          open={open}
          onClose={() => { setOpen(false); void refetch(); }}
          width="lg"
          title={own ? 'Your day' : menteeName ? `${menteeName}\u2019s day` : 'Their day'}
          subtitle="Add work to a block, make a new one, or lock one so it stays put"
        >
          {open && <DayPlanner menteeId={menteeId} menteeName={menteeName} clanId={clanId} onChanged={() => void refetch()} />}
        </Drawer>
      </>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-card p-4 dark:border-slate-800" aria-label="Today's plan">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
            <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden /> Today&rsquo;s plan
          </h3>
          {planned > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{done}/{planned}</span>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              {blocks.length ? <><Pencil className="h-3.5 w-3.5" aria-hidden />Plan with them</>
                : <><Plus className="h-3.5 w-3.5" aria-hidden />Set up their day</>}
            </button>
          )}
        </div>

        {blocks.length === 0 ? (
          // A mentee with no blocks is the case a mentor most needs to act on,
          // so it says so instead of rendering nothing.
          <p className="text-xs text-muted-foreground">
            No blocks yet{readOnly ? '.' : ' — give them a shape for the day, or assign one from a template.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {blocks.map((b) => {
              const clear = b.total > 0 && b.done === b.total;
              const untouched = b.total > 0 && b.done === 0;
              const empty = b.total === 0;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => !readOnly && setOpen(true)}
                    disabled={readOnly}
                    title={readOnly ? undefined : `Open ${own ? 'your' : menteeName ? `${menteeName}’s` : 'their'} plan at ${b.label}`}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                      readOnly ? 'cursor-default' : 'hover:border-brand-400'
                    } ${
                      clear
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                        : untouched
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
                          : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
                  >
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{b.time}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{b.label}</span>
                    {/* An empty block reads as "nothing here to do", not "0 of 0
                        done", which looked like a failed count. */}
                    <span className={`font-mono tabular-nums ${
                      clear ? 'text-emerald-700 dark:text-emerald-300'
                        : untouched ? 'text-amber-700 dark:text-amber-300'
                          : 'text-slate-500'
                    }`}>
                      {empty ? '—' : `${b.done}/${b.total}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!!strip?.unplanned && (
          <button
            type="button"
            onClick={() => !readOnly && setOpen(true)}
            disabled={readOnly}
            className="mt-2 text-[11px] text-muted-foreground underline-offset-4 hover:text-brand-700 hover:underline disabled:no-underline"
          >
            {strip.unplanned} item{strip.unplanned === 1 ? '' : 's'} not in a block yet
          </button>
        )}
      </section>

      <Drawer
        open={open}
        onClose={() => { setOpen(false); void refetch(); }}
        width="lg"
        title={own ? 'Your day' : menteeName ? `${menteeName}’s day` : 'Their day'}
        subtitle="Add work to a block, make a new one, or lock one so it stays put"
      >
        {open && <DayPlanner menteeId={menteeId} menteeName={menteeName} clanId={clanId} onChanged={() => void refetch()} />}
      </Drawer>
    </>
  );
}
