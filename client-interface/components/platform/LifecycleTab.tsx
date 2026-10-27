'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PauseCircle, PlayCircle, Archive, RotateCcw } from 'lucide-react';
import { qk } from '@/lib/query';
import { platformApi, type WorkspaceDetail, type WorkspaceStatus } from '@/lib/services/platform-api';
import { SectionCard, StatusPill } from '@/components/platform/primitives';
import { useGate } from '@/components/platform/PlatformShell';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

/**
 * Workspace lifecycle. Every transition requires a written reason - it lands
 * in the platform audit trail verbatim - and suspending or archiving also
 * disconnects the workspace's live sockets server-side.
 */
const TRANSITIONS: Array<{
  to: WorkspaceStatus; label: string; description: string; icon: typeof PauseCircle;
  from: WorkspaceStatus[]; tone: 'danger' | 'default';
}> = [
  { to: 'suspended', label: 'Suspend workspace', icon: PauseCircle, tone: 'danger', from: ['active', 'trial', 'past_due'],
    description: 'Members are locked out and live sessions are disconnected. The data stays intact.' },
  { to: 'active', label: 'Reactivate workspace', icon: PlayCircle, tone: 'default', from: ['suspended', 'trial', 'past_due', 'archived'],
    description: 'Restores normal access for every member.' },
  { to: 'archived', label: 'Archive workspace', icon: Archive, tone: 'danger', from: ['active', 'trial', 'past_due', 'suspended'],
    description: 'Hides the workspace everywhere and ends access. Reversible - archiving deletes nothing.' },
  { to: 'trial', label: 'Mark as trial', icon: RotateCcw, tone: 'default', from: ['active'],
    description: 'Moves the workspace back into a trial state.' },
];

export function LifecycleTab({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  const canLifecycle = useGate('lifecycle');
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<WorkspaceStatus | null>(null);
  const [reason, setReason] = useState('');
  const status = detail.organization.status;

  const mutation = useMutation({
    mutationFn: (input: { status: WorkspaceStatus; reason: string }) =>
      platformApi.organizations.setStatus(organizationId, input),
    onSuccess: (result) => {
      toast.success(`Workspace is now ${result.status}`);
      setConfirming(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onChanged();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the workspace')),
  });

  const available = TRANSITIONS.filter((transition) => transition.from.includes(status));

  if (!canLifecycle) {
    return (
      <SectionCard title="Lifecycle" description="Suspend, reactivate or archive this workspace.">
        <p className="text-sm text-muted-foreground">Lifecycle changes require the platform owner role.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Current state">
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <p className="text-sm text-muted-foreground">
            {status === 'suspended' ? 'Members cannot sign in to this workspace.'
              : status === 'archived' ? 'Hidden and inaccessible; data retained.'
              : status === 'past_due' ? 'Payment is overdue; access continues until suspension.'
              : 'Workspace is serving members normally.'}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Transitions" description="Every change requires a reason and is recorded in the platform audit trail.">
        <ul className="divide-y divide-border">
          {available.map((transition) => {
            const Icon = transition.icon;
            const isOpen = confirming === transition.to;
            return (
              <li key={transition.to} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`rounded-xl p-2 ${transition.tone === 'danger' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-muted'}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{transition.label}</p>
                      <p className="text-xs text-muted-foreground">{transition.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setConfirming(isOpen ? null : transition.to); setReason(''); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${transition.tone === 'danger' ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10' : 'border border-border hover:bg-muted'}`}
                  >
                    {isOpen ? 'Cancel' : transition.label}
                  </button>
                </div>
                {isOpen ? (
                  <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <label className="block text-xs font-medium" htmlFor={`reason-${transition.to}`}>
                      Why? <span className="font-normal text-muted-foreground">(recorded verbatim in the audit trail)</span>
                    </label>
                    <textarea
                      id={`reason-${transition.to}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={2}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                      placeholder={`e.g. "Invoice INV-2026-014 unpaid for 30 days"`}
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {transition.to === 'suspended' || transition.to === 'archived'
                          ? 'Live sessions are disconnected immediately.' : 'Takes effect immediately.'}
                      </p>
                      <button
                        type="button"
                        disabled={reason.trim().length < 3 || mutation.isPending}
                        onClick={() => mutation.mutate({ status: transition.to, reason: reason.trim() })}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${transition.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'}`}
                      >
                        {mutation.isPending ? 'Applying…' : `Confirm: ${transition.label.toLowerCase()}`}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
