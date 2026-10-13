/** Shared types, colours and formatters for the admin Review records page. */

export interface SessionRow {
  id: string; sessionDate: string; scheduledAt: string | null; title: string | null;
  status: string; recurring: boolean; clanId: string | null; clanName: string | null;
  mentorId: string | null; mentorName: string | null;
  present: number; absent: number; excused: number; reviewed: number; total: number;
  talkSeconds: number; hadVideo: boolean; durationMin: number | null;
}
export interface GroupRow {
  key: string; label: string; sessions: number; present: number; absent: number;
  excused: number; marked: number; talkSeconds: number; withVideo: number; attendanceRate: number;
}
export interface Summary {
  sessions: number; present: number; absent: number; excused: number; reviewed: number;
  marked: number; talkSeconds: number; withVideo: number; attendanceRate: number;
}

export type AttendanceKey = 'present' | 'excused' | 'absent';

/** Attendance states in stack order (bottom → top). Colours are fixed per state. */
export const ATTENDANCE_SERIES: { key: AttendanceKey; label: string; color: string }[] = [
  { key: 'present', label: 'Present', color: '#059669' },
  { key: 'excused', label: 'Excused', color: '#f59e0b' },
  { key: 'absent', label: 'Absent', color: '#ef4444' },
];

/** Topmost non-empty segment of a stacked attendance bar — the one that gets the rounded end. */
export const topAttendanceKey = (values: Record<AttendanceKey, number>): AttendanceKey | null =>
  [...ATTENDANCE_SERIES].reverse().find((s) => values[s.key] > 0)?.key ?? null;

export const fmtDate =(d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtShortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtMin = (secs: number) => {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Same thresholds the page has always used: ≥75 good, ≥50 watch, else low. */
export const rateTextClass = (rate: number) => (rate >= 75 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-500');
export const rateBarClass = (rate: number) => (rate >= 75 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400');

export interface TrendPoint {
  date: string; present: number; excused: number; absent: number; sessions: number;
  /** Present ÷ marked, 0–100; null when nothing was marked. */
  rate: number | null;
}

export const toDateKey = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const weekStart = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return toDateKey(dt);
};

/**
 * Attendance over time, oldest first. One point per session date; once the
 * range spans more than 10 distinct dates, points roll up per week (Monday) so
 * clans that meet on different weekdays don't make the line zigzag.
 */
export function buildTrend(sessions: SessionRow[]): { weekly: boolean; points: TrendPoint[] } {
  const weekly = new Set(sessions.map((s) => s.sessionDate)).size > 10;
  const map = new Map<string, TrendPoint>();
  for (const s of sessions) {
    const date = weekly ? weekStart(s.sessionDate) : s.sessionDate;
    if (!map.has(date)) map.set(date, { date, present: 0, excused: 0, absent: 0, sessions: 0, rate: null });
    const p = map.get(date)!;
    p.present += s.present; p.excused += s.excused; p.absent += s.absent; p.sessions += 1;
  }
  for (const p of map.values()) {
    const marked = p.present + p.excused + p.absent;
    p.rate = marked > 0 ? pct(p.present, marked) : null;
  }
  return { weekly, points: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
