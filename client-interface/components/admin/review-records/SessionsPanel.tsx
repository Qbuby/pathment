'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, CartesianGrid, Rectangle, XAxis, YAxis, type RectangleProps } from 'recharts';
import { CheckCircle2, ChevronRight, Video } from 'lucide-react';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { TabBar } from '@/components/admin/ui';
import { Avatar } from '@/components/shared/Avatar';
import { ReviewCard, AttendanceLegend, AttendanceTooltip } from './ReviewCard';
import {
  ATTENDANCE_SERIES, fmtDate, fmtShortDate, pct, topAttendanceKey,
  type AttendanceKey, type SessionRow,
} from './review-records-constants';

const PAGE_SIZE = 10;
/** Bars stay readable up to about this many sessions; older ones live in the list. */
const CHART_MAX = 30;
/** Below this attendance rate a session is flagged as low. */
const LOW_RATE = 75;

type SessionFilter = 'all' | 'low' | 'in_progress' | 'video';

const markedOf = (s: SessionRow) => s.present + s.excused + s.absent;
const isLow = (s: SessionRow) => markedOf(s) > 0 && pct(s.present, markedOf(s)) < LOW_RATE;

const MATCHES: Record<SessionFilter, (s: SessionRow) => boolean> = {
  all: () => true,
  low: isLow,
  in_progress: (s) => s.status === 'in_progress',
  video: (s) => s.hadVideo,
};

interface ChartDatum {
  id: string; date: string; clan: string; mentor: string;
  /** Raw counts, shown in the tooltip. */
  counts: { present: number; excused: number; absent: number };
  /** Share of marked attendance, 0–100 — what the bars plot. */
  present: number; excused: number; absent: number;
  top: AttendanceKey | null;
}

function SplitBar({ s }: { s: SessionRow }) {
  const marked = markedOf(s);
  return (
    <div className="flex h-2 w-28 gap-0.5 rounded-full overflow-hidden bg-slate-100" aria-hidden="true">
      {marked > 0 && ATTENDANCE_SERIES.map((a) => s[a.key] > 0 && (
        <div key={a.key} style={{ width: `${(s[a.key] / marked) * 100}%`, backgroundColor: a.color }} />
      ))}
    </div>
  );
}

interface SessionsPanelProps {
  sessions: SessionRow[];
  /** Opens the session detail drawer. */
  onOpen: (id: string) => void;
}

