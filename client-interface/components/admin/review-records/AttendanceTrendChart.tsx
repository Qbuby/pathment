'use client';

import { useMemo } from 'react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ReviewCard, AttendanceTooltip } from './ReviewCard';
import { ATTENDANCE_SERIES, buildTrend, fmtShortDate, type SessionRow, type TrendPoint } from './review-records-constants';

const PRESENT_COLOR = ATTENDANCE_SERIES[0].color;

/** Attendance rate over time — one line, so "is it getting better?" reads at a glance. */
export function AttendanceTrendChart({ sessions }: { sessions: SessionRow[] }) {
  const { weekly, points } = useMemo(() => buildTrend(sessions), [sessions]);
  // A lone point (or a handful) has no visible line to follow — show the dots.
  const showDots = points.length <= 16;
  return (
    <ReviewCard
      title="Attendance trend"
      subtitle={`Share of marked mentees who were present, ${weekly ? 'per week' : 'per session day'}`}
    >
      <ChartContainer config={{}} className="aspect-auto h-64 w-full">
        <AreaChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={fmtShortDate} minTickGap={24} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as TrendPoint;
              const sessionsLabel = `${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}`;
              return (
                <AttendanceTooltip
                  title={weekly ? `Week of ${fmtShortDate(d.date)}` : fmtShortDate(d.date)}
                  values={d}
                  footer={d.rate != null ? `${d.rate}% present · ${sessionsLabel}` : sessionsLabel}
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="rate"
            name="Attendance rate"
            stroke={PRESENT_COLOR}
            strokeWidth={2}
            fill={PRESENT_COLOR}
            fillOpacity={0.1}
            connectNulls
            dot={showDots ? { r: 3, fill: PRESENT_COLOR, stroke: 'var(--card)', strokeWidth: 2, fillOpacity: 1 } : false}
            activeDot={{ r: 4, fill: PRESENT_COLOR, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </ReviewCard>
  );
}
