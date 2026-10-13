'use client';

import { useMemo } from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ReviewCard, AttendanceLegend, AttendanceTooltip } from './ReviewCard';
import { ATTENDANCE_SERIES, buildTrend, fmtShortDate, type SessionRow, type TrendPoint } from './review-records-constants';

/** Present / excused / absent counts over time, from the sessions in view. */
export function AttendanceTrendChart({ sessions }: { sessions: SessionRow[] }) {
  const { weekly, points } = useMemo(() => buildTrend(sessions), [sessions]);
  // A lone point (or a handful) has no visible line to follow — show the dots.
  const showDots = points.length <= 12;

  return (
    <ReviewCard
      title="Attendance trend"
      subtitle={weekly ? 'Mentees present, excused and absent per week' : 'Mentees present, excused and absent per session day'}
      action={<AttendanceLegend />}
    >
      <ChartContainer config={{}} className="aspect-auto h-64 w-full">
        <LineChart data={points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={fmtShortDate} minTickGap={24} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11 }} />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as TrendPoint;
              return (
                <AttendanceTooltip
                  title={weekly ? `Week of ${fmtShortDate(d.date)}` : fmtShortDate(d.date)}
                  values={d}
                  footer={`${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}`}
                />
              );
            }}
          />
          {ATTENDANCE_SERIES.map((s) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={showDots ? { r: 3, fill: s.color, stroke: 'var(--card)', strokeWidth: 2 } : false}
              activeDot={{ r: 4, fill: s.color, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </ReviewCard>
  );
}
