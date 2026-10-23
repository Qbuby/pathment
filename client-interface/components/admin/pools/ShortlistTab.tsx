'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, History, Info, ListChecks, ListOrdered, Loader2, Lock, Sparkles } from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { AvatarWithInitials } from '@/components/admin/ui';
import { poolApi, type Blocker, type PoolDashboard, type ScoredWork, type Shortlist } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, DECISION, EmptyState, PanelHeader, Spinner, field, nameParts, panel, primaryBtn, pts } from './poolUi';

/** Why a piece of work earned less than it is worth, in a cell's worth of words. */
const WORK_CELL: Record<ScoredWork['status'], { label: string; cls: string }> = {
  scored: { label: '', cls: 'text-slate-900' },
  pending_review: { label: 'awaiting review', cls: 'text-amber-600' },
  changes_requested: { label: 'changes requested', cls: 'text-rose-600' },
  missing: { label: 'not handed in', cls: 'text-slate-400' },
  not_assigned: { label: 'never given', cls: 'text-slate-400' },
  no_work: { label: 'no work', cls: 'text-slate-400' },
};

function Notices({ items }: { items: Blocker[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((b) => (
        <li key={`${b.code}-${b.message}`} className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${b.severity === 'warn' ? 'border-border bg-muted/60 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {b.severity === 'warn' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{b.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Rank number; the top three get the brand tint. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${rank <= 3 ? 'bg-brand-600 text-white' : 'bg-muted text-slate-600'}`}>
      {rank}
    </span>
  );
}

function WorkCell({ c }: { c: ScoredWork }) {
  const s = WORK_CELL[c.status];
  return (
    <td className="text-right tabular-nums">
      <span className={s.cls}>
        {c.status === 'scored' ? c.earned : '—'}
        {c.status === 'scored' && <span className="text-[10px] text-slate-400">/{c.points}</span>}
      </span>
      {s.label && <p className="text-[10px] text-slate-400">{s.label}</p>}
    </td>
  );
}

function ShortlistView({ poolId, shortlist, canSelect, onDone }: { poolId: string; shortlist: Shortlist; canSelect: boolean; onDone: () => void }) {
  const confirm = useConfirm();
  const [overrides, setOverrides] = useState<Record<string, { outcome: string; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const tie = shortlist.blockers.find((b) => b.code === 'tie_at_cutoff');
  const hard = shortlist.blockers.filter((b) => b.severity === 'block' && b.code !== 'tie_at_cutoff');
  const editable = canSelect && ['draft', 'blocked'].includes(shortlist.status) && !hard.length;
  const entries = useMemo(() => shortlist.entries || [], [shortlist.entries]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { selected: 0, waitlisted: 0, not_selected: 0 };
    for (const e of entries) c[(overrides[e.poolMemberId]?.outcome || e.finalOutcome || e.proposedOutcome)] += 1;
    return c;
  }, [entries, overrides]);

  const doConfirm = async () => {
    const list = Object.entries(overrides).map(([memberId, o]) => ({ memberId, outcome: o.outcome, reason: o.reason.trim() }));
    const missingReason = list.some((o) => {
      const e = entries.find((x) => x.poolMemberId === o.memberId);
      return (o.outcome !== e?.proposedOutcome || tie?.memberIds?.includes(o.memberId)) && !o.reason;
    });
    if (missingReason) return toast.error('Every change, and every tied candidate, needs a reason');
    const ok = await confirm({
      title: `Confirm shortlist v${shortlist.version}?`,
      description: `${counts.selected} selected · ${counts.waitlisted} waitlisted · ${counts.not_selected} not selected. Candidates are told their outcome. Decisions can be changed one at a time afterwards, always with a reason.`,
      confirmLabel: 'Confirm selection',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await poolApi.confirm(poolId, shortlist.id, list);
      toast.success('Selection confirmed');
      onDone();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not confirm the selection'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 rounded-xl bg-brand-50 p-2 text-brand-600"><ListChecks className="h-4 w-4" aria-hidden="true" /></span>
          <div>
            <h2 className="text-base text-slate-900">Shortlist v{shortlist.version}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Quota {shortlist.quota}
              {shortlist.possible ? <> · out of {pts(shortlist.possible)}</> : null}
              {' · '}generated {new Date(shortlist.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip cls={shortlist.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : shortlist.status === 'blocked' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
            {shortlist.status === 'draft' ? 'Ready to confirm' : shortlist.status}
          </Chip>
          {editable && (
            <button onClick={doConfirm} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm selection
            </button>
          )}
        </div>
      </div>
      {shortlist.blockers.length > 0 && <div className="space-y-2 px-5 pb-4 sm:px-6"><Notices items={shortlist.blockers} /></div>}
      {tie && editable && <p className="px-5 pb-4 text-sm font-medium text-amber-800 sm:px-6">Decide each tied candidate below, with a reason.</p>}
      <div className="overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Candidate</th>
              <th className="text-right">Total</th>
              <th>Proposed</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const name = e.member?.user ? `${e.member.user.firstName} ${e.member.user.lastName}` : [e.member?.firstName, e.member?.lastName].filter(Boolean).join(' ') || e.member?.email;
              const o = overrides[e.poolMemberId];
              const tied = tie?.memberIds?.includes(e.poolMemberId);
              const outcome = o?.outcome || e.finalOutcome || e.proposedOutcome;
              return (
                <tr key={e.id} className={tied ? 'bg-amber-50/60' : ''}>
                  <td><RankBadge rank={e.rank} /></td>
                  <td>
                    <AvatarWithInitials {...nameParts(name, e.member?.email)} size="sm" colorClass="bg-brand-100 text-brand-700" />
                    {!e.complete && <p className="mt-1 pl-9 text-xs text-amber-700">Incomplete work</p>}
                  </td>
                  <td className="text-right font-semibold text-slate-900 tabular-nums">
                    {Number(e.totalScore)}
                    {(e.possible ?? shortlist.possible) ? <span className="text-[11px] font-normal text-slate-400">/{e.possible ?? shortlist.possible}</span> : null}
                  </td>
                  <td><Chip cls={DECISION[e.proposedOutcome]?.cls || ''}>{DECISION[e.proposedOutcome]?.label}</Chip>{tied && <span className="ml-2 text-xs text-amber-700">tied</span>}</td>
                  <td>
                    {editable ? (
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <select
                          value={outcome}
                          onChange={(ev) => setOverrides((prev) => ({ ...prev, [e.poolMemberId]: { outcome: ev.target.value, reason: prev[e.poolMemberId]?.reason || '' } }))}
                          className={`${field} w-36`}
                        >
                          <option value="selected">Selected</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="not_selected">Not selected</option>
                        </select>
                        {(o || tied) && (
                          <input
                            value={o?.reason || ''}
                            placeholder="Reason"
                            onChange={(ev) => setOverrides((prev) => ({ ...prev, [e.poolMemberId]: { outcome: prev[e.poolMemberId]?.outcome || outcome, reason: ev.target.value } }))}
                            className={`${field} min-w-40`}
                          />
                        )}
                      </div>
                    ) : (
                      <span>
                        <Chip cls={DECISION[outcome]?.cls || ''}>{DECISION[outcome]?.label}</Chip>
                        {e.overrideReason && <span className="ml-2 text-xs text-slate-500">“{e.overrideReason}”</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 text-xs sm:px-6">
          <Chip cls={DECISION.selected.cls}>{counts.selected} selected</Chip>
          <Chip cls={DECISION.waitlisted.cls}>{counts.waitlisted} waitlisted</Chip>
          <Chip cls={DECISION.not_selected.cls}>{counts.not_selected} not selected</Chip>
        </div>
      )}
    </section>
  );
}

export function ShortlistTab({ data, onChange, canSelect }: { data: PoolDashboard; onChange: () => void; canSelect: boolean }) {
  const { pool } = data;
  const scores = useApiQuery({ queryKey: qk.pool.scores(pool.id), queryFn: () => poolApi.scores(pool.id) });
  const lists = useApiQuery({ queryKey: [...qk.pool.detail(pool.id), 'shortlists'], queryFn: () => poolApi.shortlists(pool.id) });
  const current = (lists.data || []).find((s) => s.status !== 'superseded');
  const shortlist = useApiQuery({
    queryKey: [...qk.pool.detail(pool.id), 'shortlist', current?.id || 'none'],
    queryFn: () => poolApi.shortlist(pool.id, current!.id),
    enabled: Boolean(current),
  });
  const [generating, setGenerating] = useState(false);
  const confirmed = (lists.data || []).some((s) => s.status === 'confirmed');

  const refresh = async () => {
    await Promise.all([scores.refetch(), lists.refetch(), shortlist.refetch()]);
    onChange();
  };
  const generate = async () => {
    setGenerating(true);
    try {
      const out = await poolApi.generateShortlist(pool.id);
      toast.success(out.reused ? 'Nothing changed since the last shortlist' : `Shortlist v${out.shortlist.version} generated`);
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not generate the shortlist'));
    } finally {
      setGenerating(false);
    }
  };

  const work = scores.data?.work || [];
  const possible = scores.data?.possible ?? 0;

  // Nothing to rank on is a different problem from nothing being scored yet,
  // and it is fixed on a different tab, so it says so rather than showing an
  // empty table.
  if (!scores.loading && !work.length) {
    return (
      <section className={panel}>
        <EmptyState
          icon={ClipboardList}
          title="No qualifying work yet"
          text="A score is the points a candidate earned, so there is nothing to rank until this pool has work. Add it on the Work tab."
        />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className={panel}>
        <PanelHeader
          icon={ListOrdered}
          title="Live scores"
          subtitle={possible
            ? `Ranked on points earned from reviewed work. A perfect round is worth ${pts(possible)}.`
            : 'Ranked on points earned from reviewed work.'}
          actions={<>
            {canSelect && !confirmed && pool.status !== 'closed' && (
              <button onClick={generate} disabled={generating} className={primaryBtn}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate shortlist
              </button>
            )}
            {confirmed && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700"><Lock className="h-4 w-4" /> Selection confirmed</span>}
          </>}
        />
        <div className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
          {work.map((w) => (
            <span key={w.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-slate-700">
              {w.label}
              {!w.required && <span className="text-slate-400">optional</span>}
            </span>
          ))}
        </div>
        {scores.loading && <Spinner />}
        {scores.data && (
          <>
            <div className="space-y-2 px-5 pb-4 empty:hidden sm:px-6"><Notices items={[...scores.data.blockers.map((b) => ({ ...b, severity: 'block' as const })), ...scores.data.warnings.map((w) => ({ ...w, severity: 'warn' as const }))]} /></div>
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Candidate</th>
                    {work.map((w) => <th key={w.key} className="text-right">{w.label}</th>)}
                    <th className="text-right">Adjust.</th>
                    <th className="text-right">Total</th>
                    <th>Would be</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.data.rows.map((r) => (
                    <tr key={r.memberId}>
                      <td><RankBadge rank={r.rank} /></td>
                      <td><AvatarWithInitials {...nameParts(r.name, r.email)} size="sm" colorClass="bg-brand-100 text-brand-700" /></td>
                      {r.components.map((c) => <WorkCell key={c.key} c={c} />)}
                      <td className="text-right tabular-nums">
                        {r.adjustment
                          ? <span title={r.adjustmentNote || undefined} className={r.adjustment > 0 ? 'text-emerald-700' : 'text-rose-700'}>{r.adjustment > 0 ? '+' : ''}{r.adjustment}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-right font-semibold text-slate-900 tabular-nums">
                        {r.total} <span className="text-[11px] font-normal text-slate-400">/{r.possible}</span>
                      </td>
                      <td>{r.proposedOutcome ? <Chip cls={DECISION[r.proposedOutcome]?.cls || ''}>{DECISION[r.proposedOutcome]?.label}</Chip> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                  {!scores.data.rows.length && <tr><td colSpan={work.length + 5} className="text-center text-muted-foreground">No candidates to score yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {shortlist.data && <ShortlistView poolId={pool.id} shortlist={shortlist.data} canSelect={canSelect} onDone={refresh} />}

      {(lists.data || []).length > 1 && (
        <section className={panel}>
          <PanelHeader icon={History} title="Earlier versions" />
          <ul className="divide-y divide-border border-t border-border text-sm">
            {(lists.data || []).filter((s) => s.id !== current?.id).map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-slate-600 sm:px-6">
                <span><span className="font-medium text-slate-900">v{s.version}</span> · {new Date(s.createdAt).toLocaleString()}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">{s.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!canSelect && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> Only people who can select candidates may generate and confirm a shortlist.</p>}
    </div>
  );
}
