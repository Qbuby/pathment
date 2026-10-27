'use client';

import { useMemo } from 'react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { menteeApi } from '@/lib/services/mentee-api';
import { useClan } from '@/lib/context/ClanContext';

export interface PausedClan {
  clanId: string;
  clanName: string;
  pausedAt: string | null;
  pausedReason: string | null;
  mentors: { id: string; name: string; email: string }[];
}

interface PauseStateResponse {
  data?: { paused?: boolean; clans?: PausedClan[] };
}

/**
 * A pause is a fact about one CLAN MEMBERSHIP, not about a person.
 *
 * The server has always stored it that way — `clan_memberships.status` — but
 * the mentee side used to read it as a property of the account: paused
 * anywhere meant the whole learner experience went behind a wall. Somebody
 * paused in a cohort that ended in March could not reach the certificate that
 * cohort had awarded them.
 *
 * So this hook keeps the two apart, and every caller has to say which one it
 * means:
 *
 *   `pausedClans`  every clan they are paused in — what the banner names.
 *   `pausedHere`   whether the clan they are WORKING IN right now is paused —
 *                  the only thing that may hold a page back.
 *
 * The distinction is also why this reads `menteeClans`, not `clans`. The latter
 * is the mentor scope picker; on a pure mentee it is always empty, which is how
 * a clan-scoped check silently became a global one.
 */
export function useMenteePause() {
  const { menteeClans, menteeActiveClanId, loading: clansLoading } = useClan();

  const { data, loading, refetch } = useApiQuery<PauseStateResponse>({
    queryKey: qk.me.pauseState,
    queryFn: () => menteeApi.getPauseState() as Promise<PauseStateResponse>,
    staleTime: STALE.medium,
  });

  const rows = data?.data?.clans;

  return useMemo(() => {
    const pausedClans = rows ?? [];
    const activeClan = menteeClans.find((c) => c.id === menteeActiveClanId) ?? null;

    /*
     * Which clan the hold applies to. With a clan selected it is that one. With
     * none selected it is their only clan, if they have exactly one — a mentee
     * with a single clan often never touches the picker, and treating that as
     * "no clan chosen" would let a real pause go unenforced.
     */
     const effective = activeClan ?? (menteeClans.length === 1 ? menteeClans[0] : null);
    const here = effective ? pausedClans.find((c) => c.clanId === effective.id) ?? null : null;

    return {
      loading: loading || clansLoading,
      /** Paused in at least one clan. Drives the banner, never a block. */
      paused: pausedClans.length > 0,
      pausedClans,
      /** The pause covering the clan in effect, or null. Drives the hold. */
      pausedHere: here,
      /** Still working normally somewhere else — softens the banner's wording. */
      activeElsewhere: menteeClans.length > pausedClans.length,
      refetch,
    };
  }, [rows, menteeClans, menteeActiveClanId, loading, clansLoading, refetch]);
}

/** Whole days since the pause began, for the "it has been N days" nudge. */
export function daysPaused(pausedAt: string | null): number | null {
  if (!pausedAt) return null;
  const started = new Date(pausedAt).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((Date.now() - started) / 86_400_000));
}
