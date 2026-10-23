'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users2, Inbox, HandHeart } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { qk, useApiQuery, STALE, useInvalidate } from '@/lib/query';
import { handoverPoolApi, type PoolEntry } from '@/lib/services/handover-pool-api';
import { PoolEntryCard } from '@/components/shared/pool/PoolEntryCard';
import { ClaimDrawer } from '@/components/shared/pool/ClaimDrawer';
import { useConfirm } from '@/lib/context/ConfirmContext';

/**
 * The handover pool, for a mentor.
 *
 * Two lists that look alike and mean opposite things, so they are kept firmly
 * apart rather than merged into one feed with badges: mentees OTHER mentors are
 * handing on, which this mentor can take, and the ones THIS mentor has handed
 * on, which they can still take back. Mixing them would make "Withdraw" and
 * "Take them" sit side by side on rows where only one of them is ever right.
 *
 * The open list is ordered oldest-first by the server, because the useful
 * question is not what arrived last but who has been waiting longest without a
 * mentor.
 */
export default function MentorPoolPage() {
  const { user } = useAuth();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [claiming, setClaiming] = useState<PoolEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: entries, loading, refetch } = useApiQuery({
    queryKey: qk.handoverPool.list('open'),
    queryFn: () => handoverPoolApi.list({ status: 'open' }),
    staleTime: STALE.short,
  });

  const { data: clans } = useApiQuery({
    queryKey: qk.handoverPool.claimableClans,
    queryFn: () => handoverPoolApi.claimableClans(),
    staleTime: STALE.medium,
  });

  const refresh = useCallback(() => {
    invalidate(qk.handoverPool.all);
    return refetch();
  }, [invalidate, refetch]);

  const { theirs, mine } = useMemo(() => {
    const all = entries ?? [];
    return {
      theirs: all.filter((e) => e.pushedBy !== user?.id),
      mine: all.filter((e) => e.pushedBy === user?.id),
    };
  }, [entries, user?.id]);

  const claim = async (toClanId: string) => {
    if (!claiming) return;
    setBusyId(claiming.id);
    try {
      const result = await handoverPoolApi.claim(claiming.id, toClanId);
      const carried = result.carried?.tasks ?? 0;
      toast.success(
        result.freshStart
          ? `${claiming.mentee?.name || 'They'} joined your clan — fresh start on this programme`
          : `${claiming.mentee?.name || 'They'} joined your clan with ${carried} task${carried === 1 ? '' : 's'}`,
      );
      setClaiming(null);
      await refresh();
    } catch (error) {
      /*
       * Losing a race is news, not a user error. Two mentors reaching for the
       * same person is the normal case when a cohort closes, so the message
       * says what happened and the list refreshes to drop the row — rather
       * than leaving a button that will keep failing.
       */
      const message = (error as { message?: string })?.message || 'Could not take this mentee';
      toast.error(message);
      setClaiming(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (entry: PoolEntry) => {
    const ok = await confirm({
      title: 'Withdraw this handover?',
      description: `${entry.mentee?.name || 'They'} will stay in ${entry.fromClan?.name || 'your clan'} and come off the pool. Nothing about their work changes either way.`,
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      await handoverPoolApi.withdraw(entry.id);
      toast.success('Taken off the pool');
      await refresh();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not withdraw');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Handover pool</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mentees whose mentor cannot carry on with them. Take one into your clan and their work
          comes with them — every task as it stands, with what they submitted and the feedback they
          were given.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Inbox className="h-4 w-4" aria-hidden />
              Looking for a clan ({theirs.length})
            </h2>
            {!theirs.length ? (
              <div className="rounded-2xl border border-border bg-card py-12 text-center">
                <Users2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
                <p className="text-sm font-medium text-foreground">Nobody is waiting</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When a mentor hands somebody on, they will appear here for you to pick up.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {theirs.map((entry) => (
                  <PoolEntryCard
                    key={entry.id}
                    entry={entry}
                    busy={busyId === entry.id}
                    onClaim={clans?.length ? setClaiming : undefined}
                  />
                ))}
              </ul>
            )}
          </section>

          {mine.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <HandHeart className="h-4 w-4" aria-hidden />
                Handed on by you ({mine.length})
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                They are still in your clan and still your mentee until somebody takes them.
              </p>
              <ul className="space-y-3">
                {mine.map((entry) => (
                  <PoolEntryCard
                    key={entry.id}
                    entry={entry}
                    busy={busyId === entry.id}
                    onWithdraw={withdraw}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ClaimDrawer
        entry={claiming}
        clans={clans ?? []}
        busy={!!busyId}
        onClose={() => setClaiming(null)}
        onConfirm={claim}
      />
    </div>
  );
}
