'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Lock, Unlock, Loader2, ShieldCheck, Clock, Inbox, Check, X, History, Hourglass, AlertTriangle, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { TablePagination } from '@/components/shared/TablePagination';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import {
  reviewLockApi,
  type ReviewLockState,
  type ReviewLockRequest,
  type ReviewLockGrant,
  type ReviewLockLog,
} from '@/lib/services/review-lock-api';

const DURATION_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '72', label: '72 hours' },
  { value: '168', label: '1 week' },
  { value: 'custom', label: 'Custom date & time…' },
];

// `YYYY-MM-DDTHH:mm` in the admin's LOCAL time, for a <input type=datetime-local>.
function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Human "time left" until an ISO instant (e.g. "2d 4h left"). Past → "expired".
function timeLeft(iso: string | null): string {
  if (!iso) return 'no expiry';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${m}m left`;
  return `${m}m left`;
}

function whenLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ReviewLockTab() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ReviewLockState | null>(null);
  const [requests, setRequests] = useState<ReviewLockRequest[]>([]);
  const [grants, setGrants] = useState<ReviewLockGrant[]>([]);
  const [logs, setLogs] = useState<ReviewLockLog[]>([]);
  const [toggling, setToggling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const logsPg = usePagination({ initialPage: 1, initialLimit: 10 });

  const load = useCallback(async () => {
    try {
      const [s, r, g, l] = await Promise.all([
        reviewLockApi.state(),
        reviewLockApi.requests('pending'),
        reviewLockApi.grants(true),
        reviewLockApi.logs(logsPg.page, logsPg.limit),
      ]);
      setState(s);
      setRequests(r.requests || []);
      setGrants(g.grants || []);
      setLogs(l.logs || []);
      logsPg.setTotal(l.total);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not load the review-lock settings'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsPg.page, logsPg.limit]);

  useEffect(() => { load(); }, [load]);

  const scopes = state?.scopes ?? [];
  const [scopeKind, setScopeKind] = useState<'program' | 'clan'>('program');
  const [scopeTarget, setScopeTarget] = useState('');
  const [scopeBusy, setScopeBusy] = useState(false);

  /**
   * The programmes and clans that are not already locked.
   *
   * Offering one that is already in the list below would make "Lock this"
   * either a no-op or a confusing second row; the unique index on the server
   * means it is the former, and either way it is not worth offering.
   */
  const alreadyLocked = new Set(scopes.map((row) => `${row.scopeType}:${row.scopeId}`));
  const scopeOptions = (scopeKind === 'program'
    ? (state?.choices?.programs ?? []).map((p) => ({ value: p.id, label: p.name }))
    : (state?.choices?.clans ?? []).map((c) => ({
      value: c.id, label: c.name, description: `${c.programName}${c.kind === 'standing' ? ' · standing' : ''}`,
    }))
  ).filter((option) => !alreadyLocked.has(`${scopeKind}:${option.value}`));

  const setScope = async (scopeType: 'program' | 'clan', scopeId: string, locked: boolean, label?: string) => {
    try {
      setScopeBusy(true);
      await reviewLockApi.setLocked(locked, { scopeType, scopeId });
      toast.success(locked
        ? `Deletion locked${label ? ` for ${label}` : ''}`
        : `Deletion unlocked${label ? ` for ${label}` : ''}`);
      setScopeTarget('');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update that lock'));
    } finally {
      setScopeBusy(false);
    }
  };

  const toggleLock = async () => {
    if (!state) return;
    const next = !state.locked;
    if (next) {
      const ok = await confirm({
        title: 'Lock cohort-review deletion?',
        description: 'Mentors will no longer be able to delete or reopen saved review records. They can request time-boxed access, which you approve here. This protects audit integrity.',
        confirmLabel: 'Lock deletion',
      });
      if (!ok) return;
    }
    try {
      setToggling(true);
      await reviewLockApi.setLocked(next);
      toast.success(next ? 'Cohort-review deletion locked' : 'Cohort-review deletion unlocked');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update the lock'));
    } finally {
      setToggling(false);
    }
  };

  const respond = async (
    req: ReviewLockRequest,
    approve: boolean,
    window: { durationHours?: number; expiresAt?: string },
    note: string,
  ) => {
    try {
      setBusyId(req.id);
      await reviewLockApi.respond(req.id, {
        approve,
        durationHours: approve ? window.durationHours : undefined,
        expiresAt: approve ? window.expiresAt : undefined,
        note: note.trim() || undefined,
      });
      toast.success(approve ? 'Access granted' : 'Request declined');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not respond to the request'));
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (grant: ReviewLockGrant) => {
    const ok = await confirm({
      title: `Revoke access for ${grant.mentor.name}?`,
      description: 'They will immediately lose the ability to delete or reopen review records.',
      variant: 'danger',
      confirmLabel: 'Revoke',
    });
    if (!ok) return;
    try {
      setBusyId(grant.id);
      await reviewLockApi.revokeGrant(grant.id);
      toast.success('Access revoked');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not revoke the grant'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;

  const locked = !!state?.locked;

  return (
    <div className="space-y-8">
      {/* The lock toggle.
          The amber is gone. A lock that is deliberately on is a normal,
          intended state — not a warning — and dressing it in the colour the
          product uses for "something needs your attention" made a correctly
          configured workspace look like it had a problem. Amber also carries
          the worst contrast of any accent in the palette on a tinted panel,
          which is the accessibility half of the same report. */}
      <section>
        <div className={`rounded-2xl border p-5 ${locked ? 'border-brand-200 bg-brand-50/60 dark:bg-brand-500/10 dark:border-brand-500/30' : 'border-slate-200'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${locked ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20' : 'bg-slate-100 text-slate-500'}`}>
              {locked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-slate-900 flex items-center gap-2">Lock cohort-review deletion</h2>
              <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                When locked, mentors can&apos;t delete or reopen saved cohort-review records — protecting attendance and review history for compliance and audit integrity. Mentors can request time-boxed access, which you approve below.
              </p>
              <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                This switch covers the whole workspace. To protect one programme or one clan
                instead, add it below and leave this off.
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${locked ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {locked ? 'Locked everywhere' : scopes.length ? `Locked in ${scopes.length} place${scopes.length === 1 ? '' : 's'}` : 'Unlocked'}
                </span>
                {(locked || scopes.length > 0) && (
                  <span className="text-xs text-slate-500">
                    {state?.pendingRequests ?? 0} pending · {state?.activeGrants ?? 0} active grant{(state?.activeGrants ?? 0) === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={toggleLock}
              disabled={toggling}
              role="switch"
              aria-checked={locked}
              aria-label="Lock cohort-review deletion"
              className={`relative shrink-0 inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${locked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${locked ? 'translate-x-6' : 'translate-x-1'}`} />
              {toggling && <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />}
            </button>
          </div>
        </div>
      </section>

      {/* Where the lock applies.
          The lock used to be one switch for the entire organisation, so an
          admin protecting the records of a programme that had just closed had
          to freeze deletion for every mentor in every clan — including the
          ones mid-cohort. */}
      <section>
        <h2 className="text-slate-900 flex items-center gap-2"><Target className="w-5 h-5 text-brand-600" /> Locked programmes and clans</h2>
        <p className="text-slate-500 text-sm mt-0.5 mb-4">
          Protect one programme or one clan without locking the whole workspace. These apply
          on top of the switch above — they add, they never undo it.
        </p>

        <div className="rounded-2xl border border-slate-200 bg-card p-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-44">
              <label htmlFor="review-lock-kind" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Lock a
              </label>
              <SelectMenu
                value={scopeKind}
                onChange={(value) => { setScopeKind(value as 'program' | 'clan'); setScopeTarget(''); }}
                options={[{ value: 'program', label: 'Programme' }, { value: 'clan', label: 'Clan' }]}
                ariaLabel="Lock a programme or a clan"
                className="w-full"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="review-lock-target" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {scopeKind === 'program' ? 'Which programme' : 'Which clan'}
              </label>
              <SelectMenu
                value={scopeTarget}
                onChange={setScopeTarget}
                options={scopeOptions}
                placeholder={scopeOptions.length ? 'Choose one…' : 'Nothing left to lock'}
                ariaLabel={scopeKind === 'program' ? 'Which programme' : 'Which clan'}
                searchable
                disabled={!scopeOptions.length}
                className="w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const chosen = scopeOptions.find((o) => o.value === scopeTarget);
                if (chosen) void setScope(scopeKind, scopeTarget, true, chosen.label);
              }}
              disabled={!scopeTarget || scopeBusy}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {scopeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}Lock it
            </button>
          </div>

          {scopes.length === 0 ? (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-700">
              Nothing is locked on its own.
              {locked
                ? ' The workspace-wide switch above is on, so deletion is locked everywhere regardless.'
                : ' Mentors can delete and reopen their own review records.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-700">
              {scopes.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 dark:border-slate-700">
                  <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
                    <p className="text-xs capitalize text-slate-500">
                      {row.scopeType === 'program' ? 'Programme' : 'Clan'}
                      {' · locked '}
                      {whenLabel(row.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void setScope(row.scopeType, row.scopeId, false, row.name)}
                    disabled={scopeBusy}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Unlock className="h-3.5 w-3.5" />Unlock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Pending requests */}
      <section>
        <h2 className="text-slate-900 flex items-center gap-2"><Inbox className="w-5 h-5 text-brand-600" /> Access requests</h2>
        <p className="text-slate-500 text-sm mt-0.5 mb-4">Mentors asking to delete or reopen review records while the lock is on.</p>
        {requests.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No pending requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <RequestRow key={req.id} req={req} busy={busyId === req.id} onRespond={respond} />
            ))}
          </div>
        )}
      </section>

      {/* Active grants */}
      <section>
        <h2 className="text-slate-900 flex items-center gap-2"><Clock className="w-5 h-5 text-brand-600" /> Active grants</h2>
        <p className="text-slate-500 text-sm mt-0.5 mb-4">Mentors currently able to delete or reopen review records.</p>
        {grants.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <Lock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No active grants — deletion is locked for everyone.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{g.mentor.name}</span>
                    {g.mentor.clanName && <span className="text-xs text-slate-400 truncate">{g.mentor.clanName}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {/* What the grant actually covers. A grant used to be the
                        whole organisation whatever was asked for, so there was
                        nothing to say; now it is usually one clan. */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {g.scopeName}
                    </span>
                    <span className="inline-flex items-center gap-1"><Hourglass className="w-3 h-3" />{timeLeft(g.expiresAt)}</span>
                    {g.expiresAt && <span className="text-slate-400">· until {whenLabel(g.expiresAt)}</span>}
                  </div>
                  {g.reason && <p className="text-xs text-slate-500 mt-1 truncate">&ldquo;{g.reason}&rdquo;</p>}
                </div>
                <button
                  onClick={() => revoke(g)}
                  disabled={busyId === g.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 shrink-0"
                >
                  {busyId === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-brand-600" /> Recent activity</h2>
        <p className="text-slate-500 text-sm mt-0.5 mb-4">An audit trail of lock changes, requests and grants.</p>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 px-1 py-2">No activity yet.</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 dark:divide-slate-700/60">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium text-slate-900 capitalize">{log.action.replace(/_/g, ' ')}</span>
                      {log.userName && <span className="text-slate-500"> · {log.userName}</span>}
                    </p>
                    {log.detail && <p className="text-xs text-slate-500 mt-0.5">{log.detail}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{whenLabel(log.createdAt)}</span>
                </div>
              ))}
            </div>
            {logsPg.total > logsPg.limit && (
              <TablePagination pagination={logsPg} showPageSize={false} className="mt-3" />
            )}
          </>
        )}
      </section>
    </div>
  );
}

// A single pending request with inline approve (duration + note) / decline controls.
function RequestRow({
  req, busy, onRespond,
}: {
  req: ReviewLockRequest;
  busy: boolean;
  onRespond: (req: ReviewLockRequest, approve: boolean, window: { durationHours?: number; expiresAt?: string }, note: string) => Promise<void>;
}) {
  const [duration, setDuration] = useState('48');
  const [customDate, setCustomDate] = useState(() => toLocalInputValue(new Date(Date.now() + 48 * 3600000)));
  const [note, setNote] = useState('');
  const isCustom = duration === 'custom';

  // Custom picker is in the admin's LOCAL time; send it as a UTC instant so the
  // stored expiry is timezone-correct everywhere.
  const grantWindow = (): { durationHours?: number; expiresAt?: string } =>
    isCustom ? { expiresAt: new Date(customDate).toISOString() } : { durationHours: Number(duration) };
  const customInvalid = isCustom && (!customDate || new Date(customDate).getTime() <= Date.now());

  return (
    <div className="rounded-xl border border-slate-200 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-brand-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900">{req.mentor.name}</span>
            {req.mentor.clanName && <span className="text-xs text-slate-400">{req.mentor.clanName}</span>}
            <span className="text-xs text-slate-400">· {whenLabel(req.createdAt)}</span>
          </div>
          {req.sessionDate && (
            <p className="text-xs text-slate-500 mt-0.5">
              Session {new Date(`${req.sessionDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
          <p className="text-sm text-slate-700 mt-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">&ldquo;{req.reason}&rdquo;</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-slate-600">Grant for</label>
          <SelectMenu
            value={duration}
            onChange={setDuration}
            options={DURATION_OPTIONS}
            searchable={false}
            ariaLabel="Grant duration"
            className="w-44"
          />
          {isCustom && (
            <input
              type="datetime-local"
              value={customDate}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="Access expires at"
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>
        {isCustom && (
          <p className="text-[11px] text-slate-400 -mt-1">Ends at this time in your local timezone.</p>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the mentor…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onRespond(req, false, {}, note)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <X className="w-4 h-4" />Decline
          </button>
          <button
            onClick={() => onRespond(req, true, grantWindow(), note)}
            disabled={busy || customInvalid}
            title={customInvalid ? 'Pick a future date & time' : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve
          </button>
        </div>
      </div>
    </div>
  );
}
