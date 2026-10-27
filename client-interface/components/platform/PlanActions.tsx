'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Infinity as InfinityIcon, SlidersHorizontal, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { qk } from '@/lib/query';
import { platformApi, type WorkspaceDetail } from '@/lib/services/platform-api';
import { btn, SectionCard } from '@/components/platform/primitives';
import { useGate } from '@/components/platform/PlatformShell';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { AssignPlanPanel, SubscriptionControls } from '@/components/platform/AssignPlanPanel';
import { cn } from '@/components/ui/utils';
import { entitlementLabel, isEnforcedLimit, isShippedFeature, NOT_ENFORCED_HINT } from '@/lib/config/platform-entitlements';

/**
 * The override editor: per-workspace limits and features layered over the
 * plan. Blank = inherit the plan; a value identical to the plan is pruned
 * server-side, so only real arrangements survive. Every save requires a
 * reason, recorded verbatim in the platform audit trail.
 */
type LimitDraft = { mode: 'inherit' | 'custom' | 'unlimited'; value: string };
type FeatureDraft = 'inherit' | 'on' | 'off';

export function OverridesEditor({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  const canBilling = useGate('billing');
  const queryClient = useQueryClient();
  const subscription = detail.subscription;

  const published = useMemo(() => subscription?.plan?.publishedLimits || {}, [subscription]);
  const currentLimitOverrides = useMemo(() => subscription?.overrides?.limits || {}, [subscription]);
  const planFeatures: Record<string, boolean> = subscription?.plan?.publishedFeatures || subscription?.plan?.features || {};

  const initialLimits = useMemo(() => {
    const draft: Record<string, LimitDraft> = {};
    for (const key of Object.keys({ ...published, ...currentLimitOverrides })) {
      if (key in currentLimitOverrides) {
        const value = currentLimitOverrides[key];
        draft[key] = value < 0 ? { mode: 'unlimited', value: '' } : { mode: 'custom', value: String(value) };
      } else {
        draft[key] = { mode: 'inherit', value: '' };
      }
    }
    return draft;
  }, [published, currentLimitOverrides]);

  const initialFeatures = useMemo(() => {
    const overridesF = subscription?.overrides?.features || {};
    const draft: Record<string, FeatureDraft> = {};
    for (const key of Object.keys(subscription?.plan?.features || {})) {
      draft[key] = key in overridesF ? (overridesF[key] ? 'on' : 'off') : 'inherit';
    }
    return draft;
  }, [subscription]);

  const [limits, setLimits] = useState<Record<string, LimitDraft>>(initialLimits);
  const [features, setFeatures] = useState<Record<string, FeatureDraft>>(initialFeatures);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const limitsPayload: Record<string, number | null> = {};
      for (const [key, draft] of Object.entries(limits)) {
        if (draft.mode === 'inherit') limitsPayload[key] = null;
        else if (draft.mode === 'unlimited') limitsPayload[key] = -1;
        else {
          const parsed = parseInt(draft.value, 10);
          if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`"${key}" needs a whole number`);
          limitsPayload[key] = parsed;
        }
      }
      const featuresPayload: Record<string, boolean | null> = {};
      for (const [key, draft] of Object.entries(features)) {
        featuresPayload[key] = draft === 'inherit' ? null : draft === 'on';
      }
      return platformApi.billing.setOverrides(organizationId, { limits: limitsPayload, features: featuresPayload, reason: reason.trim() });
    },
    onSuccess: () => {
      toast.success('Custom arrangement saved');
      setReason('');
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error && !('response' in error) ? error.message : extractApiErrorMessage(error, 'Could not save overrides')),
  });

  if (!subscription) return null;

  const dirty = JSON.stringify(limits) !== JSON.stringify(initialLimits) || JSON.stringify(features) !== JSON.stringify(initialFeatures);
  const fmt = (value: number | null | undefined) => value == null ? '—' : value < 0 ? '∞' : value.toLocaleString();

  if (!canBilling) {
    return (
      <SectionCard title="Custom arrangement" description="Per-workspace limits and features layered over the plan.">
        <p className="text-sm text-muted-foreground">Editing overrides requires the platform billing or owner role.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Custom arrangement"
      description="Overrides layered over the plan. Inherit = whatever the plan publishes, now and after plan changes."
    >
      <h3 className="text-xs font-semibold text-muted-foreground">Limits</h3>
      <div className="mt-2 space-y-2">
        {Object.keys(initialLimits).map((key) => {
          const draft = limits[key] || { mode: 'inherit', value: '' };
          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="w-44 shrink-0 text-sm">
                {entitlementLabel(key)}
                {!isEnforcedLimit(key) ? <span className="ml-1.5 rounded bg-muted px-1 py-px text-[9px] uppercase text-muted-foreground" title={NOT_ENFORCED_HINT}>not enforced</span> : null}
              </span>
              <span className="w-20 text-xs text-muted-foreground tabular-nums" title="What the plan publishes">plan: {fmt(published[key])}</span>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {(['inherit', 'custom', 'unlimited'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLimits((current) => ({ ...current, [key]: { mode, value: mode === 'custom' ? (current[key]?.value || '') : '' } }))}
                    className={cn('rounded-md px-2 py-1 text-[11px] font-medium capitalize', draft.mode === mode ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {mode === 'unlimited' ? <InfinityIcon className="h-3 w-3" aria-label="Unlimited" /> : mode}
                  </button>
                ))}
              </div>
              {draft.mode === 'custom' ? (
                <input
                  type="number"
                  min={0}
                  value={draft.value}
                  onChange={(event) => setLimits((current) => ({ ...current, [key]: { mode: 'custom', value: event.target.value } }))}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/40"
                  placeholder={String(Math.max(0, published[key] ?? 0))}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <h3 className="mt-5 border-t border-border pt-4 text-xs font-semibold text-muted-foreground">Features</h3>
      <div className="mt-2 space-y-2">
        {Object.keys(initialFeatures).map((key) => {
          const draft = features[key] || 'inherit';
          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="w-44 shrink-0 text-sm">
                {entitlementLabel(key)}
                {!isShippedFeature(key) ? <span className="ml-1.5 rounded bg-muted px-1 py-px text-[9px] uppercase text-muted-foreground" title={NOT_ENFORCED_HINT}>not enforced</span> : null}
              </span>
              <span className="w-20 text-xs text-muted-foreground" title="What the plan publishes">plan: {planFeatures[key] ? 'on' : 'off'}</span>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {(['inherit', 'on', 'off'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFeatures((current) => ({ ...current, [key]: mode }))}
                    className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium capitalize', draft === mode ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {subscription.overrides?.meta?.updatedBy ? (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Last changed by {String(subscription.overrides.meta.updatedBy)}
          {subscription.overrides.meta.reason ? <> — “{String(subscription.overrides.meta.reason)}”</> : null}
        </p>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">
        <label className="block text-xs font-medium" htmlFor="override-reason">
          Why this arrangement? <span className="font-normal text-muted-foreground">(required, audited verbatim)</span>
        </label>
        <textarea
          id="override-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
          placeholder={`e.g. "Enterprise deal: 3000 members on Growth until contract renewal"`}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { setLimits(initialLimits); setFeatures(initialFeatures); setReason(''); }}
            disabled={!dirty}
            className={btn.ghostSm}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Reset
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!dirty || reason.trim().length < 3 || mutation.isPending}
            className={btn.primarySm}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {mutation.isPending ? 'Saving…' : 'Save arrangement'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

export function PlanActions({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <AssignPlanPanel detail={detail} organizationId={organizationId} onChanged={onChanged} />
      <OverridesEditor detail={detail} organizationId={organizationId} onChanged={onChanged} />
      <SubscriptionControls detail={detail} organizationId={organizationId} onChanged={onChanged} />
    </div>
  );
}
