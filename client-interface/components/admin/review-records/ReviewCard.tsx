import React from 'react';
import { ATTENDANCE_SERIES } from './review-records-constants';

interface ReviewCardProps {
  title: string;
  subtitle?: string;
  /** Right-side slot — a legend, a sort control or a link */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Card shell shared by every panel on the Review records page. */
export function ReviewCard({ title, subtitle, action, className = '', children }: ReviewCardProps) {
  return (
    <section className={`h-full min-w-0 bg-card rounded-2xl border border-slate-200 p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Present / Excused / Absent colour key. */
export function AttendanceLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {ATTENDANCE_SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

interface AttendanceTooltipProps {
  title: string;
  values: { present: number; excused: number; absent: number };
  /** Extra line under the totals, e.g. "4 sessions" */
  footer?: string;
}

/** Tooltip body shared by the attendance charts. */
export function AttendanceTooltip({ title, values, footer }: AttendanceTooltipProps) {
  const total = values.present + values.excused + values.absent;
  return (
    <div className="min-w-[9rem] rounded-lg border border-slate-200 bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-slate-900 mb-1.5">{title}</div>
      <ul className="space-y-1">
        {ATTENDANCE_SERIES.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-slate-900 tabular-nums">{values[s.key]}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
          <span className="text-slate-500">Total marked</span>
          <span className="font-medium text-slate-900 tabular-nums">{total}</span>
        </li>
      </ul>
      {footer && <div className="mt-1.5 text-slate-400">{footer}</div>}
    </div>
  );
}
