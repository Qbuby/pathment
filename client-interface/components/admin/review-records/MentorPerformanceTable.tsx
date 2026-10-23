'use client';

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { ProgressBar } from '@/components/admin/ui';
import { ReviewCard } from './ReviewCard';
import { fmtMin, pct, rateBarClass, type GroupRow, type SessionRow } from './review-records-constants';

const COLLAPSED_ROWS = 5;

/** Attendance rate of each of a mentor's sessions, oldest → newest. */
function Sparkline({ rates }: { rates: number[] }) {
  if (rates.length < 2) return <span className="text-xs text-slate-300">—</span>;
  const w = 72, h = 24, pad = 2;
  const points = rates.map((r, i) => `${pad + (i / (rates.length - 1)) * (w - pad * 2)},${h - pad - (r / 100) * (h - pad * 2)}`).join(' ');
  const first = rates[0], last = rates[rates.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Attendance went from ${first}% to ${last}%`} className={last >= first ? 'text-emerald-600' : 'text-red-500'}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MentorPerformanceTableProps {
  rows: GroupRow[];
  /** Sessions in view — used for each mentor's per-session trend. */
  sessions: SessionRow[];
}

export function MentorPerformanceTable({ rows, sessions }: MentorPerformanceTableProps) {
  const [expanded, setExpanded] = useState(false);

  const trendByMentor = useMemo(() => {
    const map = new Map<string, number[]>();
    // `sessions` arrives newest first; walk it backwards for oldest → newest.
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      const marked = s.present + s.absent + s.excused;
      if (!marked) continue;
      const key = s.mentorId || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pct(s.present, marked));
    }
    return map;
  }, [sessions]);

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <ReviewCard
      title="Mentor performance"
      subtitle="Sessions run, attendance and participation per mentor"
      action={rows.length > COLLAPSED_ROWS && (
        <button onClick={() => setExpanded((v) => !v)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-brand-600 hover:bg-slate-50">
          {expanded ? 'Show fewer' : `View all ${rows.length} mentors`}
        </button>
      )}
    >
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-slate-400">No records for this filter yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-y border-slate-100 bg-slate-50/60">
                <th className="px-5 py-2 font-medium">Mentor</th>
                <th className="px-3 py-2 font-medium text-right">Sessions</th>
                <th className="px-3 py-2 font-medium text-right">Live video</th>
                <th className="px-3 py-2 font-medium text-right">Avg talk / session</th>
                <th className="px-3 py-2 font-medium">Attendance</th>
                <th className="px-5 py-2 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.key} className="border-b border-slate-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={g.label} size="sm" />
                      <span className="text-slate-800 truncate max-w-[180px]">{g.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{g.sessions}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{g.withVideo}/{g.sessions}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{fmtMin(g.talkSeconds / g.sessions)}</td>
                  <td className="px-3 py-2.5">
                    {g.marked > 0
                      ? <ProgressBar value={g.attendanceRate} color={rateBarClass(g.attendanceRate)} sub={`${g.present}/${g.marked} present`} />
                      : <span className="text-xs text-slate-300">Not marked</span>}
                  </td>
                  <td className="px-5 py-2.5"><Sparkline rates={trendByMentor.get(g.key) || []} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReviewCard>
  );
}
