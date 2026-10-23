'use client';

import { useState } from 'react';
import Link from 'next/link';
import { workspacePath } from '@/lib/services/workspace-scope';
import { toast } from 'sonner';
import { Check, Loader2, UsersRound } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { useApiQuery } from '@/lib/query';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { poolApi, type ImportResult } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, POOL_STATUS } from './poolUi';

/**
 * "Add to pool" for selected applicants on a cohort's Intake page.
 *
 * Applicants can join any open pool — one pool may gather people from several
 * cohorts, of several programmes. Nothing about their application changes: it
 * is not accepted, no programme invitation is sent,
 * no enrollment or clan membership is created — Accept & invite and clan
 * placement keep working exactly as before. People with an account in this
 * workspace join straight away; everyone else gets a pool invitation.
 */
export function AddToPoolButton({ programId, applicationIds, onDone }: { programId?: string; applicationIds: string[]; onDone?: () => void }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [poolId, setPoolId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { data: pools, loading } = useApiQuery({
    queryKey: ['pools', 'list'],
    queryFn: () => poolApi.list(),
    enabled: open,
  });

  if (!can('pool.members') || !applicationIds.length) return null;
  // This cohort's own programme first, then the rest.
  const usable = (pools || [])
    .filter((p) => p.status !== 'closed')
    .sort((a, b) => Number(b.programId === programId) - Number(a.programId === programId));
  // Places left, counted the way the server counts capacity (active members).
  const room = usable.map((p) => {
    const left = p.capacity ? Math.max(0, p.capacity - (p.memberCount ?? 0)) : Infinity;
    return { pool: p, left, full: left === 0 };
  });
  const chosen = room.find((r) => r.pool.id === poolId);

  const add = async () => {
    if (!poolId) return;
    setBusy(true);
    try {
      const out = await poolApi.addFromApplications(poolId, applicationIds);
      setResult(out);
      toast.success(`${(out.summary.added || 0) + (out.summary.invited || 0)} added to the pool`);
      onDone?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add them to the pool'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
      >
        <UsersRound className="w-3.5 h-3.5" /> Add to pool · {applicationIds.length}
      </button>
      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          title="Add to a selection pool"
          subtitle={`${applicationIds.length} applicant${applicationIds.length === 1 ? '' : 's'} selected`}
          footer={(dismiss) => (
            <div className="flex justify-end gap-2">
              <button onClick={dismiss} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">{result ? 'Done' : 'Cancel'}</button>
              {!result && (
                <button onClick={add} disabled={busy || !poolId || chosen?.full} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                  Add {applicationIds.length > 1 ? applicationIds.length : ''} to pool
                </button>
              )}
            </div>
          )}
        >
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />Loading pools…</div>
          ) : usable.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
              <UsersRound className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-700">No open selection pool</p>
              <p className="mt-1 text-xs text-slate-500">Create a pool first, then add applicants to it.</p>
              <Link href={workspacePath('/admin/pools')} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">Create a pool →</Link>
            </div>
          ) : result ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {result.summary.added ? <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200">{result.summary.added} added</Chip> : null}
                {result.summary.invited ? <Chip cls="bg-brand-50 text-brand-700 border-brand-200">{result.summary.invited} invited</Chip> : null}
                {result.summary.skipped ? <Chip cls="bg-slate-100 text-slate-600 border-slate-200">{result.summary.skipped} already in the pool</Chip> : null}
                {result.summary.failed ? <Chip cls="bg-rose-50 text-rose-700 border-rose-200">{result.summary.failed} failed</Chip> : null}
              </div>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                {result.results.map((r, i) => (
                  <li key={`${r.email}-${i}`} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="truncate text-slate-700">{r.email}</span>
                    <span className={`shrink-0 text-xs ${r.result === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>{r.reason || r.result}</span>
                  </li>
                ))}
              </ul>
              <Link href={workspacePath(`/admin/pools/${poolId}?tab=candidates`)} className="inline-block font-medium text-brand-700 underline">Open the pool</Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Choose a pool</span>
                <div className="space-y-2" role="radiogroup" aria-label="Pool">
                  {room.map(({ pool: p, left, full }) => {
                    const on = poolId === p.id;
                    const used = p.memberCount ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={full}
                        onClick={() => setPoolId(p.id)}
                        className={`w-full rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {p.program?.name}{p.programId === programId ? ' · this programme' : ''}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Chip cls={POOL_STATUS[p.status].cls}>{POOL_STATUS[p.status].label}</Chip>
                            {on && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
                          </span>
                        </span>
                        {/* How much room is left — the hint to check before adding. */}
                        {p.capacity ? (
                          <span className="mt-3 block">
                            <span className="flex items-center justify-between text-xs">
                              <span className={full ? 'font-medium text-rose-600' : left < applicationIds.length ? 'font-medium text-amber-700' : 'text-slate-600'}>
                                {full ? 'Pool is full' : `${left} place${left === 1 ? '' : 's'} left`}
                              </span>
                              <span className="tabular-nums text-slate-400">{used} / {p.capacity}</span>
                            </span>
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <span className={`block h-full rounded-full ${full ? 'bg-rose-500' : left < applicationIds.length ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (used / p.capacity) * 100)}%` }} />
                            </span>
                          </span>
                        ) : (
                          <span className="mt-2 block text-xs text-slate-500">No capacity limit · {used} in the pool</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Say it plainly before they click, not after. */}
              {chosen && chosen.pool.capacity && !chosen.full && chosen.left < applicationIds.length && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Only {chosen.left} of the {applicationIds.length} selected will fit. The rest won&apos;t be added.
                </p>
              )}

              <ul className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:bg-slate-800/40">
                <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />Their applications stay as they are. This does not accept them or place them in a clan.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />People with an account here join straight away; everyone else gets a pool invitation by email.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />Safe to repeat. Nobody is added twice.</li>
              </ul>
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}
