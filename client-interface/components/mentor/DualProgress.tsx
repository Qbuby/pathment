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

export function DualProgress({ absolute, relative, compact = false, row = false }: DualProgressProps) {
  const gap = Math.round(relative - absolute);

  /**
   * One line instead of two stacked bars.
   *
   * Two labelled bars that usually read the same number cost four rows of a
   * card the mentor is trying to scan in a second. The adjusted figure is a
   * footnote to the real one, not its equal, so it sits ON the track as a mark
   * and is only spelled out when it actually differs.
   */
  if (row) {
    const abs = Math.max(0, Math.min(100, absolute));
    const rel = Math.max(0, Math.min(100, relative));
    return (
      <div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs text-slate-500">Progress</span>
          <span className="text-sm font-semibold tabular-nums text-slate-800">{abs}%</span>
          {gap !== 0 && (
            <span
              className={`text-xs tabular-nums ${gap > 0 ? 'text-emerald-600' : 'text-slate-400'}`}
              title="Adjusted for the constraints they have logged"
            >
              {gap > 0 ? `+${gap} adjusted` : `${rel}% adjusted`}
            </span>
          )}
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="animate-pm-bar h-full rounded-full bg-brand-500" style={{ width: `${abs}%` }} />
          {/* The adjusted figure as a mark on the same track — visible when it
              differs, invisible when it agrees, which is the honest default. */}
          {gap > 0 && (
            <span
              aria-hidden
              className="absolute top-0 h-full w-0.5 bg-emerald-500"
              style={{ left: `calc(${rel}% - 1px)` }}
            />
          )}
        </div>
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
