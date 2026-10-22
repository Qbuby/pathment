'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, Clock, Flag, ListTodo, Loader2, PartyPopper } from 'lucide-react';
import { useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';
import { LearningStat } from '@/components/mentee/LearningStat';
import { StatusBadge } from '@/components/admin/ui';
import { candidateApi, type CandidatePoolSummary, type CandidateTask } from '@/lib/services/pool-api';
import { CANDIDATE_STATUS } from '../candidateUi';

const OUTCOME: Record<string, { title: string; body: string; cls: string }> = {
  selected: { title: 'You were selected', body: 'Congratulations — you will be placed in a clan shortly.', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  waitlisted: { title: 'You are on the waitlist', body: 'We will let you know if a place opens up.', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  not_selected: { title: 'Not selected this time', body: 'Thank you for taking part in this round.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  withdrawn: { title: 'Withdrawn', body: 'You are no longer part of this round.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  disqualified: { title: 'No longer in this round', body: 'Your remaining work is no longer due.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
};

const OPEN = ['assigned', 'not_started', 'in_progress', 'revision_needed'];
const fmtDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null;
const isOverdue = (t: CandidateTask) => Boolean(t.dueDate && new Date(t.dueDate) < new Date() && OPEN.includes(t.status));
const kindLabel = (t: CandidateTask) => (t.kind === 'task' ? t.type.replace('_', ' ') : t.kind);

function TaskRow({ task }: { task: CandidateTask }) {
  const due = fmtDate(task.dueDate);
  const overdue = isOverdue(task);
  return (
    <Link href={`/candidate/tasks/${task.id}`} className="mentee-task-row group flex items-center gap-4 p-4 sm:p-5 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{task.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="capitalize">{kindLabel(task)}</span>
          {!task.required && <span>Optional</span>}
          {due && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-red-600' : ''}`}>
              <CalendarClock className="h-3.5 w-3.5" /> {overdue ? 'Overdue · ' : 'Due '}{due}
            </span>
          )}
        </p>
      </div>
      <StatusBadge status={task.status} config={CANDIDATE_STATUS} />
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" />
    </Link>
  );
}

function PoolSection({ summary, tasks }: { summary: CandidatePoolSummary; tasks: CandidateTask[] }) {
  const outcome = summary.outcome ? OUTCOME[summary.outcome.decision] : null;
  const { completed, total } = summary.progress;
  return (
    <section className="space-y-4">
      <div className="mentee-page-heading flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{summary.pool.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {summary.pool.program?.name}
            {summary.pool.qualificationDueAt && <> · Complete by {fmtDate(summary.pool.qualificationDueAt)}</>}
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{completed}/{total} approved</p>
            <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {outcome && (
        <div className={`rounded-2xl border px-5 py-4 ${outcome.cls}`}>
          <p className="flex items-center gap-2 font-semibold">
            {summary.outcome?.decision === 'selected' && <PartyPopper className="h-4 w-4" />} {outcome.title}
          </p>
          <p className="mt-0.5 text-sm opacity-90">
            {summary.outcome?.placedClan ? `You have been placed in ${summary.outcome.placedClan.name}.` : outcome.body}
          </p>
          {summary.outcome?.placedClan && (
            <Link href="/mentee/dashboard" className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline">
              Go to my clan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-card px-6 py-10 text-center text-sm text-slate-500">
          No work has been given to you yet. You will be notified when it is.
        </div>
      ) : (
        <div className="mentee-task-list">
          {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
        </div>
      )}
    </section>
  );
}

export default function CandidateDashboardPage() {
  const { user } = useAuth();
  const pools = useApiQuery({ queryKey: ['candidate', 'pools'], queryFn: candidateApi.pools, errorMessage: 'Could not load your pools' });
  const tasks = useApiQuery({ queryKey: ['candidate', 'tasks'], queryFn: candidateApi.tasks, errorMessage: 'Could not load your work' });
  const loading = pools.loading || tasks.loading;
  const all = tasks.data || [];
  const count = (statuses: string[]) => (loading ? '—' : all.filter((t) => statuses.includes(t.status)).length);
  // The single most useful next step: the open piece of work due soonest.
  const next = [...all]
    .filter((t) => OPEN.includes(t.status) && !t.readOnly)
    .sort((a, b) => new Date(a.dueDate || 8.64e15).getTime() - new Date(b.dueDate || 8.64e15).getTime())[0];

  return (
    <div className="space-y-6">
      <div className="mentee-welcome">
        <h1 className="text-slate-900 mb-2 font-bold">Welcome{user?.firstName ? `, ${user.firstName}` : ''}</h1>
        <p className="text-slate-600">
          Your selection round: the work to complete, the deadlines, and your outcome. Hand each piece in before it is due. A reviewer will look at it and may ask for changes.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Your qualification at a glance">
        <LearningStat label="To do" value={count(['assigned', 'not_started', 'in_progress'])} icon={ListTodo} tone={0} hint="Work still to hand in" />
        <LearningStat label="Awaiting review" value={count(['submitted'])} icon={Clock} tone={1} hint="Handed in, waiting for a reviewer" />
        <LearningStat label="Approved" value={count(['completed'])} icon={CheckCircle2} tone={2} hint="Reviewed and accepted" />
        <LearningStat label="Changes requested" value={count(['revision_needed'])} icon={Flag} tone={3} hint="Read the notes and hand in again" />
      </div>

      {next && (
        <Link href={`/candidate/tasks/${next.id}`} className="mentee-next-task block transition-colors">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-600">Next up</span>
            {isOverdue(next) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                <Clock className="h-3 w-3" /> overdue
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{next.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span className="capitalize">{kindLabel(next)}</span>
            {next.dueDate && (<><span className="text-slate-300">·</span><span>Due {fmtDate(next.dueDate)}</span></>)}
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            {next.status === 'revision_needed' ? 'See the notes' : 'Open'} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {(pools.error || tasks.error) && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pools.error || tasks.error}</p>
      )}
      {!loading && !(pools.data || []).length && !pools.error && (
        <div className="mentee-page-heading text-center text-slate-500">You are not in a selection pool right now.</div>
      )}
      {(pools.data || []).map((summary) => (
        <PoolSection key={summary.memberId} summary={summary} tasks={all.filter((t) => t.pool?.id === summary.pool.id)} />
      ))}
    </div>
  );
}
