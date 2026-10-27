'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Inbox, Loader2, Mail, Search, Upload, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { CandidateReview, type CandidateFilter } from './CandidateReview';
import { Drawer } from '@/components/shared/Drawer';
import { useApiQuery } from '@/lib/query';
import { poolApi, type ImportResult, type PoolApplication, type PoolDashboard, type PoolMemberRow } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, field, fmtDate, label, primaryBtn, secondaryBtn } from './poolUi';

function ResultList({ result }: { result: ImportResult }) {
  const s = result.summary;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {s.added ? <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200">{s.added} added</Chip> : null}
        {s.invited ? <Chip cls="bg-brand-50 text-brand-700 border-brand-200">{s.invited} invited</Chip> : null}
        {s.skipped ? <Chip cls="bg-slate-100 text-slate-600 border-slate-200">{s.skipped} skipped</Chip> : null}
        {s.failed ? <Chip cls="bg-rose-50 text-rose-700 border-rose-200">{s.failed} failed</Chip> : null}
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
        {result.results.map((r, i) => (
          <li key={`${r.email}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="truncate text-slate-700">{r.email || r.memberId}</span>
            <span className={`shrink-0 text-xs ${r.result === 'failed' ? 'text-rose-600' : r.result === 'skipped' ? 'text-slate-400' : 'text-emerald-700'}`}>
              {r.reason || r.result}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const APP_STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  under_review: { label: 'Under review', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  waitlisted: { label: 'Waitlisted', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  assessment_sent: { label: 'Assessment sent', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending: { label: 'New', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const STATUS_FILTERS: [string, string][] = [['accepted', 'Accepted'], ['under_review', 'Under review'], ['waitlisted', 'Waitlisted'], ['', 'Any status']];

/**
 * Applicants as people, not as a list of emails: a face, the name, where they
 * applied, how they did, and whether they are already in the pool. People who
 * can be added come first; those already in the pool sit underneath, faded.
 */
function ApplicationPicker({ apps, loading, status, onStatus, chosen, onChosen }: {
  apps: PoolApplication[];
  loading: boolean;
  status: string;
  onStatus: (s: string) => void;
  chosen: Set<string>;
  onChosen: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const [hideInPool, setHideInPool] = useState(false);
  const nameOf = (a: PoolApplication) => [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => apps
    .filter((a) => !q || `${nameOf(a)} ${a.email} ${a.cohort?.name || ''} ${a.cohort?.program?.name || ''}`.toLowerCase().includes(q))
    .filter((a) => !hideInPool || !a.inPool)
    .sort((a, b) => Number(a.inPool) - Number(b.inPool)), [apps, q, hideInPool]);
  const available = shown.filter((a) => !a.inPool);
  const inPoolCount = apps.filter((a) => a.inPool).length;
  const allOn = available.length > 0 && available.every((a) => chosen.has(a.id));
  const toggle = (id: string) => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); onChosen(next); };
  const toggleAll = () => {
    const next = new Set(chosen);
    available.forEach((a) => (allOn ? next.delete(a.id) : next.add(a.id)));
    onChosen(next);
  };

  return (
    <div className="space-y-3">
      {/* Which applications, then narrow by name. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Application status">
        {STATUS_FILTERS.map(([key, text]) => (
          <button key={key || 'any'} type="button" onClick={() => onStatus(key)} aria-pressed={status === key}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${status === key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-card text-slate-600 hover:border-brand-300 hover:text-brand-700'}`}>
            {text}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or cohort…" aria-label="Search applications"
          className="w-full rounded-xl border border-slate-200 bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />Loading applications…</div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <Inbox className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-700">No applications with that status</p>
          <p className="mt-1 text-xs text-slate-500">Try another status, or add people by email instead.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {/* Select everyone who can be added, and the running count. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={allOn} disabled={!available.length} onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              Select all available ({available.length})
            </label>
            <div className="flex items-center gap-3 text-xs">
              {inPoolCount > 0 && (
                <button type="button" onClick={() => setHideInPool((v) => !v)} className="font-medium text-slate-500 hover:text-brand-700">
                  {hideInPool ? `Show ${inPoolCount} in pool` : `Hide ${inPoolCount} in pool`}
                </button>
              )}
              <span className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${chosen.size ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{chosen.size} selected</span>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nobody matches that search.</p>
          ) : (
            <ul className="max-h-104 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {shown.map((a) => {
                const on = chosen.has(a.id);
                const st = APP_STATUS[a.status];
                const score = a.assessmentScore !== null && a.assessmentScore !== undefined && a.assessmentScore !== '' ? Math.round(Number(a.assessmentScore)) : null;
                return (
                  <li key={a.id}>
                    <label className={`flex items-center gap-3 px-3 py-3 transition-colors ${a.inPool ? 'cursor-default opacity-60' : on ? 'cursor-pointer bg-brand-50 dark:bg-brand-500/10' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                      <input type="checkbox" disabled={a.inPool} checked={on} onChange={() => toggle(a.id)} aria-label={`Select ${nameOf(a)}`}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      <Avatar name={nameOf(a)} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium text-slate-900">{nameOf(a)}</span>
                          {st && !a.inPool && <span className={`rounded-full border px-2 py-px text-[11px] font-medium ${st.cls}`}>{st.label}</span>}
                          {a.inPool && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[11px] font-medium text-emerald-700"><Check className="h-3 w-3" />In pool</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{a.email}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                          {(a.cohort?.program?.name || a.cohort?.name) && <span className="truncate">{[a.cohort?.program?.name, a.cohort?.name].filter(Boolean).join(' · ')}</span>}
                          {a.createdAt && <span>· Applied {fmtDate(a.createdAt)}</span>}
                        </span>
                      </span>
                      {score !== null && Number.isFinite(score) && (
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-slate-900">{score}</span>
                          <span className="block text-[10px] uppercase tracking-wide text-slate-400">Score</span>
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AddCandidatesDrawer({ poolId, onClose, onDone }: { poolId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'paste' | 'csv' | 'applications'>('paste');
  const [emails, setEmails] = useState('');
  const [csv, setCsv] = useState('');
  const [csvName, setCsvName] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [appStatus, setAppStatus] = useState('accepted');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const apps = useApiQuery({
    queryKey: ['pools', poolId, 'applications', appStatus],
    queryFn: () => poolApi.applications(poolId, appStatus || undefined),
    enabled: mode === 'applications',
  });

  const run = async () => {
    setBusy(true);
    try {
      const out = mode === 'applications'
        ? await poolApi.addFromApplications(poolId, [...chosen])
        : await poolApi.importMembers(poolId, mode === 'csv' ? { csv } : { emails });
      setResult(out);
      toast.success('Candidates processed. See each row below');
      onDone();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add candidates'));
    } finally {
      setBusy(false);
    }
  };

  const ready = mode === 'paste' ? emails.trim() : mode === 'csv' ? csv.trim() : chosen.size > 0;
  return (
    <Drawer
      open
      onClose={onClose}
      title="Add candidates"
      subtitle="Existing accounts are added straight away; everyone else gets an invitation. Safe to repeat."
      width="lg"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">{result ? 'Done' : 'Cancel'}</button>
          <button onClick={run} disabled={busy || !ready} className={primaryBtn}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {mode === 'applications' && chosen.size ? `Add ${chosen.size}` : 'Add'}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([['paste', 'Paste emails', Mail], ['csv', 'Upload CSV', Upload], ['applications', 'From applications', Inbox]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => { setMode(k); setResult(null); }} aria-pressed={mode === k}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${mode === k ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icon className="hidden h-4 w-4 sm:block" />{l}
            </button>
          ))}
        </div>

        {mode === 'paste' && (
          <div>
            <label className={label}>Email addresses</label>
            <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={8} className={field} placeholder={'one@example.com\ntwo@example.com'} />
            <p className="mt-1 text-xs text-slate-400">Separate with new lines, commas or spaces.</p>
          </div>
        )}
        {mode === 'csv' && (
          <div>
            <label className={label}>CSV file</label>
            <label className={`${secondaryBtn} cursor-pointer`}>
              <Upload className="h-4 w-4" /> {csvName || 'Choose a .csv file'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCsvName(file.name);
                  setCsv(await file.text());
                }}
              />
            </label>
            <p className="mt-2 text-xs text-slate-400">Needs an <code>email</code> column; <code>first_name</code> and <code>last_name</code> are used when present.</p>
          </div>
        )}
        {mode === 'applications' && (
          <ApplicationPicker
            apps={apps.data || []}
            loading={apps.loading}
            status={appStatus}
            onStatus={(s) => { setAppStatus(s); setChosen(new Set()); }}
            chosen={chosen}
            onChosen={setChosen}
          />
        )}

        {result && <ResultList result={result} />}
      </div>
    </Drawer>
  );
}

function ReasonDrawer({ title, actionLabel, onClose, onSubmit }: { title: string; actionLabel: string; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle="The reason is kept in the pool's history."
      width="sm"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button
            disabled={busy || !reason.trim()}
            onClick={async () => { setBusy(true); try { await onSubmit(reason.trim()); dismiss(); } finally { setBusy(false); } }}
            className={primaryBtn}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {actionLabel}
          </button>
        </div>
      )}
    >
      <label className={label}>Reason</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={field} />
    </Drawer>
  );
}

function DecisionDrawer({ member, onClose, onSubmit }: { member: PoolMemberRow; onClose: () => void; onSubmit: (decision: string, reason: string) => Promise<void> }) {
  const [decision, setDecision] = useState(member.decision || 'waitlisted');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Change decision: ${member.name || member.email}`}
      subtitle="For a change after the selection was confirmed, such as promoting someone from the waitlist."
      width="sm"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button
            disabled={busy || !reason.trim() || decision === member.decision}
            onClick={async () => { setBusy(true); try { await onSubmit(decision, reason.trim()); dismiss(); } finally { setBusy(false); } }}
            className={primaryBtn}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save decision
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className={label}>Decision</label>
          <select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)} className={field}>
            <option value="selected">Selected</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="not_selected">Not selected</option>
          </select>
        </div>
        <div>
          <label className={label}>Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={field} />
        </div>
      </div>
    </Drawer>
  );
}

export function CandidatesTab({ data, onChange, canManage, canSelect, canReview = false, canAssign = false, initialFilter, workCount = 0, onOpenWork }: { data: PoolDashboard; onChange: () => void; canManage: boolean; canSelect: boolean; canReview?: boolean; canAssign?: boolean; initialFilter?: CandidateFilter; workCount?: number; onOpenWork?: () => void }) {
  const { pool } = data;
  const [adding, setAdding] = useState(false);
  const [exit, setExit] = useState<{ member: PoolMemberRow; kind: 'withdraw' | 'disqualify' } | null>(null);
  const [deciding, setDeciding] = useState<PoolMemberRow | null>(null);

  const resend = async (m: PoolMemberRow) => {
    try {
      await poolApi.resendInvite(pool.id, m.id);
      toast.success(`Invitation sent to ${m.email}`);
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not resend the invitation'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Candidates, one at a time, the way a clan review works. */}
      <CandidateReview
        data={data}
        onChange={onChange}
        canManage={canManage}
        canSelect={canSelect}
        canReview={canReview}
        canAssign={canAssign}
        workCount={workCount}
        onOpenWork={onOpenWork}
        onAdd={() => setAdding(true)}
        onResend={resend}
        onExit={(member, kind) => setExit({ member, kind })}
        onDecide={setDeciding}
        initialFilter={initialFilter}
      />

      {adding && <AddCandidatesDrawer poolId={pool.id} onClose={() => setAdding(false)} onDone={onChange} />}
      {exit && (
        <ReasonDrawer
          title={`${exit.kind === 'withdraw' ? 'Withdraw' : 'Disqualify'} ${exit.member.name || exit.member.email}`}
          actionLabel={exit.kind === 'withdraw' ? 'Withdraw' : 'Disqualify'}
          onClose={() => setExit(null)}
          onSubmit={async (reason) => {
            try {
              await (exit.kind === 'withdraw' ? poolApi.withdraw : poolApi.disqualify)(pool.id, exit.member.id, reason);
              toast.success(exit.kind === 'withdraw' ? 'Candidate withdrawn' : 'Candidate disqualified');
              onChange();
            } catch (e) {
              toast.error(extractApiErrorMessage(e, 'Could not update the candidate'));
              throw e;
            }
          }}
        />
      )}
      {deciding && (
        <DecisionDrawer
          member={deciding}
          onClose={() => setDeciding(null)}
          onSubmit={async (decision, reason) => {
            try {
              await poolApi.setDecision(pool.id, deciding.id, decision, reason);
              toast.success('Decision changed');
              onChange();
            } catch (e) {
              toast.error(extractApiErrorMessage(e, 'Could not change the decision'));
              throw e;
            }
          }}
        />
      )}
    </div>
  );
}
