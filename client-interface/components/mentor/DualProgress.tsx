'use client';

/**
 * DualProgress - shows absolute progress (raw output vs plan) alongside the
 * fairness-adjusted "relative" progress side by side. When the relative reads
 * meaningfully higher, the mentee is doing well given logged real constraints;
 * when they're about equal, output speaks for itself.
 *
 * Styled in the existing dashboard design system (indigo/slate), not the
 * prototype's look.
 */

interface DualProgressProps {
  absolute: number;
  relative: number;
  compact?: boolean;
  /** One line, for a card being scanned rather than studied. */
  row?: boolean;
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * A labelled bar with its own number written inside it.
 *
 * Inside rather than above, because at half width a separate number row would
 * cost as much height as the bar it describes. Under about a quarter full
 * there is no room, so the number steps outside rather than being clipped.
 */
function ValueBar({ label, value, fill, hint, delta }: {
  label: string;
  value: number;
  fill: string;
  hint?: string;
  /** Shown when the two readings actually differ; silent when they agree. */
  delta?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const inside = pct >= 26;
  return (
    <div title={hint}>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="truncate text-[11px] text-slate-500">{label}</span>
        {!!delta && delta > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-emerald-600">+{Math.round(delta)}</span>
        )}
      </div>
      <div className="relative h-5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${fill} animate-pm-bar`} style={{ width: `${pct}%` }} />
        <span
          className={`absolute inset-y-0 flex items-center text-[11px] font-semibold tabular-nums ${
            inside ? 'text-white' : 'text-slate-600 dark:text-slate-300'
          }`}
          style={inside ? { right: 'auto', left: `calc(${pct}% - 2.25rem)` } : { left: `calc(${pct}% + 0.4rem)` }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function DualProgress({ absolute, relative, compact = false, row = false }: DualProgressProps) {
  const gap = Math.round(relative - absolute);

  /**
   * Both numbers on one line, side by side.
   *
   * They are a pair and only mean anything read together: output on its own
   * says nothing about whether it was a fair week. Stacking them cost four
   * rows of a card meant to be scanned in a second, and showing only the raw
   * one hid half the point. Half the width each, value inside the bar, one row.
   */
  if (row) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <ValueBar label="Progress" value={absolute} fill="bg-brand-500" />
        <ValueBar
          label="Adjusted"
          value={relative}
          fill="bg-emerald-500"
          hint="Adjusted for the constraints they have logged"
          delta={gap}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <Bar label="Progress" value={absolute} color="bg-brand-500" />
      <Bar label="Adjusted for constraints" value={relative} color="bg-emerald-500" />
      {!compact && gap >= 8 && (
        <p className="text-xs text-emerald-600">
          +{gap} pts once logged constraints are counted - fighting to keep up.
        </p>
      )}
    </div>
  );
}
