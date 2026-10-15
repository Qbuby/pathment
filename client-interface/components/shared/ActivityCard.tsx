'use client';

import { useState, useEffect } from 'react';
import type { DailySession, ActivitySummary, RecentEvent } from '@/lib/types/activity';
import { Clock, Flame, BarChart2, CalendarCheck, Briefcase, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/shared/LoadingSpinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function eventLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Mini bar chart ────────────────────────────────────────────────────────────

function DailyBars({ sessions }: { sessions: DailySession[] }) {
  if (!sessions.length) return null;
  const maxMins = Math.max(...sessions.map((s) => s.activeMinutes || 0), 1);

  return (
    <div className="flex items-end gap-1 h-12">
      {sessions.map((s) => {
        const pct = Math.round(((s.activeMinutes || 0) / maxMins) * 100);
        const label = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short',
        });
        return (
          <div key={s.date} className="flex flex-col items-center gap-1 flex-1 group">
            <div className="relative w-full flex justify-center">
              {/* Tooltip */}
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1e293b] text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {fmt(s.activeMinutes || 0)}
              </span>
              <div
                className="w-full rounded-t-sm bg-brand-500 transition-all"
                style={{ height: `${Math.max(pct, 2)}%`, minHeight: '2px', maxHeight: '100%' }}
              />
            </div>
            <span className="text-[10px] text-slate-400">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat pill ─────────────────────────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ActivityCardProps {
  summary: ActivitySummary | null;
  dailySessions: DailySession[];
  recentEvents?: RecentEvent[];
  loading: boolean;
  days: number;
  onDaysChange: (d: number) => void;
  onRefresh?: () => void;
  /** compact=true renders a narrower version for sidebars */
  compact?: boolean;
}

export function ActivityCard({
  summary,
  dailySessions,
  recentEvents = [],
  loading,
  days,
  onDaysChange,
  onRefresh,
  compact = false,
}: ActivityCardProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    if (!loading) setLastUpdated(new Date());
  }, [loading]);

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                days === d
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {d}d
            </button>
          ))}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh activity"
              className="ml-1 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            <Stat
              icon={Briefcase}
              label="Work logged"
              value={
                (summary?.totalWorkHours ?? 0) > 0
                  ? `${summary!.totalWorkHours}h`
                  : '-'
              }
              color="bg-violet-50 text-violet-600"
            />
            <Stat
              icon={Clock}
              label="Platform time"
              value={fmt(summary?.todayActiveMinutes ?? 0)}
              color="bg-brand-50 text-brand-600"
            />
            <Stat
              icon={CalendarCheck}
              label="Active days"
              value={`${summary?.activeDays ?? 0} / ${days}`}
              color="bg-emerald-50 text-emerald-600"
            />
            <Stat
              icon={Flame}
              label="Streak"
              value={`${summary?.currentStreak ?? 0}d`}
              color="bg-orange-50 text-orange-600"
            />
          </div>

          {/* Bar chart */}
          {dailySessions.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2">Daily active time</p>
              <DailyBars sessions={dailySessions} />
            </div>
          )}

          {/* Recent events */}
          {!compact && recentEvents.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2">Recent activity</p>
              <ul className="space-y-1.5">
                {recentEvents.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                    <span>{eventLabel(e.eventType)}</span>
                    <span className="ml-auto text-slate-400">
                      {new Date(e.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {!dailySessions.length && (
            <p className="text-xs text-slate-400 text-center py-4">
              No activity recorded yet for this period.
            </p>
          )}
        </>
      )}
    </div>
  );
}
