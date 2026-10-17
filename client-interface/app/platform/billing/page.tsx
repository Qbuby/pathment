'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PendingPlanRequest } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { money, RelativeTime, StatusPill } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * The manual-invoice queue: a workspace admin requests a plan from Settings →
 * Plan & Usage; once the invoice is confirmed, activation happens here. The
 * invoice reference is the idempotency key - the same reference can never
 * activate two different things.
 */
function RequestRow({ request }: { request: PendingPlanRequest }) {
  const canBilling = useGate('billing');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const activate = useMutation({
    mutationFn: () => platformApi.billing.activateRequested({
      organizationId: request.organization.id,
      planKey: request.requestedPlan!.key,
      invoiceReference: invoiceReference.trim(),
      periodEnd,
    }),
    onSuccess: (result) => {
      toast.success(result.alreadyActivated
        ? 'That invoice reference had already activated this plan — nothing changed.'
        : `${request.organization.name} is now on ${result.plan}`);
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Activation failed')),
  });

  const price = request.requestedPlan
    ? money(request.billingInterval === 'annual' ? request.requestedPlan.annualPriceCents : request.requestedPlan.monthlyPriceCents, request.requestedPlan.currency)
    : '—';

  return (
    <li className="rounded-3xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/platform/organizations/${request.organization.id}`} className="font-medium hover:underline">
            {request.organization.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">/{request.organization.slug}</span>
            {' · requested '}<RelativeTime date={request.requestedAt} />
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{request.currentPlan?.name || '—'}</span>
          <span aria-hidden>→</span>
          <span className="font-semibold">{request.requestedPlan?.name}</span>
          <span className="tabular-nums text-muted-foreground">{price}/{request.billingInterval === 'annual' ? 'yr' : 'mo'}</span>
          <StatusPill status={request.subscriptionStatus} />
        </div>
        {canBilling ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            {open ? 'Close' : 'Activate…'}
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-3"
          onSubmit={(event) => { event.preventDefault(); if (invoiceReference.trim().length >= 3 && periodEnd) activate.mutate(); }}
        >
          <label className="min-w-[180px] flex-1">
            <span className="text-xs font-medium">Invoice reference</span>
            <input value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} className={inputClass} placeholder="INV-2026-031" />
          </label>
          <label>
            <span className="text-xs font-medium">Invoice coverage ends</span>
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={invoiceReference.trim().length < 3 || !periodEnd || activate.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-700"
          >
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            {activate.isPending ? 'Activating…' : 'Confirm invoice & activate'}
          </button>
          <p className="w-full text-[11px] text-muted-foreground">
            No email or payment is triggered. The reference is the idempotency key: reusing it for anything different is refused.
          </p>
        </form>
      ) : null}
    </li>
  );
}

export default function BillingRequestsPage() {
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.billingRequests,
    queryFn: platformApi.billing.pendingRequests,
    staleTime: STALE.short,
  });

  return (
    <div>
      <PageHeader
        title="Plan requests"
        description="Workspace admins request a plan from their settings; confirmed invoices are activated here."
      />
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : !data?.length ? (
        <EmptyState
          icon={<ReceiptText className="h-8 w-8" aria-hidden />}
          title="No pending requests"
          description="When a workspace admin requests a plan change, it lands here for invoice confirmation."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((request) => <RequestRow key={request.organization.id} request={request} />)}
        </ul>
      )}
    </div>
  );
}
