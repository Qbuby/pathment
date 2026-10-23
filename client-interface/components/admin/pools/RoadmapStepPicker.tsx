'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Info, Loader2, Route, Search } from 'lucide-react';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import type { RoadmapOption, RoadmapStepOption } from '@/lib/services/pool-api';
import { DIFFICULTY_POINTS_FALLBACK, type Difficulty } from './poolUi';

/**
 * Picking qualifying work out of the programme's roadmaps.
 *
 * It used to be one flat alphabetical list of every step in the programme,
 * each labelled with the roadmap it came from, and one step could be chosen
 * per visit. For a six-month fellowship that is two hundred rows in an order
 * nobody teaches in, and no way to look *inside* a roadmap — which is how the
 * work is actually chosen ("the three month-two projects").
 *
 * So the roadmap is the unit. Open one, read its steps in teaching order, tick
 * the ones that belong in this round. A step already in the pool is shown as
 * such rather than hidden, because "it is already there" is the answer the
 * operator is looking for when they cannot find it.
 */

const row = 'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors';
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-brand-50 text-brand-700',
  hard: 'bg-amber-50 text-amber-700',
  expert: 'bg-rose-50 text-rose-700',
};

function StepRow({
  step,
  checked,
  taken,
  points,
  onToggle,
}: {
  step: RoadmapStepOption;
  checked: boolean;
  taken: boolean;
  points: number;
  onToggle: () => void;
}) {
  const disabled = taken || !step.assignable;
  const reason = taken
    ? 'Already in this pool'
    : !step.assignable
      ? `A ${step.type} step is added as its own kind of work`
      : null;

  return (
    <li>
      <label
        className={`${row} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50'} ${checked ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          aria-label={step.title}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">{step.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="capitalize">{step.type.replace('_', ' ')}</span>
            {step.estimatedHours ? <span>· {step.estimatedHours}h</span> : null}
            {reason && <span className="text-slate-400">· {reason}</span>}
          </span>
        </span>
        {step.difficulty && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${DIFFICULTY_TONE[step.difficulty] || 'bg-muted text-slate-600'}`}>
            {step.difficulty}
          </span>
        )}
        <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
          {step.assignable ? `${points} pts` : '—'}
        </span>
      </label>
    </li>
  );
}

export function RoadmapStepPicker({
  roadmaps,
  loading,
  takenTaskIds,
  selected,
  onSelectedChange,
  difficultyPoints,
}: {
  roadmaps: RoadmapOption[] | undefined;
  loading: boolean;
  /** Steps already part of this pool's work — shown, not hidden. */
  takenTaskIds: Set<string>;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  difficultyPoints: Record<string, number>;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const all = roadmaps || [];
    if (!q) return all;
    // Searching looks inside roadmaps: a roadmap matches by its own name, or
    // because one of its steps does — and then only those steps are shown.
    return all
      .map((r) => {
        const nameHit = r.name.toLowerCase().includes(q);
        const steps = nameHit ? r.steps : r.steps.filter((sp) => `${sp.title} ${sp.type}`.toLowerCase().includes(q));
        return steps.length || nameHit ? { ...r, steps } : null;
      })
      .filter((r): r is RoadmapOption => Boolean(r));
  }, [roadmaps, q]);

  // While searching, every matching roadmap is open — hunting for a step and
  // then having to click the roadmap it was found in is a step too many.
  const isOpen = (id: string) => Boolean(q) || openId === id;
  const pointsFor = (step: RoadmapStepOption) =>
    difficultyPoints[String(step.difficulty || 'medium')] ?? DIFFICULTY_POINTS_FALLBACK[(step.difficulty || 'medium') as Difficulty];

  const toggle = (id: string) =>
    onSelectedChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const toggleAll = (r: RoadmapOption) => {
    const free = r.steps.filter((sp) => sp.assignable && !takenTaskIds.has(sp.id)).map((sp) => sp.id);
    const allOn = free.length > 0 && free.every((id) => selected.includes(id));
    onSelectedChange(allOn ? selected.filter((id) => !free.includes(id)) : [...new Set([...selected, ...free])]);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">Pick the steps to use</span>
        {selected.length > 0 && (
          <span className="text-xs font-medium text-brand-700 tabular-nums">{selected.length} selected</span>
        )}
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roadmaps and steps…"
          aria-label="Search roadmaps and steps"
          className={`${inputCls} pl-9`}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> Loading roadmaps…
        </div>
      )}

      {!loading && list.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {(roadmaps || []).length
            ? 'Nothing matches that search.'
            : 'This programme has no roadmaps yet. Build one under Curriculum, or add a custom task instead.'}
        </p>
      )}

      <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
        {list.map((r) => {
          const open = isOpen(r.id);
          const free = r.steps.filter((sp) => sp.assignable && !takenTaskIds.has(sp.id));
          const chosen = r.steps.filter((sp) => selected.includes(sp.id)).length;
          return (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setOpenId(open && !q ? null : r.id)}
                aria-expanded={open}
                className={`${row} bg-muted/40 hover:bg-muted/70`}
              >
                <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                <ClanAvatar name={r.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {r.assignableCount} of {r.stepCount} {r.stepCount === 1 ? 'step' : 'steps'} can be handed in
                    {r.totalWeeks ? ` · ${r.totalWeeks} weeks` : ''}
                    {!r.published ? ' · draft' : ''}
                  </span>
                </span>
                {chosen > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    <CheckCircle2 className="h-3 w-3" /> {chosen}
                  </span>
                )}
              </button>

              {open && (
                <div className="border-t border-border">
                  {r.steps.length === 0 ? (
                    <p className="flex items-start gap-2 px-4 py-4 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      This roadmap has no steps yet.
                    </p>
                  ) : (
                    <>
                      {free.length > 1 && (
                        <div className="flex justify-end border-b border-border bg-card px-4 py-2">
                          <button
                            type="button"
                            onClick={() => toggleAll(r)}
                            className="text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            {free.every((sp) => selected.includes(sp.id)) ? 'Clear all' : `Select all ${free.length}`}
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-border">
                        {r.steps.map((step) => (
                          <StepRow
                            key={step.id}
                            step={step}
                            checked={selected.includes(step.id)}
                            taken={takenTaskIds.has(step.id)}
                            points={pointsFor(step)}
                            onToggle={() => toggle(step.id)}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && (roadmaps || []).length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Route className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Each step keeps its own brief and checks. Points come from its difficulty, and you can change them per piece afterwards.
        </p>
      )}
    </div>
  );
}
