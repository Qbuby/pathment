'use client';

import { BarChart, Bar, CartesianGrid, Rectangle, XAxis, YAxis, type RectangleProps } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ReviewCard, AttendanceLegend, AttendanceTooltip } from './ReviewCard';
import { ATTENDANCE_SERIES, topAttendanceKey, type AttendanceKey, type GroupRow } from './review-records-constants';

const MAX_CLANS = 8;
const shorten = (label: string) => (label.length > 12 ? `${label.slice(0, 11)}…` : label);

interface ClanDatum {
  label: string; sessions: number; present: number; excused: number; absent: number;
  /** Topmost non-empty segment — the only one that gets a rounded end. */
  top: AttendanceKey | null;
}

/** Stacked attendance counts per clan (busiest clans first). */
export function AttendanceByClanChart({ rows }: { rows: GroupRow[] }) {
  const data: ClanDatum[] = rows.slice(0, MAX_CLANS).map((g) => ({
    label: g.label, sessions: g.sessions, present: g.present, excused: g.excused, absent: g.absent,
    top: topAttendanceKey(g),
  }));
  const subtitle = rows.length > MAX_CLANS
    ? `Marked attendance per clan · top ${MAX_CLANS} of ${rows.length} clans by sessions`
    : 'Marked attendance per clan across the sessions in view';

  return (
    <ReviewCard title="Attendance by clan" subtitle={subtitle} action={<AttendanceLegend />}>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No records for this filter yet.</p>
      ) : (
        <ChartContainer config={{}} className="aspect-auto h-64 w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tickFormatter={shorten} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
            <ChartTooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as ClanDatum;
                return <AttendanceTooltip title={d.label} values={d} footer={`${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}`} />;
              }}
            />
            {ATTENDANCE_SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="attendance"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={28}
                isAnimationActive={false}
                shape={(props: unknown) => {
                  const p = props as RectangleProps & { payload: ClanDatum };
                  return <Rectangle {...p} radius={p.payload.top === s.key ? [4, 4, 0, 0] : 0} />;
                }}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </ReviewCard>
  );
}
