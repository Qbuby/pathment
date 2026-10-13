'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Video, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import {
  ReviewKpis, AttendanceByClanChart, AttendanceBreakdownChart, AttendanceTrendChart,
  TopClansList, MentorPerformanceTable, ReviewInsights, SessionsPanel, fmtDate, fmtMin,
  type SessionRow, type GroupRow, type Summary,
} from '@/components/admin/review-records';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { adminApi } from '@/lib/services/admin-api';
import { clanApi } from '@/lib/services/clan-api';
import { mentorApi } from '@/lib/services/mentor-api';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function AdminReviewRecords() {
  const [clans, setClans] = useState<{ id: string; name: string; programId: string | null; programName: string | null; programStatus: string | null }[]>([]);
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
    clanApi.list().then((r: any) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name, programId: c.programId ?? c.program?.id ?? null, programName: c.program?.name ?? null, programStatus: c.program?.status ?? null })))).catch(() => setClans([]));
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

  // Programs come from the clan list — every review session belongs to a clan.
  const programOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of clans) {
      if (!c.programId || seen.has(c.programId)) continue;
      const status = c.programStatus === 'completed' ? 'Completed' : c.programStatus === 'published' ? 'Live' : c.programStatus;
      seen.set(c.programId, `${c.programName || 'Program'}${status ? ` · ${status}` : ''}`);
    }
    return [{ value: '', label: 'All programs' }, ...[...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];
  }, [clans]);
  const clanOptions = useMemo(() => [{ value: '', label: 'All clans' }, ...clans.filter((c) => !programId || c.programId === programId).map((c) => ({ value: c.id, label: c.name }))], [clans, programId]);
  // A clan picked under another program can't stay selected when the program changes.
  const changeProgram = (id: string) => {
    setProgramId(id);
    if (id && clanId && clans.find((c) => c.id === clanId)?.programId !== id) setClanId('');
  };
  const mentorOptions = useMemo(() => [{ value: '', label: 'All mentors' }, ...mentors.map((m) => ({ value: m.id, label: m.name }))], [mentors]);
  const hasFilters = programId || clanId || mentorId || from || to;
  // Roster entries across the sessions in view, and how many have no attendance marked.
  const totalEntries = useMemo(() => sessions.reduce((sum, s) => sum + s.total, 0), [sessions]);
  const unmarked = Math.max(0, totalEntries - (summary?.marked ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader title="Review records" subtitle="Cohort-review attendance and participation across the org — clan-wise and mentor-wise" />

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label className="block text-xs font-medium text-slate-600 mb-1">Clan</label>
          <SelectMenu value={clanId} onChange={setClanId} options={clanOptions} ariaLabel="Filter by clan" />
        </div>
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
          <button onClick={() => { setProgramId(''); setClanId(''); setMentorId(''); setFrom(''); setTo(''); }} className="px-3 py-2 rounded-lg text-slate-500 text-sm hover:bg-slate-50 inline-flex items-center gap-1"><X className="w-4 h-4" />Clear</button>
        )}
        <div className="w-64 max-w-full ml-auto">
          <label className="block text-xs font-medium text-slate-600 mb-1">Program</label>
          <SelectMenu value={programId} onChange={changeProgram} options={programOptions} ariaLabel="Filter by program" />
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
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 min-w-0"><MentorPerformanceTable rows={byMentor} sessions={sessions} /></div>
            <ReviewInsights summary={summary} byClan={byClan} sessions={sessions} unmarked={unmarked} />
          </div>

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
