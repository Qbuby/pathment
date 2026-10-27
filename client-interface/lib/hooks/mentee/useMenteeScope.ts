'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useClan, type ClanLite, type PoolLite } from '@/lib/context/ClanContext';
import { poolIdOf } from '@/lib/utils/clan-selection';

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
  /**
   * The scope is still being worked out — the memberships, or a candidate's
   * rounds, have not come back yet.
   *
   * Anything that renders a DIFFERENT screen per scope has to wait for this.
   * The clan home and the round are not two views of one thing: mounting the
   * clan home for a candidate fires a handful of requests about an enrollment
   * they do not have, and the first of those to fail takes the page down with
   * it — which is exactly how "This Week" broke for somebody who was in two
   * clans and a round at once.
   */
  loading: boolean;
}

export function useMenteeScope(): MenteeScope {
  const { user } = useAuth();
  const { menteeClans, menteePools, menteeScope, menteeActiveClanId, activePool, scopeReady } = useClan();
  const isCandidate = Boolean(user?.capabilities?.includes('candidate'));
  /*
   * The SCOPE decides, not the pool object. `activePool` only resolves once
   * the rounds have been fetched, so reading it alone left a window where
   * somebody whose stored scope was a round, and who also has clans, looked
   * like an ordinary mentee with no clan selected — long enough for the clan
   * home to mount and start asking the server clan questions.
   */
  const poolId = poolIdOf(menteeScope);
  const clan = poolId ? null : menteeClans.find((c) => c.id === menteeActiveClanId) ?? null;

  /*
   * The second clause covers somebody who has never picked anything: no clan
   * anywhere and a round open means they are in the round, so the workspace
   * opens there rather than on a clan home with nothing in it.
   */
  const inPool = Boolean(poolId) || (!clan && !menteeClans.length && menteePools.length > 0);
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
    loading: !scopeReady,
  };
}
