'use client';

import { useMemo, useState } from 'react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { Avatar } from '@/components/shared/Avatar';
import { ProgressBar } from '@/components/admin/ui';
import { ReviewCard } from './ReviewCard';
import { fmtMin, rateBarClass, type GroupRow } from './review-records-constants';

const SORT_OPTIONS = [
  { value: 'attendance', label: 'By attendance' },
  { value: 'sessions', label: 'By sessions' },
  { value: 'talk', label: 'By talk time' },
];
const TOP_N = 5;

/** Ranked clans — attendance rate by default, re-sortable by volume or talk time. */
export function TopClansList({ rows }: { rows: GroupRow[] }) {
  const [sort, setSort] = useState('attendance');
  const ranked = useMemo(() => {
    const list = [...rows];
    if (sort === 'sessions') list.sort((a, b) => b.sessions - a.sessions);
    else if (sort === 'talk') list.sort((a, b) => b.talkSeconds - a.talkSeconds);
    // Clans with nothing marked have no rate to rank — keep them last.
    else list.sort((a, b) => Number(b.marked > 0) - Number(a.marked > 0) || b.attendanceRate - a.attendanceRate || b.marked - a.marked);
    return list.slice(0, TOP_N);
  }, [rows, sort]);

  return (
    <ReviewCard
      title="Top clans"
      action={<SelectMenu value={sort} onChange={setSort} options={SORT_OPTIONS} ariaLabel="Sort clans" searchable={false} className="w-40" />}
    >
      {ranked.length === 0 ? (
        <p className="py-6 text-sm text-slate-400">No records for this filter yet.</p>
      ) : (
        <ol className="space-y-4">
          {ranked.map((g, i) => (
            <li key={g.key} className="flex items-center gap-3">
              <span className="w-4 text-xs text-slate-400 tabular-nums">{i + 1}.</span>
              <Avatar name={g.label} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{g.label}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap tabular-nums">{g.present}/{g.marked || '—'}</span>
                </div>
                <div className="mt-1">
                  <ProgressBar value={g.attendanceRate} color={rateBarClass(g.attendanceRate)} />
                </div>
                <div className="text-[11px] text-slate-400">{g.sessions} {g.sessions === 1 ? 'session' : 'sessions'} · {fmtMin(g.talkSeconds)} talk</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </ReviewCard>
  );
}
