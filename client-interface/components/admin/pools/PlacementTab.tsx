'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Save, ShieldCheck, Target, Users, UsersRound, Waypoints, XCircle } from 'lucide-react';
import { AvatarWithInitials, StatsCard } from '@/components/admin/ui';
import { useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolApi, type PoolDashboard } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { EmptyState, ErrorNote, PanelHeader, Spinner, card, field, nameParts, panel, primaryBtn, secondaryBtn } from './poolUi';

export function PlacementTab({ data, onChange }: { data: PoolDashboard; onChange: () => void }) {
  const { pool, members } = data;
  const confirm = useConfirm();
  const { data: preview, loading, error, refetch } = useApiQuery({ queryKey: ['pools', pool.id, 'placement'], queryFn: () => poolApi.placementPreview(pool.id) });
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const placed = members.filter((m) => m.placementStatus === 'placed');
  const failed = members.filter((m) => m.placementStatus === 'failed');

  useEffect(() => {
    if (!preview) return;
    setPlan(Object.fromEntries(preview.rows.map((r) => [r.memberId, r.proposedClanId || ''])));
  }, [preview]);

  const refresh = async () => { await refetch(); onChange(); };
  const dirty = preview?.rows.some((r) => (plan[r.memberId] || '') !== (r.currentClanId || ''));

  const save = async () => {
    setSaving(true);
    try {
      await poolApi.setTargets(pool.id, Object.entries(plan).map(([memberId, clanId]) => ({ memberId, clanId: clanId || null })));
      toast.success('Placement plan saved');
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save the plan'));
    } finally {
      setSaving(false);
    }
  };

  const place = async (memberIds?: string[]) => {
    const n = memberIds ? memberIds.length : preview?.rows.length || 0;
    const ok = await confirm({
      title: `Place ${n} candidate${n === 1 ? '' : 's'}?`,
      description: 'Each gets an enrollment and a clan membership in the planned clan; the clan\'s mentors are told. A full clan or a clan without a lead mentor fails that person only — fix it and retry.',
      confirmLabel: 'Place',
    });
    if (!ok) return;
    setPlacing(true);
    try {
      if (dirty) await poolApi.setTargets(pool.id, Object.entries(plan).map(([memberId, clanId]) => ({ memberId, clanId: clanId || null })));
      const out = await poolApi.place(pool.id, memberIds);
      const s = out.summary;
      if (s.failed) toast.warning(`${s.placed} placed, ${s.failed} failed — see the reasons below`);
      else toast.success(`${s.placed} placed`);
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not run the placement'));
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <Spinner />;
  if (error || !preview) return <ErrorNote>{error || 'Could not load the placement plan'}</ErrorNote>;
  const selected = members.filter((m) => m.decision === 'selected').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard icon={Target} label="Selected" value={selected} sub="From the confirmed shortlist" />
        <StatsCard icon={CheckCircle2} label="Placed" value={placed.length} sub="Enrolled and seated in a clan" colorClass="text-emerald-600 bg-emerald-50" />
        <StatsCard icon={XCircle} label="Failed" value={failed.length} sub="Retry after fixing the reason" colorClass={failed.length ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-muted'} />
      </div>

      {preview.insufficientCapacity && (
        <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> The clans do not have enough room for everyone selected. Raise a clan&apos;s capacity or add a clan.
        </p>
      )}

      <section className={panel}>
        <PanelHeader icon={UsersRound} title="Clans" count={preview.clans.length} subtitle="Seats already taken and seats planned for this round." />
        <div className="grid gap-3 px-5 pb-5 empty:hidden sm:grid-cols-2 sm:px-6 sm:pb-6 lg:grid-cols-3">
          {preview.clans.map((c) => {
            const total = c.fill + c.planned;
            return (
              <div key={c.id} className={`${card} p-4 ${c.problem ? 'border-amber-300 bg-amber-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">{c.cap ? `${total}/${c.cap}` : `${total} · no limit`}</span>
                </div>
                {c.cap && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="flex h-full">
                      <div className="bg-slate-400" style={{ width: `${Math.min(100, (c.fill / c.cap) * 100)}%` }} />
                      <div className="bg-brand-500" style={{ width: `${Math.min(100, (c.planned / c.cap) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5" /> {c.lead ? `Lead: ${c.lead.name}` : 'No lead mentor'}{c.coMentorCount ? ` · ${c.coMentorCount} co-mentor${c.coMentorCount === 1 ? '' : 's'}` : ''}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> {c.fill} seated · {c.planned} planned</p>
                {c.problem && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {c.problem}</p>}
              </div>
            );
          })}
        </div>
        {!preview.clans.length && <div className="border-t border-border"><EmptyState icon={UsersRound} title="No open clans" text="This programme has no open clans. Create one, or choose target clans in Settings." /></div>}
      </section>

      <section className={panel}>
        <PanelHeader
          icon={Waypoints}
          title="To place"
          count={preview.rows.length}
          subtitle="Choose a clan for each selected candidate, then place them."
          actions={<>
            {dirty && <button onClick={save} disabled={saving} className={secondaryBtn}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save plan</button>}
            {failed.length > 0 && <button onClick={() => place(failed.map((m) => m.id))} disabled={placing} className={secondaryBtn}><RotateCcw className="h-4 w-4" /> Retry failed</button>}
            {preview.rows.length > 0 && (
              <button onClick={() => place()} disabled={placing} className={primaryBtn}>
                {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Place everyone
              </button>
            )}
          </>}
        />
        {!preview.rows.length ? (
          <div className="border-t border-border">
            <EmptyState
              icon={selected ? CheckCircle2 : Target}
              title={selected ? 'Everyone selected has been placed' : 'Nobody is selected yet'}
              text={selected ? undefined : 'Confirm a shortlist on the Scores & shortlist tab first.'}
            />
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr><th>Candidate</th><th>Clan</th><th>Note</th></tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.memberId}>
                <td><AvatarWithInitials {...nameParts(r.name, r.email)} email={r.email} colorClass="bg-brand-100 text-brand-700" /></td>
                <td>
                  <select value={plan[r.memberId] || ''} onChange={(e) => setPlan((p) => ({ ...p, [r.memberId]: e.target.value }))} className={`${field} min-w-44`}>
                    <option value="">Not planned</option>
                    {preview.clans.map((c) => <option key={c.id} value={c.id} disabled={Boolean(c.problem)}>{c.name}{c.problem ? ` (${c.problem})` : ''}</option>)}
                  </select>
                </td>
                <td className="text-xs">
                  {r.placementStatus === 'failed' ? <span className="text-rose-600">{r.placementError}</span> : <span className="text-slate-500">{r.reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </section>

      {placed.length > 0 && (
        <section className={panel}>
          <PanelHeader icon={CheckCircle2} title="Placed" count={placed.length} />
          <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6 lg:grid-cols-3">
            {placed.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
                <AvatarWithInitials {...nameParts(m.name, m.email)} size="sm" colorClass="bg-emerald-100 text-emerald-700" />
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{m.placedClan?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
