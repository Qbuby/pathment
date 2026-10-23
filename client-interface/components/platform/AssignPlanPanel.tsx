'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, CalendarClock, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type SubscriptionStatus, type WorkspaceDetail } from '@/lib/services/platform-api';
import { btn, money, SectionCard } from '@/components/platform/primitives';
import { useGate } from '@/components/platform/PlatformShell';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

const inputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * Operator plan assignment: the explicit "move this workspace to another
 * plan" path. It needs no tenant request (unlike invoice activation), but it
 * demands a written reason, pre-flights downgrades against real usage, and is
 * audited as its own action.
 */
export function AssignPlanPanel({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  const canBilling = useGate('billing');
  const queryClient = useQueryClient();
  const subscription = detail.subscription;

  const { data: planCatalog } = useApiQuery({
    queryKey: qk.platform.plans,
    queryFn: platformApi.plans.catalog,
    staleTime: STALE.long,
    enabled: canBilling,
  });
  const activePlans = useMemo(
    () => (planCatalog?.plans || []).filter((plan) => plan.active),
    [planCatalog],
  );

  const [planKey, setPlanKey] = useState('');
  const [interval, setInterval_] = useState<'monthly' | 'annual'>(subscription?.billingInterval || 'monthly');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [overLimitWarning, setOverLimitWarning] = useState<string | null>(null);

  const assign = useMutation({
    mutationFn: () => platformApi.billing.assignPlan(organizationId, {
      planKey, billingInterval: interval,
      periodEnd: periodEnd || null,
      reason: reason.trim(),
      acknowledgeOverLimit: acknowledge,
    }),
    onSuccess: (result) => {
      toast.success(`Plan set to ${result.assigned}`);
      setPlanKey(''); setReason(''); setPeriodEnd(''); setAcknowledge(false); setOverLimitWarning(null);
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onChanged();
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const message = extractApiErrorMessage(error, 'Could not assign the plan');
      // 409 = the usage pre-flight: surface the acknowledgement instead of a dead end.
      if (status === 409) setOverLimitWarning(message);
      else toast.error(message);
    },
  });

  if (!subscription || !canBilling) return null;

  const current = subscription.plan;
  const selected = activePlans.find((plan) => plan.key === planKey) || null;
  const changed = Boolean(selected) && (selected!.key !== current.key || interval !== subscription.billingInterval);

  return (
    <SectionCard
      title="Plan assignment"
      description="Operator-initiated move, independent of the tenant request flow. Audited with your reason."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {activePlans.map((plan) => {
          const isCurrent = plan.key === current.key;
          const isSelected = plan.key === planKey;
          const price = interval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => { setPlanKey(isSelected ? '' : plan.key); setOverLimitWarning(null); setAcknowledge(false); }}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                isSelected ? 'border-brand-500 ring-2 ring-brand-500/30 bg-brand-500/5' : 'border-border hover:border-brand-500/40',
              )}
              aria-pressed={isSelected}
            >
              <p className="flex items-center justify-between text-sm font-semibold">
                {plan.name}
                {isCurrent ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">current</span> : null}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{money(price, plan.currency)}<span className="text-xs font-normal text-muted-foreground">/{interval === 'annual' ? 'yr' : 'mo'}</span></p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <span className="text-xs font-medium">Billing interval</span>
          <div className="mt-1.5 inline-flex rounded-lg border border-border p-0.5">
            {(['monthly', 'annual'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval_(value)}
                className={cn('rounded-md px-3 py-1.5 text-xs font-medium capitalize', interval === value ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="flex items-center gap-1 text-xs font-medium"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Paid until (optional)</span>
          <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className={cn(inputClass, 'w-44')} />
        </label>
      </div>

      {overLimitWarning ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {overLimitWarning}
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="h-4 w-4 rounded border-border" />
            I understand this plan is below current usage — proceed anyway
          </label>
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium" htmlFor="assign-reason">
        Why? <span className="font-normal text-muted-foreground">(required, audited verbatim)</span>
      </label>
      <textarea
        id="assign-reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className={inputClass}
        placeholder={`e.g. "Growth agreed by email with CEO, invoice INV-2026-031 to follow"`}
      />

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => assign.mutate()}
          disabled={!changed || reason.trim().length < 3 || assign.isPending || (Boolean(overLimitWarning) && !acknowledge)}
          className={btn.primarySm}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
          {assign.isPending ? 'Assigning…' : selected ? `Move to ${selected.name}` : 'Pick a plan'}
        </button>
      </div>
    </SectionCard>
  );
}

/** Pause / cancel / reactivate and the subscription's dates. */
export function SubscriptionControls({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  const canBilling = useGate('billing');
  const queryClient = useQueryClient();
  const subscription = detail.subscription;
  const [reason, setReason] = useState('');

  const patch = useMutation({
    mutationFn: (input: Parameters<typeof platformApi.billing.patchSubscription>[1]) =>
      platformApi.billing.patchSubscription(organizationId, input),
    onSuccess: () => {
      toast.success('Subscription updated');
      setReason('');
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onChanged();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the subscription')),
  });

  if (!subscription || !canBilling) return null;

  const transitions: Array<{ label: string; status: SubscriptionStatus; danger?: boolean }> = (
    {
      active: [{ label: 'Pause', status: 'paused' as const, danger: true }, { label: 'Cancel', status: 'cancelled' as const, danger: true }],
      trialing: [{ label: 'Mark active', status: 'active' as const }, { label: 'Cancel', status: 'cancelled' as const, danger: true }],
      past_due: [{ label: 'Mark active', status: 'active' as const }, { label: 'Pause', status: 'paused' as const, danger: true }],
      paused: [{ label: 'Resume', status: 'active' as const }],
      cancelled: [{ label: 'Reactivate', status: 'active' as const }],
    } as Record<SubscriptionStatus, Array<{ label: string; status: SubscriptionStatus; danger?: boolean }>>
  )[subscription.status] || [];

  return (
    <SectionCard title="Subscription state" description="Pause, cancel or reactivate billing. The workspace itself stays reachable; use Lifecycle to lock members out.">
      <label className="block text-xs font-medium" htmlFor="subscription-reason">Reason <span className="font-normal text-muted-foreground">(required)</span></label>
      <input
        id="subscription-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className={inputClass}
        placeholder={`e.g. "Customer paused for the summer cohort break"`}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {transitions.map((transition) => (
          <button
            key={transition.status + transition.label}
            type="button"
            disabled={reason.trim().length < 3 || patch.isPending}
            onClick={() => patch.mutate({ status: transition.status, reason: reason.trim() })}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50',
              transition.danger
                ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10'
                : 'border border-border hover:bg-muted',
            )}
          >
            {transition.label}
          </button>
        ))}
        <button
          type="button"
          disabled={reason.trim().length < 3 || patch.isPending}
          onClick={() => patch.mutate({ cancelAtPeriodEnd: !subscription.cancelAtPeriodEnd, reason: reason.trim() })}
          className={btn.ghostSm}
        >
          {subscription.cancelAtPeriodEnd ? 'Keep renewing' : 'Cancel at period end'}
        </button>
      </div>
    </SectionCard>
  );
}
