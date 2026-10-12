'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';
import { resolveMentorClan, resolveMenteeClan } from '@/lib/utils/clan-selection';

// Clan roles that mean "I mentor this clan" (so it belongs in the scope picker).
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
export const MENTOR_CLAN_STORAGE_KEY = 'pathment-active-clan';
export const MENTEE_CLAN_STORAGE_KEY = 'pathment-active-mentee-clan';
export const ALL_CLANS = 'all';

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

export interface ClanLite { id: string; name: string; avatarUrl?: string | null; kind?: 'cohort' | 'standing'; frozenAt?: string | null; programId?: string; programName?: string | null; }

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
  /** Active mentee workspace clan (never 'all'). Empty string while unknown. */
  menteeActiveClanId: string;
  setMenteeActiveClanId: (id: string) => void;
  loading: boolean;
}

const ClanContext = createContext<ClanContextValue | undefined>(undefined);

const EMPTY_MEMBERSHIPS = { mentor: [] as ClanLite[], mentee: [] as ClanLite[] };

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

  const isMentor = !!availableRoles?.includes('mentor');
  const isMentee = !!availableRoles?.includes('mentee');

  const { data = EMPTY_MEMBERSHIPS, loading } = useApiQuery<{ mentor: ClanLite[]; mentee: ClanLite[] }>({
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
    enabled: !!user?.id && (isMentor || isMentee),
    staleTime: STALE.long,
  });

  const clans = data.mentor;
  const menteeClans = data.mentee;

  /**
   * Read the stored choices once, after mount.
   *
   * This is the only `setState` in an effect here, and it is unavoidable: the
   * value lives in localStorage, which does not exist during the server render.
   */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage does not
       exist during the server render, so this value cannot be seeded in a
       `useState` initializer without a hydration mismatch. One pass, on mount. */
    setMentorChoice(readStored(MENTOR_CLAN_STORAGE_KEY) ?? '');
    setMenteeChoice(readStored(MENTEE_CLAN_STORAGE_KEY) ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
    () => resolveMentorClan(mentorChoice, clans, loading),
    [mentorChoice, clans, loading],
  );
  const menteeActiveClanId = useMemo(
    () => resolveMenteeClan(menteeChoice, menteeClans, loading),
    [menteeChoice, menteeClans, loading],
  );

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
    if (mentorChoice === null || loading) return;
    if (activeClanId && activeClanId !== readStored(MENTOR_CLAN_STORAGE_KEY)) {
      writeStored(MENTOR_CLAN_STORAGE_KEY, activeClanId);
    }
  }, [activeClanId, mentorChoice, loading]);

  useEffect(() => {
    if (menteeChoice === null || loading) return;
    if (menteeActiveClanId && menteeActiveClanId !== readStored(MENTEE_CLAN_STORAGE_KEY)) {
      writeStored(MENTEE_CLAN_STORAGE_KEY, menteeActiveClanId);
    }
  }, [menteeActiveClanId, menteeChoice, loading]);

  const setActiveClanId = useCallback((id: string) => {
    setMentorChoice(id);
    writeStored(MENTOR_CLAN_STORAGE_KEY, id);
  }, []);

  const setMenteeActiveClanId = useCallback((id: string) => {
    setMenteeChoice(id);
    writeStored(MENTEE_CLAN_STORAGE_KEY, id);
  }, []);

  return (
    <ClanContext.Provider value={{
      clans, activeClanId, setActiveClanId,
      menteeClans, menteeActiveClanId, setMenteeActiveClanId,
      loading,
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
      menteeClans: [], menteeActiveClanId: '', setMenteeActiveClanId: () => {},
      loading: false,
    };
  }
  return ctx;
}
