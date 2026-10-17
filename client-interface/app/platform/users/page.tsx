'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, MailWarning, Search, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformUserDetail } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { RelativeTime, SectionCard, StatusPill } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

/**
 * Account-level support: the actions the product deliberately denies to
 * workspace admins (403s by design), because one account can belong to many
 * workspaces. Everything here acts on the ACCOUNT, not a membership.
 */
function AccountActions({ user, onChanged }: { user: PlatformUserDetail; onChanged: () => void }) {
  const canLifecycle = useGate('lifecycle');
  const [reason, setReason] = useState('');

  const run = useMutation({
    mutationFn: async (action: 'signOut' | 'suspend' | 'reactivate' | 'reset2fa' | 'unsuppress') => {
      const note = reason.trim() || undefined;
      if (action === 'signOut') return platformApi.users.forceSignOut(user.id, note);
      if (action === 'suspend') return platformApi.users.setStatus(user.id, { status: 'suspended', reason: reason.trim() });
      if (action === 'reactivate') return platformApi.users.setStatus(user.id, { status: 'active', reason: reason.trim() });
      if (action === 'reset2fa') return platformApi.users.resetTwoFactor(user.id, note);
      return platformApi.users.unsuppressEmail(user.id, note);
    },
    onSuccess: () => { toast.success('Done'); setReason(''); onChanged(); },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Action failed')),
  });

  const needsReason = reason.trim().length < 3;
  const button = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40';

  return (
    <div className="border-t border-border pt-3">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required for account actions, audited verbatim)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/40"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={run.isPending || needsReason || user.activeSessions === 0} onClick={() => run.mutate('signOut')} className={cn(button, 'border-border hover:bg-muted')}>
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out everywhere ({user.activeSessions})
        </button>
        {user.twoFactorEnabled ? (
          <button type="button" disabled={run.isPending || needsReason} onClick={() => run.mutate('reset2fa')} className={cn(button, 'border-border hover:bg-muted')}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden /> Reset 2FA
          </button>
        ) : null}
        {user.suppressedEmail ? (
          <button type="button" disabled={run.isPending || needsReason} onClick={() => run.mutate('unsuppress')} className={cn(button, 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10')}>
            <MailWarning className="h-3.5 w-3.5" aria-hidden /> Unsuppress email
          </button>
        ) : null}
        {canLifecycle ? (
          user.status === 'suspended' ? (
            <button type="button" disabled={run.isPending || needsReason} onClick={() => run.mutate('reactivate')} className={cn(button, 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10')}>
              <UserCheck className="h-3.5 w-3.5" aria-hidden /> Reinstate account
            </button>
          ) : (
            <button type="button" disabled={run.isPending || needsReason || Boolean(user.platformRole)} onClick={() => run.mutate('suspend')} className={cn(button, 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10')} title={user.platformRole ? 'Revoke the platform role first' : undefined}>
              <UserX className="h-3.5 w-3.5" aria-hidden /> Suspend account
            </button>
          )
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Account actions, not workspace ones: suspension locks this person out of every workspace at once.
      </p>
    </div>
  );
}

function AccountCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: user, loading } = useApiQuery({
    queryKey: qk.platform.user(userId),
    queryFn: () => platformApi.users.detail(userId),
    staleTime: STALE.short,
  });

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!user) return null;

  return (
    <SectionCard
      title={`${user.firstName} ${user.lastName}`}
      description={user.email}
      actions={(
        <div className="flex items-center gap-2">
          {user.platformRole ? <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-600 ring-1 ring-inset ring-brand-500/30">platform {user.platformRole}</span> : null}
          <StatusPill status={user.status} />
        </div>
      )}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Account role</dt><dd className="font-medium capitalize">{user.role}</dd></div>
        <div><dt className="text-muted-foreground">Email verified</dt><dd className="font-medium">{user.emailVerified ? 'yes' : 'no'}</dd></div>
        <div><dt className="text-muted-foreground">Two-factor</dt><dd className="font-medium">{user.twoFactorEnabled ? 'enabled' : 'off'}</dd></div>
        <div><dt className="text-muted-foreground">Last sign-in</dt><dd className="font-medium"><RelativeTime date={user.lastLoginAt} /></dd></div>
      </dl>

      {user.suppressedEmail ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Email suppressed ({user.suppressedEmail.reason}) <RelativeTime date={user.suppressedEmail.since} /> — this address receives no mail.
        </p>
      ) : null}

      <h3 className="mt-4 text-xs font-semibold text-muted-foreground">Memberships</h3>
      <ul className="mt-1.5 divide-y divide-border">
        {user.memberships.map((membership) => (
          <li key={membership.organizationId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              {membership.organization ? (
                <Link href={`/platform/organizations/${membership.organization.id}`} className="text-sm font-medium hover:underline">
                  {membership.organization.name}
                </Link>
              ) : <span className="text-sm">unknown workspace</span>}
              <span className="ml-2 text-xs capitalize text-muted-foreground">{membership.role}</span>
            </div>
            <StatusPill status={membership.status} />
          </li>
        ))}
        {!user.memberships.length ? <p className="py-2 text-xs text-muted-foreground">No workspace memberships.</p> : null}
      </ul>

      <div className="mt-4">
        <AccountActions user={user} onChanged={() => queryClient.invalidateQueries({ queryKey: qk.platform.user(userId) })} />
      </div>
    </SectionCard>
  );
}

export default function UserLookupPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const debounced = useDebounce(query.trim(), 350);

  const { data: hits, fetching } = useApiQuery({
    queryKey: qk.platform.users(debounced),
    queryFn: () => platformApi.users.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: STALE.short,
  });

  return (
    <div>
      <PageHeader title="User lookup" description="One account, every workspace it belongs to — and the account-level actions nobody else can perform." />

      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelected(null); }}
          placeholder="Search by email or name (min 2 characters)…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
          autoFocus
        />
        {fetching ? <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size="sm" /></span> : null}
      </label>

      {debounced.length >= 2 && hits ? (
        <ul className="mt-4 max-w-xl divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => setSelected(hit.id)}
                className={cn('flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50', selected === hit.id && 'bg-brand-500/5')}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{hit.firstName} {hit.lastName}</p>
                  <p className="truncate text-xs text-muted-foreground">{hit.email} · {hit.memberships.length} workspace{hit.memberships.length === 1 ? '' : 's'}</p>
                </div>
                <StatusPill status={hit.status} />
              </button>
            </li>
          ))}
          {!hits.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts match.</li> : null}
        </ul>
      ) : null}

      {selected ? <div className="mt-4 max-w-3xl"><AccountCard userId={selected} /></div> : null}
    </div>
  );
}
