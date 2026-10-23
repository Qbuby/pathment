'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useClan, type ClanLite, type PoolLite } from '@/lib/context/ClanContext';

/**
 * Which place the learner workspace is about: a clan, or a selection pool.
 *
 * A selection-pool candidate used to have a portal of their own at
 * `/candidate/*` — a second sidebar, a second dashboard, a second task list,
 * for a person who is on their way into the very workspace next door. Somebody
 * placed into a clan then had their qualifying round and their clan work in
 * two different shells, and a candidate's settings page did not exist at all.
 *
 * So there is one learner workspace, and the round is a scope inside it,
 * picked the same way a clan is. Everything that only makes sense with a
 * mentor and a roadmap behind it — progress, meetings, the community — is
 * hidden while the scope is a pool, because for a candidate it is not merely
 * empty, it does not exist yet.
 */
export interface MenteeScope {
  /** What the workspace is currently about. */
  kind: 'clan' | 'pool' | 'none';
  /** True while the scope is a selection pool. */
  inPool: boolean;
  /** The chosen pool, when there is one. */
  pool: PoolLite | null;
  /** The chosen clan, when there is one. */
  clan: ClanLite | null;
  /** They are a candidate somewhere — whether or not that is the current scope. */
  isCandidate: boolean;
  /**
   * They are ONLY a candidate: no clan anywhere, so there is no learner
   * workspace to fall back to. What the settings page and the nav use to hide
   * what a mentee has and they do not.
   */
  poolOnly: boolean;
  loading: boolean;
}

export function useMenteeScope(): MenteeScope {
  const { user } = useAuth();
  const { menteeClans, menteePools, menteeActiveClanId, activePool, loading } = useClan();
  const isCandidate = Boolean(user?.capabilities?.includes('candidate'));
  const clan = activePool ? null : menteeClans.find((c) => c.id === menteeActiveClanId) ?? null;

  /*
   * `ClanContext` resolves the scope, so `activePool` is the answer once the
   * memberships and the pools have both arrived. The second clause is the
   * window before they have: somebody with no clan and a round is in the
   * round, and showing them a clan home for a beat first is the flicker this
   * avoids.
   */
  const inPool = Boolean(activePool) || (!clan && !menteeClans.length && menteePools.length > 0);
  const kind: MenteeScope['kind'] = inPool ? 'pool' : (clan || menteeClans.length) ? 'clan' : 'none';

  return {
    kind,
    inPool,
    // With one round there is nothing to disambiguate, so it is the one on
    // screen even before a choice is stored.
    pool: activePool ?? (inPool && menteePools.length === 1 ? menteePools[0] : null),
    clan,
    isCandidate,
    poolOnly: isCandidate && menteeClans.length === 0,
    loading,
  };
}
