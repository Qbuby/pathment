'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldX, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformAdminRow, type PlatformRole } from '@/lib/services/platform-api';
import { PageHeader, usePlatform } from '@/components/platform/PlatformShell';
import { RelativeTime, SectionCard } from '@/components/platform/primitives';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const ROLE_OPTIONS: Array<{ value: PlatformRole; label: string; description: string }> = [
  { value: 'owner', label: 'Owner', description: 'Everything, including this page' },
  { value: 'billing', label: 'Billing', description: 'Plans, subscriptions, overrides, provisioning' },
  { value: 'support', label: 'Support', description: 'Read everything + account support actions' },
  { value: 'readonly', label: 'Read-only', description: 'Sees everything, changes nothing' },
];

function AdminRow({ admin, selfId }: { admin: PlatformAdminRow; selfId: string }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.platform.all });
  const isSelf = admin.userId === selfId;

  const update = useMutation({
    mutationFn: (role: PlatformRole) => platformApi.admins.update(admin.id, { role }),
    onSuccess: () => { toast.success('Role updated'); refresh(); },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the role')),
  });
  const revoke = useMutation({
    mutationFn: () => platformApi.admins.revoke(admin.id),
    onSuccess: () => { toast.success('Access revoked'); refresh(); },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not revoke access')),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {admin.user ? `${admin.user.firstName} ${admin.user.lastName}` : admin.userId}
          {isSelf ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">you</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {admin.user?.email} · granted <RelativeTime date={admin.createdAt} />
          {admin.lastSeenAt ? <> · last seen <RelativeTime date={admin.lastSeenAt} /></> : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <SelectMenu
          value={admin.role}
          onChange={(value) => update.mutate(value as PlatformRole)}
          options={ROLE_OPTIONS}
          ariaLabel={`Role for ${admin.user?.email}`}
          className="w-36"
          disabled={isSelf || update.isPending}
        />
        <button
          type="button"
          disabled={isSelf || revoke.isPending}
          onClick={() => revoke.mutate()}
          className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:hover:bg-red-500/10"
          title={isSelf ? 'You cannot revoke your own access' : undefined}
        >
          <ShieldX className="h-3.5 w-3.5" aria-hidden /> Revoke
        </button>
      </div>
    </li>
  );
}

export default function PlatformAdminsPage() {
  const me = usePlatform();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('support');

  const { data: admins, loading } = useApiQuery({
    queryKey: qk.platform.admins(false),
    queryFn: () => platformApi.admins.list(false),
    staleTime: STALE.short,
  });

  const grant = useMutation({
    mutationFn: () => platformApi.admins.grant({ email: email.trim().toLowerCase(), role }),
    onSuccess: (admin) => {
      toast.success(`${admin.user?.email || 'Account'} is now platform ${admin.role}`);
      setEmail('');
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not grant access')),
  });

  return (
    <div>
      <PageHeader
        title="Platform admins"
        description="Who can open this console, and at which tier. Orthogonal to every workspace role by design."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Operators" className="lg:col-span-2">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <ul className="divide-y divide-border">
              {(admins || []).map((admin) => <AdminRow key={admin.id} admin={admin} selfId={me.user.id} />)}
              {!admins?.length ? (
                <p className="py-3 text-sm text-muted-foreground">
                  No granted operators yet — access is running on the PLATFORM_ADMIN_EMAILS bootstrap list.
                </p>
              ) : null}
            </ul>
          )}
          {me.via === 'env' ? (
            <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              You are here via the PLATFORM_ADMIN_EMAILS bootstrap. Grant yourself a real row so access survives an env change.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Grant access" description="The account must already exist on Pathment.">
          <form onSubmit={(event) => { event.preventDefault(); if (/.+@.+\..+/.test(email)) grant.mutate(); }}>
            <label className="block">
              <span className="text-xs font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="person@pathment.me"
              />
            </label>
            <div className="mt-3">
              <span className="text-xs font-medium">Tier</span>
              <div className="mt-1.5 space-y-1.5">
                {ROLE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/5">
                    <input
                      type="radio"
                      name="platform-role"
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={!/.+@.+\..+/.test(email) || grant.isPending}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-brand-700"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              {grant.isPending ? 'Granting…' : 'Grant access'}
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
