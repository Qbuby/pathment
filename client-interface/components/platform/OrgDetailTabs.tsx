'use client';

import { useState } from 'react';
import { Globe, Plug, Bot, MailCheck } from 'lucide-react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type WorkspaceDetail } from '@/lib/services/platform-api';
import { KV, Pager, RelativeTime, SectionCard, StatusPill, UsageMeter, money } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { useDebounce } from '@/lib/hooks/useDebounce';

/** ── Overview ──────────────────────────────────────────────────────────────── */

export function OverviewTab({ detail }: { detail: WorkspaceDetail }) {
  const { organization, usage, memberBreakdown, counts, domains, apps, aiConnections, ownerInvite } = detail;
  const limits = detail.subscription?.plan?.limits || {};
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SectionCard title="Identity" className="lg:col-span-1">
        <dl className="divide-y divide-border">
          <KV label="Name">{organization.name}</KV>
          <KV label="Workspace URL" mono>/w/{organization.slug}</KV>
          <KV label="Status"><StatusPill status={organization.status} /></KV>
          <KV label="Timezone">{organization.timezone}</KV>
          <KV label="Created"><RelativeTime date={organization.createdAt} /></KV>
          <KV label="Provenance">{organization.onboardingSource.replace(/_/g, ' ')}</KV>
          <KV label="Created by">{organization.creator ? `${organization.creator.firstName} ${organization.creator.lastName}` : '—'}</KV>
          {organization.isDemo ? <KV label="Fixture">staging demo workspace</KV> : null}
        </dl>
      </SectionCard>

      <SectionCard title="Usage" description="Against the effective (override-aware) limits." className="lg:col-span-1">
        <div className="space-y-4">
          <UsageMeter used={usage.members} limit={limits.members} label="Members" />
          <UsageMeter used={usage.programs} limit={limits.programs} label="Programs" />
          <UsageMeter used={usage.clans} limit={limits.clans} label="Clans" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
          <p className="text-muted-foreground">Memberships</p>
          <p className="text-right tabular-nums">
            {memberBreakdown.active} active · {memberBreakdown.invited} invited · {memberBreakdown.suspended} suspended
          </p>
          <p className="text-muted-foreground">Enrollments</p>
          <p className="text-right tabular-nums">{counts.enrollments ?? '—'}</p>
          <p className="text-muted-foreground">Programs by status</p>
          <p className="text-right tabular-nums">
            {Object.entries(counts.programsByStatus).map(([status, count]) => `${count} ${status}`).join(' · ') || '—'}
          </p>
        </div>
      </SectionCard>

      <div className="space-y-4 lg:col-span-1">
        {ownerInvite ? (
          <SectionCard title="Owner activation">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-muted p-2"><MailCheck className="h-4 w-4" aria-hidden /></span>
              <div className="flex-1">
                <StatusPill status={ownerInvite.status} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {ownerInvite.status === 'pending' ? <>Expires <RelativeTime date={ownerInvite.expiresAt} /></>
                    : ownerInvite.status === 'used' ? <>Activated <RelativeTime date={ownerInvite.usedAt} /></>
                    : <>Sent <RelativeTime date={ownerInvite.createdAt} /></>}
                </p>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Domains" description="Custom hostnames pointing at this workspace.">
          {domains.length ? (
            <ul className="space-y-2">
              {domains.map((domain) => (
                <li key={domain.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-mono text-xs"><Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{domain.hostname}{domain.isPrimary ? ' ·primary' : ''}</span>
                  <StatusPill status={domain.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">None — served at /w/{organization.slug}.</p>}
        </SectionCard>

        <SectionCard title="Connected apps & AI">
          {apps.length || aiConnections.length ? (
            <ul className="space-y-2">
              {apps.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2"><Plug className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{row.app?.name}</span>
                  <StatusPill status={row.status} />
                </li>
              ))}
              {aiConnections.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{row.label} <span className="text-xs text-muted-foreground">({row.provider}{row.keyMasked ? ` · ${row.keyMasked}` : ''})</span></span>
                  <StatusPill status={row.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing connected.</p>}
        </SectionCard>
      </div>
    </div>
  );
}

/** ── Plan & billing (read view; actions mount beside it) ───────────────────── */

export function PlanSummary({ detail }: { detail: WorkspaceDetail }) {
  const subscription = detail.subscription;
  if (!subscription) return <SectionCard title="Subscription"><p className="text-sm text-muted-foreground">No subscription row — this workspace predates billing.</p></SectionCard>;
  const plan = subscription.plan;
  const published = plan.publishedLimits || plan.limits;
  const effective = plan.limits;
  const overridden = new Set(subscription.overriddenLimits || []);
  const price = subscription.billingInterval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;

  return (
    <SectionCard
      title="Subscription"
      description={`${plan.name} · ${money(price, plan.currency)}/${subscription.billingInterval === 'annual' ? 'yr' : 'mo'} list price`}
      actions={<StatusPill status={subscription.status} />}
    >
      <dl className="divide-y divide-border">
        <KV label="Billing interval">{subscription.billingInterval}</KV>
        <KV label="Provider">{subscription.provider || '—'}</KV>
        <KV label="Current period">
          {subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleDateString() : '—'}
          {' → '}
          {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'open'}
        </KV>
        {subscription.trialEndsAt ? <KV label="Trial ends"><RelativeTime date={subscription.trialEndsAt} /></KV> : null}
        <KV label="Cancels at period end">{subscription.cancelAtPeriodEnd ? 'yes' : 'no'}</KV>
        {subscription.requestedPlan ? (
          <KV label="Requested plan">
            <span className="text-amber-600 dark:text-amber-400">{subscription.requestedPlan.name}</span>
            {' '}<RelativeTime date={subscription.requestedAt} />
          </KV>
        ) : null}
      </dl>

      <h3 className="mt-4 border-t border-border pt-3 text-xs font-semibold text-muted-foreground">Effective limits</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-medium">Limit</th>
            <th className="py-1 font-medium text-right">Plan publishes</th>
            <th className="py-1 font-medium text-right">Enforced here</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys({ ...published, ...effective }).map((key) => {
            const fmt = (value: number | undefined) => value == null ? '—' : value < 0 ? '∞' : value.toLocaleString();
            const isOverridden = overridden.has(key);
            return (
              <tr key={key} className="border-t border-border/60">
                <td className="py-1.5">{key}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(published[key])}</td>
                <td className={`py-1.5 text-right tabular-nums font-medium ${isOverridden ? 'text-violet-600 dark:text-violet-400' : ''}`}>
                  {fmt(effective[key])}{isOverridden ? ' ⚑' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="mt-4 border-t border-border pt-3 text-xs font-semibold text-muted-foreground">Features</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(plan.features || {}).map(([key, enabled]) => (
          <span key={key} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 line-through'}`}>
            {key}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

/** ── People ────────────────────────────────────────────────────────────────── */

export function PeopleTab({ organizationId }: { organizationId: string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const params = { search: debounced || undefined, page, limit: 25 };
  const { data, loading } = useApiQuery({
    queryKey: qk.platform.organizationMembers(organizationId, params),
    queryFn: () => platformApi.organizations.members(organizationId, params),
    staleTime: STALE.short,
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search members…"
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium">Workspace role</th>
                  <th className="px-4 py-2.5 font-medium">Membership</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Account role</th>
                  <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.members || []).map((member) => (
                  <tr key={member.membershipId}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{member.user.firstName} {member.user.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{member.role}</td>
                    <td className="px-4 py-2.5"><StatusPill status={member.status} /></td>
                    <td className="px-4 py-2.5 hidden md:table-cell capitalize text-muted-foreground">{member.user.role}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground"><RelativeTime date={member.user.lastLoginAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.members?.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No members match.</p> : null}
          {data ? <Pager page={data.page} pages={data.pages} onPage={setPage} /> : null}
        </>
      )}
    </div>
  );
}

/** ── Activity (the workspace's own product audit feed) ─────────────────────── */

export function ActivityTab({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(1);
  const { data, loading } = useApiQuery({
    queryKey: qk.platform.organizationAudit(organizationId, page),
    queryFn: () => platformApi.organizations.audit(organizationId, { page, limit: 50 }),
    staleTime: STALE.short,
  });

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {(data?.entries || []).map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">{entry.action.replace(/_/g, ' ').toLowerCase()} <span className="text-xs text-muted-foreground">· {entry.entityType}</span></p>
              <p className="truncate text-xs text-muted-foreground">{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'system'}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground"><RelativeTime date={entry.createdAt} /></span>
          </li>
        ))}
      </ul>
      {!data?.entries?.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No activity recorded.</p> : null}
      {data ? <Pager page={data.page} pages={data.pages} onPage={setPage} /> : null}
    </div>
  );
}
