'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Loader2, MailCheck, Rocket } from 'lucide-react';
import { qk, useApiQuery, STALE, useInvalidate } from '@/lib/query';
import { platformApi, type PlatformPlan, type ProvisionInput, type ProvisionResult } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { money, SectionCard } from '@/components/platform/primitives';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

/**
 * Operator-assisted provisioning: workspace → plan → owner → review.
 *
 * The owner never receives a password. A new account gets a single-use
 * activation link (they choose their own password); an existing account is
 * attached as owner and simply told where the new workspace lives.
 */
const STEPS = ['Workspace', 'Plan', 'Owner', 'Review'] as const;

const slugify = (value: string) => value.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 63);

function timezoneOptions(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') || [];
  } catch { return []; }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40';

function ProvisionWizard() {
  const params = useSearchParams();
  const canProvision = useGate('billing');
  const invalidate = useInvalidate();
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<ProvisionInput>({
    name: params.get('name') || '',
    slug: slugify(params.get('name') || ''),
    timezone: 'UTC',
    planKey: params.get('plan') || '',
    billingInterval: 'monthly',
    trialDays: 0,
    owner: {
      email: params.get('email') || '',
      firstName: params.get('first') || '',
      lastName: params.get('last') || '',
    },
    leadId: params.get('lead') || undefined,
    reason: '',
  });
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const { data: plans } = useApiQuery({
    queryKey: qk.platform.plans,
    queryFn: platformApi.plans.list,
    staleTime: STALE.long,
  });
  const activePlans = useMemo(() => (plans || []).filter((plan) => plan.active), [plans]);

  // Derived, not synced: the first active plan is the default until a pick is made.
  const planKey = form.planKey || activePlans[0]?.key || '';

  const debouncedSlug = useDebounce(form.slug, 350);
  const { data: slugCheck, fetching: slugChecking } = useApiQuery({
    queryKey: qk.platform.slugCheck(debouncedSlug),
    queryFn: () => platformApi.provisioning.checkSlug(debouncedSlug),
    enabled: debouncedSlug.length >= 1,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: (input: ProvisionInput) => platformApi.provisioning.provision(input),
    onSuccess: (provisioned) => {
      setResult(provisioned);
      invalidate(qk.platform.all);
    },
  });

  const selectedPlan = activePlans.find((plan) => plan.key === planKey);
  const timezones = useMemo(() => timezoneOptions(), []);

  const stepValid = [
    form.name.trim().length >= 2 && Boolean(slugCheck?.available),
    Boolean(selectedPlan),
    /.+@.+\..+/.test(form.owner.email) && form.owner.firstName.trim().length > 0 && form.owner.lastName.trim().length > 0,
    true,
  ][step];

  if (!canProvision) {
    return (
      <SectionCard title="Provision a workspace">
        <p className="text-sm text-muted-foreground">Provisioning requires the platform billing or owner role.</p>
      </SectionCard>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            {result.activation === 'email_sent' ? <MailCheck className="h-7 w-7" aria-hidden /> : <CircleCheck className="h-7 w-7" aria-hidden />}
          </span>
          <h2 className="mt-4 text-lg font-semibold">{result.organization.name} is live</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.activation === 'email_sent'
              ? <>An activation link was emailed to <strong>{result.owner.email}</strong>. It works once and expires in 72 hours — they choose their own password; no credentials were sent.</>
              : <>{result.owner.email} already had a Pathment account, so it was attached as owner and notified. They sign in with their existing credentials.</>}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={`/platform/organizations/${result.organization.id}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Open workspace record
            </Link>
            <button
              type="button"
              onClick={() => { setResult(null); setStep(0); setForm((current) => ({ ...current, name: '', slug: '', owner: { email: '', firstName: '', lastName: '' }, reason: '', leadId: undefined })); }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Provision another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
              index < step ? 'bg-brand-600 text-white' : index === step ? 'bg-brand-500/15 text-brand-600 ring-1 ring-brand-500' : 'bg-muted text-muted-foreground',
            )}>
              {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={cn('hidden text-xs sm:block', index === step ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
            {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border border-border bg-card p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <Field label="Organization name">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({
                  ...current, name: event.target.value,
                  slug: slugTouched ? current.slug : slugify(event.target.value),
                }))}
                className={inputClass}
                placeholder="Acme Fellowship"
                autoFocus
              />
            </Field>
            <Field label="Workspace URL" hint="Lowercase letters, numbers and single hyphens.">
              <div className="relative mt-1.5 flex items-center">
                <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">app.pathment.me/w/</span>
                <input
                  value={form.slug}
                  onChange={(event) => { setSlugTouched(true); setForm((current) => ({ ...current, slug: slugify(event.target.value) })); }}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-[150px] pr-9 text-sm outline-none focus:ring-2 focus:ring-brand-500/40 font-mono"
                  placeholder="acme"
                />
                <span className="absolute right-3">
                  {slugChecking ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                    : !form.slug ? null
                    : slugCheck?.available ? <CircleCheck className="h-4 w-4 text-emerald-500" aria-label="Available" />
                    : <CircleX className="h-4 w-4 text-red-500" aria-label="Unavailable" />}
                </span>
              </div>
              {form.slug && slugCheck && !slugCheck.available ? (
                <span className="mt-1 block text-[11px] text-red-500">
                  {slugCheck.reason === 'taken' ? 'That workspace URL is already in use.' : 'That URL is reserved or invalid.'}
                </span>
              ) : null}
            </Field>
            <Field label="Timezone" hint="The workspace default; members keep their own.">
              <input list="platform-timezones" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className={inputClass} />
              <datalist id="platform-timezones">
                {timezones.map((zone) => <option key={zone} value={zone} />)}
              </datalist>
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {activePlans.map((plan: PlatformPlan) => {
                const selected = plan.key === planKey;
                const price = form.billingInterval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, planKey: plan.key }))}
                    className={cn('rounded-xl border p-4 text-left transition-colors', selected ? 'border-brand-500 ring-2 ring-brand-500/30 bg-brand-500/5' : 'border-border hover:border-brand-500/40')}
                    aria-pressed={selected}
                  >
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{money(price, plan.currency)}<span className="text-xs font-normal text-muted-foreground">/{form.billingInterval === 'annual' ? 'yr' : 'mo'}</span></p>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {['members', 'programs', 'clans'].map((key) => `${plan.limits[key] == null ? '—' : plan.limits[key] < 0 ? '∞' : plan.limits[key]} ${key}`).join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Billing interval">
                <div className="mt-1.5 inline-flex rounded-lg border border-border p-0.5">
                  {(['monthly', 'annual'] as const).map((interval) => (
                    <button
                      key={interval}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, billingInterval: interval }))}
                      className={cn('rounded-md px-3 py-1.5 text-xs font-medium capitalize', form.billingInterval === interval ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {interval}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Trial days" hint="0 starts the subscription as active immediately.">
                <input
                  type="number" min={0} max={365}
                  value={form.trialDays}
                  onChange={(event) => setForm((current) => ({ ...current, trialDays: Math.max(0, Math.min(365, parseInt(event.target.value, 10) || 0)) }))}
                  className={cn(inputClass, 'w-28')}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <Field label="Owner email" hint="An existing Pathment account is attached as owner; a new one gets a single-use activation link to choose its own password.">
              <input
                type="email"
                value={form.owner.email}
                onChange={(event) => setForm((current) => ({ ...current, owner: { ...current.owner, email: event.target.value } }))}
                className={inputClass}
                placeholder="founder@acme.org"
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <input value={form.owner.firstName} onChange={(event) => setForm((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} className={inputClass} />
              </Field>
              <Field label="Last name">
                <input value={form.owner.lastName} onChange={(event) => setForm((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} className={inputClass} />
              </Field>
            </div>
            <Field label="Note (optional)" hint="Recorded in the platform audit trail, e.g. a deal or ticket reference.">
              <textarea rows={2} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={inputClass} placeholder="Signed via enterprise enquiry #142" />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <dl className="divide-y divide-border rounded-xl border border-border">
              {[
                ['Workspace', `${form.name} — /w/${form.slug}`],
                ['Timezone', form.timezone],
                ['Plan', selectedPlan ? `${selectedPlan.name} · ${money(form.billingInterval === 'annual' ? selectedPlan.annualPriceCents : selectedPlan.monthlyPriceCents, selectedPlan.currency)}/${form.billingInterval === 'annual' ? 'yr' : 'mo'}${form.trialDays ? ` · ${form.trialDays}-day trial` : ''}` : '—'],
                ['Owner', `${form.owner.firstName} ${form.owner.lastName} <${form.owner.email}>`],
                ['Credentials', 'Single-use activation link emailed to the owner (no password is ever sent).'],
                ...(form.reason ? [['Note', form.reason]] : []),
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-start justify-between gap-6 px-4 py-2.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xs text-right">{value}</dd>
                </div>
              ))}
            </dl>
            {mutation.isError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {extractApiErrorMessage(mutation.error, 'Provisioning failed')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || mutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-40 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={!stepValid}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-brand-700"
            >
              Continue <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mutation.mutate({ ...form, planKey, reason: form.reason || undefined, leadId: form.leadId || undefined })}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-brand-700"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />}
              {mutation.isPending ? 'Provisioning…' : 'Provision workspace'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProvisionPage() {
  return (
    <div>
      <PageHeader title="Provision a workspace" description="Create a customer workspace, choose its plan, and invite its owner." />
      <Suspense fallback={null}>
        <ProvisionWizard />
      </Suspense>
    </div>
  );
}
