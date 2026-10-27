'use client';

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, ClipboardList, Clock } from 'lucide-react';
import { LearningStat } from '@/components/mentee/LearningStat';

/**
 * The furniture above a learner's work list: the four counts, and the
 * Active/Completed switch.
 *
 * Shared for the same reason the row is - a selection round and a clan are the
 * same screen to the person using them - and kept deliberately dumb. Each
 * caller owns its own counting, because "completed" means a mentor signed it
 * off in a clan and a reviewer approved it in a round, and those are not the
 * same question even though they land in the same box.
 */
export interface MenteeTaskStat {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  hint: string;
}

export function MenteeTaskStats({
  stats, loading, onPick,
}: {
  stats: MenteeTaskStat[];
  loading?: boolean;
  onPick?: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const card = (
          <LearningStat
            compact
            label={stat.label}
            value={loading ? '—' : stat.value}
            icon={stat.icon}
            tone={(i % 4) as 0 | 1 | 2 | 3}
            hint={stat.hint}
          />
        );
        return onPick ? (
          <button
            key={stat.key}
            type="button"
            className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onPick(stat.key)}
          >
            {card}
          </button>
        ) : (
          <div key={stat.key}>{card}</div>
        );
      })}
    </div>
  );
}

export function MenteeTaskViewToggle({
  view, onChange, activeCount, completedCount, loading, completedLabel = 'Completed',
}: {
  view: 'active' | 'completed';
  onChange: (view: 'active' | 'completed') => void;
  activeCount: number;
  completedCount: number;
  loading?: boolean;
  /** A round approves work rather than completing it. */
  completedLabel?: string;
}) {
  const tab = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:text-brand-600'
    }`;
  const count = (active: boolean, n: number) =>
    loading ? null : <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-slate-400'}`}>{n}</span>;

  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-card p-1">
      <button onClick={() => onChange('active')} aria-pressed={view === 'active'} className={tab(view === 'active')}>
        <Clock className="w-4 h-4" /> Active {count(view === 'active', activeCount)}
      </button>
      <button onClick={() => onChange('completed')} aria-pressed={view === 'completed'} className={tab(view === 'completed')}>
        <CheckCircle2 className="w-4 h-4" /> {completedLabel} {count(view === 'completed', completedCount)}
      </button>
    </div>
  );
}

export function MenteeTaskEmpty({
  view, title, hint,
}: {
  view: 'active' | 'completed';
  title: string;
  hint: string;
}) {
  const Icon = view === 'completed' ? CheckCircle2 : ClipboardList;
  return (
    <div className="text-center py-12">
      <Icon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-600 mb-2">{title}</p>
      <p className="text-slate-500 text-sm">{hint}</p>
    </div>
  );
}
