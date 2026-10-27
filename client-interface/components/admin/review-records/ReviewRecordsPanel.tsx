'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Video, X } from 'lucide-react';
import {
  ReviewKpis, AttendanceByClanChart, AttendanceBreakdownChart, AttendanceTrendChart,
  TopClansList, MentorPerformanceTable, ReviewInsights, SessionsPanel, fmtDate, fmtMin, toDateKey,
  type SessionRow, type GroupRow, type Summary,
} from './index';
// Imports the leaf components through the barrel; the barrel deliberately does
// NOT re-export this panel, which would make that a cycle.
import { SelectMenu } from '@/components/shared/SelectMenu';
import { ProgramClanFilter } from '@/components/shared/ProgramClanFilter';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { adminApi } from '@/lib/services/admin-api';
import { mentorApi } from '@/lib/services/mentor-api';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Quick date ranges — `days` back from today; null clears the range. */
const RANGE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];
const presetFrom = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return toDateKey(d); };

/**
 * Cohort-review attendance and participation, clan-wise and mentor-wise.
 *
 * This was a page of its own under Insights, which put the org's review
 * history one tab away from the org's health summary — two halves of the
 * same question. It is a panel now, rendered inside Insights → Overview, and
 * the route it used to own redirects there.
 */
export function ReviewRecordsPanel() {
  const [mentors, setMentors] = useState<{ id: string; name: string }[]>([]);
  const [programId, setProgramId] = useState('');
  const [clanId, setClanId] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byClan, setByClan] = useState<GroupRow[]>([]);
  const [byMentor, setByMentor] = useState<GroupRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filter option lists.
  useEffect(() => {
    mentorApi.getAll().then((r: any) => {
      const list = (r.data?.mentors || r.data || []) as any[];
      setMentors(list.map((m) => ({ id: m.id, name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.name || m.email })));
    }).catch(() => setMentors([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await adminApi.reviewRecords.list({ programId: programId || undefined, clanId: clanId || undefined, mentorId: mentorId || undefined, from: from || undefined, to: to || undefined });
      const d = r?.data ?? {};
      setSummary(d.summary ?? null);
      setByClan(d.byClan ?? []);
      setByMentor(d.byMentor ?? []);
      setSessions(d.sessions ?? []);
    } catch {
      setSummary(null); setByClan([]); setByMentor([]); setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [programId, clanId, mentorId, from, to]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetail({ id }); setDetailLoading(true);
    try {
      const r: any = await adminApi.reviewRecords.detail(id);
      setDetail(r?.data?.session ?? null);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const mentorOptions = useMemo(() => [{ value: '', label: 'All mentors' }, ...mentors.map((m) => ({ value: m.id, label: m.name }))], [mentors]);
  const hasFilters = programId || clanId || mentorId || from || to;
  // Roster entries across the sessions in view, and how many have no attendance marked.
  const totalEntries = useMemo(() => sessions.reduce((sum, s) => sum + s.total, 0), [sessions]);
  const unmarked = Math.max(0, totalEntries - (summary?.marked ?? 0));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        {/* Programme then clan, from the one shared control. */}
        <ProgramClanFilter
          value={{ programId, clanId }}
          onChange={(next) => { setProgramId(next.programId); setClanId(next.clanId); }}
        />
        <div className="w-44">
          <label className="block text-xs font-medium text-slate-600 mb-1">Mentor</label>
          <SelectMenu value={mentorId} onChange={setMentorId} options={mentorOptions} ariaLabel="Filter by mentor" searchable />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        {hasFilters && (
          <button onClick={() => { setProgramId(''); setClanId(''); setMentorId(''); setFrom(''); setTo(''); }} className="ml-auto px-3 py-2 rounded-lg text-slate-500 text-sm hover:bg-slate-50 inline-flex items-center gap-1"><X className="w-4 h-4" />Clear</button>
        )}
        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick date range">
            {RANGE_PRESETS.map((p) => {
              const active = p.days == null ? !from && !to : !to && from === presetFrom(p.days);
              return (
                <button
                  key={p.label}
                  aria-pressed={active}
                  onClick={() => { setFrom(p.days == null ? '' : presetFrom(p.days)); setTo(''); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {!loading && summary && summary.sessions > 0 && (
            <p className="text-xs text-slate-500" aria-live="polite">
              Showing {summary.sessions.toLocaleString()} {summary.sessions === 1 ? 'session' : 'sessions'} · {byClan.length} {byClan.length === 1 ? 'clan' : 'clans'} · {byMentor.length} {byMentor.length === 1 ? 'mentor' : 'mentors'}
              {sessions.length > 0 && ` · ${fmtDate(sessions[sessions.length - 1].sessionDate)} – ${fmtDate(sessions[0].sessionDate)}`}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : !summary || summary.sessions === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600">No review records{hasFilters ? ' for these filters' : ' yet'}.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <ReviewKpis summary={summary} totalEntries={totalEntries} />

          {/* Takeaways first, detail below */}
          <ReviewInsights summary={summary} byClan={byClan} sessions={sessions} unmarked={unmarked} />

          {/* Clan-wise attendance */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 min-w-0"><AttendanceByClanChart rows={byClan} /></div>
            <AttendanceBreakdownChart summary={summary} unmarked={unmarked} />
          </div>

          {/* Trend + ranking */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 min-w-0"><AttendanceTrendChart sessions={sessions} /></div>
            <TopClansList rows={byClan} />
          </div>

          {/* Mentor-wise */}
          <MentorPerformanceTable rows={byMentor} sessions={sessions} />

          {/* Sessions */}
          <SessionsPanel sessions={sessions} onOpen={openDetail} />
        </>
      )}

      {/* Session detail */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width="md" title="Review session" subtitle={detail?.sessionDate ? `${detail.clanName || 'Clan'} · ${fmtDate(detail.sessionDate)}` : ''}>
        {detailLoading || !detail?.entries ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{detail.mentorName || 'Mentor'}</span>
              <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">{detail.present} present</span>
              <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700">{detail.absent} absent</span>
              <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">{detail.excused} excused</span>
              {detail.hadVideo && <span className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 inline-flex items-center gap-1"><Video className="w-3 h-3" />{detail.durationMin != null ? `${detail.durationMin}m` : 'live'}</span>}
            </div>
            {detail.note && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{detail.note}</p>}
            <ul className="divide-y divide-slate-100">
              {detail.entries.map((e: any) => (
                <li key={e.menteeId} className="py-2.5 flex items-center gap-3">
                  <Avatar name={e.menteeName} src={e.profilePictureUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{e.menteeName}</div>
                    <div className="text-xs text-slate-400">
                      {e.talkSeconds ? `${fmtMin(e.talkSeconds)} talk` : 'no talk time'}{e.contributionPoints ? ` · +${e.contributionPoints} pts` : ''}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    e.attendance === 'present' ? 'bg-emerald-50 text-emerald-700'
                      : e.attendance === 'absent' ? 'bg-red-50 text-red-700'
                      : e.attendance === 'excused' ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>{e.attendance || 'unmarked'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  );
}