/** Every review session in view: an attendance chart plus a filterable list. */
export function SessionsPanel({ sessions, onOpen }: SessionsPanelProps) {
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [page, setPage] = useState(1);

  const tabs = useMemo(() => [
    { id: 'all', label: 'All', count: sessions.length },
    { id: 'low', label: 'Low attendance', count: sessions.filter(MATCHES.low).length },
    { id: 'in_progress', label: 'In progress', count: sessions.filter(MATCHES.in_progress).length },
    { id: 'video', label: 'Live video', count: sessions.filter(MATCHES.video).length },
  ], [sessions]);

  const filtered = useMemo(() => sessions.filter(MATCHES[filter]), [sessions, filter]);

  // `sessions` arrives newest first; the chart reads oldest → newest.
  const chartData: ChartDatum[] = useMemo(() => filtered.slice(0, CHART_MAX).reverse().map((s) => {
    const marked = markedOf(s);
    const counts = { present: s.present, excused: s.excused, absent: s.absent };
    return {
      id: s.id, date: s.sessionDate, clan: s.clanName || 'Unassigned', mentor: s.mentorName || 'Unknown', counts,
      present: marked ? (s.present / marked) * 100 : 0,
      excused: marked ? (s.excused / marked) * 100 : 0,
      absent: marked ? (s.absent / marked) * 100 : 0,
      top: topAttendanceKey(counts),
    };
  }), [filtered]);
  const dateById = useMemo(() => new Map(chartData.map((d) => [d.id, d.date])), [chartData]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <ReviewCard
      title={`Sessions (${sessions.length})`}
      subtitle="Each bar is one review session — how its marked attendance split. Click a bar or a row to open the session."
      action={<AttendanceLegend />}
    >
      <TabBar
        variant="pill"
        tabs={tabs}
        activeTab={filter}
        onChange={(id) => { setFilter(id as SessionFilter); setPage(1); }}
        className="mb-4"
      />

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No sessions match this filter.</p>
      ) : (
        <>
          <ChartContainer config={{}} className="aspect-auto h-56 w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="id" tickLine={false} axisLine={false} minTickGap={16} tick={{ fontSize: 11 }} tickFormatter={(id: string) => fmtShortDate(dateById.get(id) || '')} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <ChartTooltip
                cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as ChartDatum;
                  return <AttendanceTooltip title={`${d.clan} · ${fmtShortDate(d.date)}`} values={d.counts} footer={`${d.mentor} · click to open`} />;
                }}
              />
              {ATTENDANCE_SERIES.map((a) => (
                <Bar
                  key={a.key}
                  dataKey={a.key}
                  name={a.label}
                  stackId="attendance"
                  fill={a.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                  maxBarSize={22}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(d: { id?: string; payload?: ChartDatum }) => { const id = d?.payload?.id ?? d?.id; if (id) onOpen(id); }}
                  shape={(props: unknown) => {
                    const p = props as RectangleProps & { payload: ChartDatum };
                    return <Rectangle {...p} radius={p.payload.top === a.key ? [4, 4, 0, 0] : 0} />;
                  }}
                />
              ))}
            </BarChart>
          </ChartContainer>
          {filtered.length > CHART_MAX && (
            <p className="mt-2 text-xs text-slate-400">Chart shows the {CHART_MAX} most recent of {filtered.length} sessions — the list below has them all.</p>
          )}

          <div className="overflow-x-auto -mx-5 mt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-y border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Clan</th>
                  <th className="px-3 py-2 font-medium">Mentor</th>
                  <th className="px-3 py-2 font-medium">Attendance</th>
                  <th className="px-3 py-2 font-medium">Reviewed</th>
                  <th className="px-3 py-2 font-medium">Video</th>
                  <th className="px-5 py-2 font-medium"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const marked = markedOf(s);
                  const allReviewed = s.total > 0 && s.reviewed === s.total;
                  return (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => onOpen(s.id)}>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800">{fmtDate(s.sessionDate)}</span>
                          {s.status === 'in_progress' && <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1 py-0.5">in progress</span>}
                          {s.recurring && <span className="text-[10px] text-brand-600 bg-brand-50 rounded px-1 py-0.5">recurring</span>}
                        </div>
                        {s.title && <div className="text-xs text-slate-400 truncate max-w-[220px]">{s.title}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.clanName || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {s.mentorName
                          ? <span className="flex items-center gap-2 text-slate-600"><Avatar name={s.mentorName} size="xs" />{s.mentorName}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {marked > 0 ? (
                          <div className="flex items-center gap-3">
                            <SplitBar s={s} />
                            <div className="whitespace-nowrap">
                              <span className="font-medium text-slate-800 tabular-nums">{pct(s.present, marked)}%</span>
                              <span className="ml-1.5 text-xs text-slate-500">{s.present} of {marked} present</span>
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400">Not marked yet</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-600 tabular-nums">
                          {s.reviewed}/{s.total}
                          {allReviewed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-label="All mentees reviewed" />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {s.hadVideo ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Video className="w-3.5 h-3.5" />{s.durationMin != null ? `${s.durationMin}m` : 'yes'}</span> : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button onClick={(e) => { e.stopPropagation(); onOpen(s.id); }} className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline">
                          View<ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-slate-500">
            <p aria-live="polite">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} sessions · newest first</p>
            {pages > 1 && (
              <div className="flex items-center gap-3">
                <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                <span className="tabular-nums">{currentPage} / {pages}</span>
                <button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </ReviewCard>
  );
}
