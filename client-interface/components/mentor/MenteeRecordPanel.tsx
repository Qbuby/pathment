'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, History, Loader2, Lock, Users2 } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { MenteeRecord, RecordClan, RecordTask } from '@/lib/types/mentee-record';
import { useClan, resolveActiveMentorClan } from '@/lib/context/ClanContext';
import { ContinueWorkLauncher } from '@/components/mentor/ContinueWorkLauncher';

/**
 * Everything this mentee has done in the organisation, clan by clan.
 *
 * Their work is never moved here — it stays in the clan where it happened, so
 * that clan's report and any certificate awarded on it still account for it.
 * This reads across instead.
 *
 * A clan the viewer does not mentor comes back as `summary`: titles and counts,
 * no submissions. The exception is a task the viewer SET, which stays theirs
 * wherever the mentee went since. Both are decided on the server; nothing here
 * hides anything, because anything hidden here would still have been sent.
 */
export function MenteeRecordPanel({ menteeId }: { menteeId: string }) {
  const { clans, activeClanId } = useClan();
  const activeClan = resolveActiveMentorClan(clans, activeClanId);
  const [record, setRecord] = useState<MenteeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!menteeId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.getMenteeRecord(menteeId);
      setRecord(res.data?.record ?? null);
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Could not load this mentee’s record'));
    } finally {
      setLoading(false);
    }
  }, [menteeId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading record" />
        Loading their record…
      </div>
    );
  }
  if (error) return <p className="py-8 text-sm text-muted-foreground">{error}</p>;
  if (!record || !record.clans.length) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No clan history yet — this is their first clan.
      </p>
    );
  }

  const toggle = (clanId: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(clanId)) next.delete(clanId); else next.add(clanId);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-card text-slate-500 dark:border-slate-700">
            <History className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Work history</h3>
              <span className="rounded-full border border-slate-200 bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">Read only</span>
              {activeClan?.kind === 'standing' && (
                <span className="ml-auto">
                  <ContinueWorkLauncher clanId={activeClan.id} menteeId={menteeId} />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Previous work stays with the clan where it happened and does not count toward current-clan activity.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200/80 pt-3 text-xs text-muted-foreground dark:border-slate-800">
          <span className="font-medium text-foreground">{record.totals.clans} clan{record.totals.clans === 1 ? '' : 's'}</span>
          <span>{record.totals.tasksCompleted} of {record.totals.tasksAssigned} tasks done</span>
          {record.totals.tasksUnfinished > 0 && <span>{record.totals.tasksUnfinished} unfinished</span>}
          {record.totals.openBlockers > 0 && <span>{record.totals.openBlockers} open blockers</span>}
          {record.certificate && (
            <span className="font-medium capitalize text-brand-700 dark:text-brand-300">Certificate · {record.certificate.tier}</span>
          )}
        </div>
      </div>

      {Object.entries(record.sectionErrors || {}).map(([section, message]) => (
        <p key={section} className="text-xs text-amber-600">Could not load {section}: {message}</p>
      ))}

      <ul className="space-y-3">
        {record.clans.map((clan) => (
          <ClanCard
            key={clan.clanId}
            clan={clan}
            expanded={open.has(clan.clanId)}
            onToggle={() => toggle(clan.clanId)}
          />
        ))}
      </ul>
    </div>
  );
}

function ClanCard({ clan, expanded, onToggle }: { clan: RecordClan; expanded: boolean; onToggle: () => void }) {
  const tasks = clan.tasks ?? [];
  return (
    <li className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <Users2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {clan.clanName || 'Unnamed clan'}
            {/* A clan they LEFT is the history this panel exists for — label it
                rather than letting it look like a clan they are still in. */}
            {!clan.current && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {clan.leftAt ? `left ${new Date(clan.leftAt).toLocaleDateString()}` : 'past'}
              </span>
            )}
            {clan.membershipStatus === 'paused' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                paused
              </span>
            )}
            {clan.clanKind === 'standing' && (
              <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                standing
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {clan.programName || 'No programme'}
            {' · '}
            {clan.metrics.tasksCompleted}/{clan.metrics.tasksAssigned} done
            {clan.metrics.tasksUnfinished > 0 && ` · ${clan.metrics.tasksUnfinished} unfinished`}
            {clan.metrics.openBlockers > 0 && ` · ${clan.metrics.openBlockers} open blockers`}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {clan.visibility === 'summary' && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" aria-hidden />
              Summary only — submissions and feedback stay with this clan’s mentors.
            </p>
          )}
          {!tasks.length ? (
            <p className="text-xs text-muted-foreground">No work recorded in this clan.</p>
          ) : (
            <ul className="space-y-1.5">
              {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function TaskRow({ task }: { task: RecordTask }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-foreground">{task.title}</span>
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
        {task.status.replace(/_/g, ' ')}
      </span>
      {task.assignedByViewer && (
        // Tier 3: work the viewer set stays theirs wherever the mentee moved.
        <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
          you assigned this
        </span>
      )}
      {/* TypeScript narrows on `detail`, so this cannot be read on a
          title-only task — the tier is a compile-time fact, not a convention. */}
      {task.detail === 'full' && task.submissions.length > 0 && (
        <span className="text-[10px] text-muted-foreground">
          {task.submissions.length} submission{task.submissions.length === 1 ? '' : 's'}
        </span>
      )}
      {task.detail === 'full' && task.finalRating != null && (
        <span className="text-[10px] text-muted-foreground">rated {task.finalRating}/5</span>
      )}
    </li>
  );
}
