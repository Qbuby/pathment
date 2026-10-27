'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';
import { resolveMentorClan, resolveMenteeClan, poolIdOf, poolScope } from '@/lib/utils/clan-selection';
import { candidateApi, type CandidatePoolSummary } from '@/lib/services/pool-api';
import { readClanChoice, writeClanChoice } from '@/lib/services/clan-choice';

// Clan roles that mean "I mentor this clan" (so it belongs in the scope picker).
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
export const ALL_CLANS = 'all';

export interface ClanLite { id: string; name: string; avatarUrl?: string | null; kind?: 'cohort' | 'standing'; frozenAt?: string | null; programId?: string; programName?: string | null; }

/**
 * A selection pool the signed-in person is a candidate in.
 *
 * It belongs in this context, beside their clans, because it is the same
 * question: which place is the learner workspace about right now? A candidate
 * with no clan has exactly one answer, and a candidate who was placed into a
 * clan and is in a second round has two.
 */
export interface PoolLite {
  id: string;
  name: string;
  avatarUrl?: string | null;
  programName?: string | null;
  status: CandidatePoolSummary['pool']['status'];
  /** Set once there is an outcome — the round is over for them. */
  decided: boolean;
}

export { poolIdOf, poolScope };

/** Cohort clans become historical after formal program close. Standing clans stay writable. */
export function isHistoricalCohortClan(clan?: Pick<ClanLite, 'kind' | 'frozenAt'> | null): boolean {
  return Boolean(clan && clan.kind !== 'standing' && clan.frozenAt);
}

/**
 * Resolve the clan the mentor UI should treat as selected.
 * Single-clan mentors often keep `activeClanId === 'all'` because the picker is hidden —
 * map that to the only clan so historical / standing checks still work.
 */
export function resolveActiveMentorClan(clans: ClanLite[], activeClanId: string): ClanLite | null {
  if (!clans.length) return null;
  if (activeClanId !== ALL_CLANS) return clans.find((c) => c.id === activeClanId) ?? null;
  return clans.length === 1 ? clans[0] : null;
}

/** True when the current mentor scope is fully historical (no writable cohort work). */
export function isHistoricalMentorScope(clans: ClanLite[], activeClanId: string): boolean {
  if (activeClanId !== ALL_CLANS) {
    return isHistoricalCohortClan(clans.find((c) => c.id === activeClanId) ?? null);
  }
  // "All clans": read-only only when every mentored clan is historical (or there are none writable).
  return clans.length > 0 && clans.every((c) => isHistoricalCohortClan(c));
}

/**
 * Whether mentor writes are locked for a row when the sidebar picker is set.
 * - Specific clan selected → whole scope follows that clan (frozen cohort = locked).
 * - All clans → lock per row from the item's clan (Standee writable; frozen cohort not).
 *   Missing item clanId fails closed under All clans so we never guess.
 */
export function isMentorWriteLockedForClan(
  clans: ClanLite[],
  activeClanId: string,
  itemClanId?: string | null,
): boolean {
  if (activeClanId !== ALL_CLANS) {
    return isHistoricalCohortClan(clans.find((c) => c.id === activeClanId) ?? null);
  }
  if (!itemClanId) return true;
  return isHistoricalCohortClan(clans.find((c) => c.id === itemClanId) ?? null);
}

interface ClanContextValue {
  /** Clans the current user mentors (drives the mentor scope selector). */
  clans: ClanLite[];
  /** 'all' (merged view) or a specific clan id. Mentor workspace only. */
  activeClanId: string;
  setActiveClanId: (id: string) => void;
  /** Clans the current user is a mentee of. */
  menteeClans: ClanLite[];
  /** Selection pools they are a candidate in. */
  menteePools: PoolLite[];
  /**
   * The learner workspace's scope as the picker holds it: a clan id, or
   * `pool:<id>`. Never 'all'. Empty string while unknown.
   */
  menteeScope: string;
  setMenteeScope: (value: string) => void;
  /**
   * The learner's clan — and only ever a clan. Empty string in pool scope.
   *
   * This is deliberately NOT the picker's value. Two dozen call sites pass it
   * to the server as a clan id or match it against `clan.id`, and a selection
   * pool is neither: sending `pool:<id>` where a clan is expected made the
   * server discard it as malformed and answer as though no clan had been
   * chosen, which for a learner who is in more than one clan is a 400 rather
   * than an answer. Pool scope has no clan, and says so.
   */
  menteeActiveClanId: string;
  /** The chosen pool, when the scope is one. Null in a clan. */
  activePool: PoolLite | null;
  /**
   * The memberships AND, for a candidate, the pools have both been answered,
   * so the scope is the real one rather than a guess. Anything that renders a
   * different screen per scope has to wait for this or it will mount the clan
   * home for a candidate and then swap it out.
   */
  scopeReady: boolean;
  loading: boolean;
}

const ClanContext = createContext<ClanContextValue | undefined>(undefined);

