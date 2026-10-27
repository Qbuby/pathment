'use client';

import { PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ReviewCard } from './ReviewCard';
import { ATTENDANCE_SERIES, pct, type Summary } from './review-records-constants';

interface AttendanceBreakdownChartProps {
  summary: Summary;
  /** Roster entries with no attendance marked. */
  unmarked: number;
}

/** Donut of present / excused / absent across every session in view. */
export function AttendanceBreakdownChart({ summary, unmarked }: AttendanceBreakdownChartProps) {
  const data = ATTENDANCE_SERIES.map((s) => ({ ...s, value: summary[s.key] }));

  return (
    <ReviewCard title="Attendance status" subtitle="All sessions in view">
      {summary.marked === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No attendance marked yet.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <div className="relative h-40 w-40 shrink-0">
            <ChartContainer config={{}} className="aspect-square h-40 w-40">
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="rounded-lg border border-slate-200 bg-card px-3 py-2 text-xs shadow-lg">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.label}
                          <span className="ml-2 font-medium text-slate-900 tabular-nums">{d.value} ({pct(d.value, summary.marked)}%)</span>
                        </span>
                      </div>
                    );
                  }}
                />
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={76} paddingAngle={2} stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                  {data.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">{summary.marked.toLocaleString()}</span>
              <span className="text-[11px] text-slate-500">Marked</span>
            </div>
          </div>
          <ul className="min-w-[10rem] flex-1 divide-y divide-slate-100 text-sm">
            {data.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.label}
                </span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {d.value.toLocaleString()} <span className="font-normal text-slate-500">({pct(d.value, summary.marked)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {unmarked > 0 && (
        <p className="mt-4 text-xs text-slate-500">{unmarked.toLocaleString()} roster {unmarked === 1 ? 'entry has' : 'entries have'} no attendance marked.</p>
      )}
    </ReviewCard>
  );
}
