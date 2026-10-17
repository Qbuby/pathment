'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Mail, RotateCcw, Cpu, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { RelativeTime, SectionCard } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

const QUEUE_TONES: Record<string, string> = {
  pending: 'text-sky-600 dark:text-sky-400',
  processing: 'text-sky-600 dark:text-sky-400',
  sent: 'text-emerald-600 dark:text-emerald-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-amber-600 dark:text-amber-400',
  dead: 'text-red-600 dark:text-red-400',
};

export default function OpsPage() {
  const canSupport = useGate('support');
  const isOwner = useGate('owner');
  const queryClient = useQueryClient();

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.ops,
    queryFn: platformApi.ops.overview,
    staleTime: STALE.short,
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => platformApi.ops.retryEmail(id),
    onSuccess: () => { toast.success('Requeued'); queryClient.invalidateQueries({ queryKey: qk.platform.ops }); },
    onError: (err) => toast.error(extractApiErrorMessage(err, 'Retry failed')),
  });

  const toggleJob = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => platformApi.ops.toggleJob(id, isActive),
    onSuccess: () => { toast.success('Job updated'); queryClient.invalidateQueries({ queryKey: qk.platform.ops }); },
    onError: (err) => toast.error(extractApiErrorMessage(err, 'Could not update the job')),
  });

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error || !data) return <ErrorState message={error || undefined} onRetry={refetch} variant="page" />;

  const queueBlock = (title: string, icon: typeof Mail, counts: Record<string, number>) => {
    const Icon = icon;
    return (
      <SectionCard title={title}>
        <div className="flex items-center gap-4">
          <span className="rounded-2xl bg-muted p-3"><Icon className="h-5 w-5" aria-hidden /></span>
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            {Object.entries(counts).length ? Object.entries(counts).map(([status, count]) => (
              <div key={status}>
                <dt className="text-[11px] capitalize text-muted-foreground">{status}</dt>
                <dd className={cn('text-lg font-semibold tabular-nums', QUEUE_TONES[status])}>{count.toLocaleString()}</dd>
              </div>
            )) : <p className="text-sm text-muted-foreground">Queue is empty.</p>}
          </dl>
        </div>
      </SectionCard>
    );
  };

  return (
    <div>
      <PageHeader title="Queues & jobs" description="Background execution health across the platform. Refreshes every 30s." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {queueBlock('Email queue', Mail, data.email.countsByStatus)}
        {queueBlock('AI evaluation queue', Cpu, data.aiEvaluation.countsByStatus)}
      </div>

      {data.email.oldestPendingAt ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden /> Oldest pending email queued <RelativeTime date={data.email.oldestPendingAt} />
        </p>
      ) : null}

      <div className="mt-4">
        <SectionCard title="Recent email failures" description="Failed and dead rows, newest first.">
          {data.email.recentFailures.length ? (
            <ul className="divide-y divide-border">
              {data.email.recentFailures.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.recipientEmail} · {row.emailType} · attempt {row.attemptCount}
                      {row.lastError ? ` · ${row.lastError.slice(0, 80)}` : ''}
                    </p>
                  </div>
                  <span className={cn('text-xs font-medium capitalize', QUEUE_TONES[row.status])}>{row.status}</span>
                  {canSupport ? (
                    <button
                      type="button"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> Retry
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No recent failures.</p>}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Scheduled jobs" description={isOwner ? 'Toggling a job pauses its next runs.' : 'Owner role required to toggle.'}>
          <ul className="divide-y divide-border">
            {data.jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{job.jobName}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.cronExpression || job.jobType} · last run <RelativeTime date={job.lastRunAt} />
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isOwner || toggleJob.isPending}
                  onClick={() => toggleJob.mutate({ id: job.id, isActive: !job.isActive })}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset disabled:cursor-not-allowed',
                    job.isActive
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
                  )}
                  aria-pressed={job.isActive}
                >
                  {job.isActive ? 'active' : 'paused'}
                </button>
              </li>
            ))}
            {!data.jobs.length ? <p className="py-2 text-sm text-muted-foreground">No scheduled jobs registered.</p> : null}
          </ul>
        </SectionCard>

        <SectionCard title="Rollout gates & kill switches" description="Environment-controlled; changing them is a deploy, not a click.">
          <ul className="space-y-2.5">
            {data.flags.map((flag) => (
              <li key={flag.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-mono text-xs">{flag.key}</p>
                  <p className="text-[11px] text-muted-foreground">{flag.description}</p>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                  flag.value
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
                )}>
                  {flag.value ? 'on' : 'off'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Flag className="h-3 w-3" aria-hidden /> Values are read from this API process; workers may run with different environments.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