const EMPTY_MEMBERSHIPS = { mentor: [] as ClanLite[], mentee: [] as ClanLite[] };
const EMPTY_POOLS_RAW: CandidatePoolSummary[] = [];

export function ClanProvider({ children }: { children: ReactNode }) {
  const { user, availableRoles } = useAuth();
  /**
   * What they last CHOSE — not what is currently in effect.
   *
   * Keeping the choice and the effective clan apart is what makes this
   * survivable. The choice is the only thing worth storing; the clan actually
   * in effect is derived from it and the memberships, so a selection that no
   * longer exists resolves itself on the next render instead of needing an
   * effect to notice and repair it.
   *
   * `null` means "not read yet". It cannot be seeded from localStorage in a
   * `useState` initializer because this provider is server-rendered too, and
   * the server has no localStorage — the two renders would disagree and React
   * would throw a hydration mismatch.
   */
  const [mentorChoice, setMentorChoice] = useState<string | null>(null);
  const [menteeChoice, setMenteeChoice] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const isMentor = !!availableRoles?.includes('mentor');
  const isMentee = !!availableRoles?.includes('mentee');
  // `candidate` is its own capability: somebody can hold it with no clan at
  // all (they have never been placed) or alongside one (a second round).
  const isCandidate = !!user?.capabilities?.includes('candidate');

  /**
   * Whether this account has any clan memberships worth asking about.
   *
   * A selection-pool candidate who has never been placed holds neither
   * `mentor` nor `mentee`, so the memberships query below never runs — and
   * `loadedMemberships` then stays `undefined` for the whole session. Read as
   * "we have not been told yet", that leaves their scope permanently
   * unsettled, so a pool choice is never resolved and the picker shows
   * nothing. "Nobody to ask" is settled knowledge, not a pending request.
   */
  const wantsMemberships = !!userId && (isMentor || isMentee);

  const { data: loadedMemberships, loading } = useApiQuery<{ mentor: ClanLite[]; mentee: ClanLite[] }>({
    queryKey: qk.clan.memberships(user?.id || ''),
    queryFn: async () => {
      const r = await clanApi.myMemberships() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows = r?.data?.memberships ?? r?.memberships ?? [];
      const mentorSeen = new Set<string>();
      const menteeSeen = new Set<string>();
      const mentor: ClanLite[] = [];
      const mentee: ClanLite[] = [];
      for (const m of rows) {
        const c = m.clan;
        if (!c) continue;
        if (MENTOR_CLAN_ROLES.includes(m.role) && !mentorSeen.has(c.id)) {
          mentorSeen.add(c.id);
          mentor.push({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, kind: c.kind, frozenAt: c.frozenAt, programId: c.programId, programName: c.program?.name ?? null });
        }
        if (m.role === 'mentee' && (m.status === 'active' || m.status === 'paused') && !menteeSeen.has(c.id)) {
          menteeSeen.add(c.id);
          mentee.push({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, kind: c.kind, frozenAt: c.frozenAt, programId: c.programId, programName: c.program?.name ?? null });
        }
      }
      const activeFirst = (a: ClanLite, b: ClanLite) => Number(!!a.frozenAt) - Number(!!b.frozenAt) || a.name.localeCompare(b.name);
      return { mentor: mentor.sort(activeFirst), mentee: mentee.sort(activeFirst) };
    },
    enabled: wantsMemberships,
    staleTime: STALE.long,
  });

  /**
   * The pools they are a candidate in.
   *
   * A separate query from the memberships because it is a separate capability
   * — asking for it on every mentee's behalf would be a request per page load
   * that answers "none" for everybody who is simply in a clan.
   */
  /*
   * The SERVER's shape, cached under the server's key, and narrowed here.
   *
   * This used to fetch under `qk.candidate.pools` with a queryFn that returned
   * the picker rows instead. The candidate's own round screen reads the same
   * key expecting what the endpoint actually returns, and a query key is one
   * cache entry: whichever of the two mounted first decided what the other
   * one got. This provider is in the layout, so it always won, and the round
   * screen read picker rows, found no `pool` on them and took the page down.
   * One key, one shape - the narrowing happens after the cache, not inside it.
   */
  const { data: loadedPools } = useApiQuery<CandidatePoolSummary[]>({
    queryKey: qk.candidate.pools,
    queryFn: candidateApi.pools,
    enabled: !!user?.id && isCandidate,
    staleTime: STALE.long,
  });
  const menteePools = useMemo<PoolLite[]>(
    () => (loadedPools ?? EMPTY_POOLS_RAW).map((r) => ({
      id: r.pool.id,
      name: r.pool.name,
      avatarUrl: r.pool.avatarUrl ?? null,
      programName: r.pool.program?.name ?? null,
      status: r.pool.status,
      decided: Boolean(r.outcome),
    })),
    [loadedPools],
  );

  /**
   * Has the server actually told us which clans this person is in?
   *
   * `loading` is NOT that question. It is false while the query is still
   * disabled — before `availableRoles` has arrived — and at that moment the
   * clan list is an empty array that means "not asked yet", not "none". Reading
   * it as "none" made the resolver decide the saved clan no longer existed and
   * replace it with "All clans", which the persist effect below then wrote to
   * storage. That is what erased the selection on every sign-in.
   */
  const clansKnown = loadedMemberships !== undefined || (!!user && !wantsMemberships);
  const data = loadedMemberships ?? EMPTY_MEMBERSHIPS;
  const clans = data.mentor;
  const menteeClans = data.mentee;

  /**
   * Read the stored choices once the account is known.
   *
   * This is the only `setState` in an effect here, and it is unavoidable: the
   * value lives in localStorage, which does not exist during the server render.
   *
   * It re-runs when the account changes because the keys are per account. That
   * is also what makes switching users safe without deleting anything: a second
   * account reads its own key and finds its own clan, or nothing.
   */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage does not
       exist during the server render, so this value cannot be seeded in a
       `useState` initializer without a hydration mismatch. One pass per account. */
    setMentorChoice(userId ? readClanChoice('mentor', userId) : null);
    setMenteeChoice(userId ? readClanChoice('mentee', userId) : null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId]);

  /**
   * The clan actually in effect.
   *
   * Derived, so there is no window where the picker shows something the data
   * does not match. The old code decided this in an effect that ran before the
   * memberships had loaded, so every visit began on "All clans" for a beat and
   * anything reading the scope in that beat read the wrong one.
   *
   * An explicit "all" is honoured — it is a real choice, and the Approvals and
   * Mentees screens offer it by name. Having chosen NOTHING is a different
   * thing, and it now opens a clan they can work in rather than a merged view
   * of every clan they mentor, which is a reporting lens and a strange place to
   * start a day.
   */
  const activeClanId = useMemo(
    () => resolveMentorClan(mentorChoice, clans, !clansKnown),
    [mentorChoice, clans, clansKnown],
  );
  const poolIds = useMemo(() => menteePools.map((p) => p.id), [menteePools]);
  /** True once we know both which clans they are in and which rounds, if any. */
  const scopeReady = clansKnown && !(isCandidate && loadedPools === undefined);
  const menteeScope = useMemo(
    // A candidate's pools are not loaded yet while `isCandidate` is unknown,
    // so "unsettled" covers them too — otherwise a stored pool choice would be
    // discarded on the first render and replaced with a clan.
    () => resolveMenteeClan(menteeChoice, menteeClans, !scopeReady, poolIds),
    [menteeChoice, menteeClans, scopeReady, poolIds],
  );
  const activePool = useMemo(() => {
    const id = poolIdOf(menteeScope);
    return id ? menteePools.find((p) => p.id === id) ?? null : null;
  }, [menteeScope, menteePools]);
  // A pool is not a clan. Everything downstream that means "the clan" gets
  // nothing here rather than a scope string it would pass off as a clan id.
  const menteeActiveClanId = poolIdOf(menteeScope) ? '' : menteeScope;

  /**
   * Keep storage agreeing with the picker.
   *
   * `portalScopeHeaders()` reads these keys straight out of localStorage to
   * build `X-Active-Clan`, so if the sidebar settles on a clan the mentor never
   * explicitly picked and storage stays empty, the screen says one clan and the
   * request asks for all of them. Writing the resolved value keeps the two
   * telling the same story. No `setState`, so no extra render.
   */
  useEffect(() => {
    if (!userId || mentorChoice === null || !clansKnown) return;
    if (activeClanId && activeClanId !== readClanChoice('mentor', userId)) {
      writeClanChoice('mentor', userId, activeClanId);
    }
  }, [activeClanId, mentorChoice, clansKnown, userId]);

  useEffect(() => {
    if (!userId || menteeChoice === null || !scopeReady) return;
    if (menteeScope && menteeScope !== readClanChoice('mentee', userId)) {
      writeClanChoice('mentee', userId, menteeScope);
    }
  }, [menteeScope, menteeChoice, scopeReady, userId]);

  const setActiveClanId = useCallback((id: string) => {
    setMentorChoice(id);
    writeClanChoice('mentor', userId, id);
  }, [userId]);

  const setMenteeScope = useCallback((value: string) => {
    setMenteeChoice(value);
    writeClanChoice('mentee', userId, value);
  }, [userId]);

  return (
    <ClanContext.Provider value={{
      clans, activeClanId, setActiveClanId,
      menteeClans, menteePools, menteeScope, setMenteeScope, menteeActiveClanId, activePool,
      scopeReady, loading,
    }}>
      {children}
    </ClanContext.Provider>
  );
}

/** Safe even outside the provider (returns an inert "all clans" context). */
export function useClan(): ClanContextValue {
  const ctx = useContext(ClanContext);
  if (!ctx) {
    return {
      clans: [], activeClanId: ALL_CLANS, setActiveClanId: () => {},
      menteeClans: [], menteePools: [], menteeScope: '', setMenteeScope: () => {},
      menteeActiveClanId: '', activePool: null,
      scopeReady: true, loading: false,
    };
  }
  return ctx;
}
