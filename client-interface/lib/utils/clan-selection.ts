/**
 * Which clan a mentor or mentee is looking at, and why.
 *
 * Pure on purpose: this is the rule that decides what somebody sees the moment
 * they open Pathment, and it is worth being able to test it without mounting a
 * provider. `ClanContext` holds the state and the storage; everything about
 * *choosing* lives here.
 */

export const ALL_CLANS = 'all';

/** Only the fields the rule reads. Keeps this free of a React import. */
export interface SelectableClan {
  id: string;
  kind?: 'cohort' | 'standing';
  frozenAt?: string | null;
}

/**
 * Where a person's clan choice is stored.
 *
 * The choice belongs to an ACCOUNT, not to a browser. It used to live under a
 * single global key, which left signing in with only one safe move: delete it,
 * so the next person to use this browser did not inherit someone else's clan.
 * That delete is why the selection never survived coming back — every login,
 * sign-in link and 2FA completion threw it away.
 *
 * Keying by user id makes the choice durable *and* private to the account that
 * made it, so there is nothing to clear on the way in or out.
 */
export const LEGACY_MENTOR_CLAN_KEY = 'pathment-active-clan';
export const LEGACY_MENTEE_CLAN_KEY = 'pathment-active-mentee-clan';

/** Storage key for a mentor's clan choice. Null when nobody is signed in. */
export function mentorClanKey(userId: string | null | undefined): string | null {
  return userId ? `${LEGACY_MENTOR_CLAN_KEY}:${userId}` : null;
}

/** Storage key for a mentee's clan choice. Null when nobody is signed in. */
export function menteeClanKey(userId: string | null | undefined): string | null {
  return userId ? `${LEGACY_MENTEE_CLAN_KEY}:${userId}` : null;
}

/**
 * Where to land when nobody has chosen.
 *
 * A live clan beats a finished one. Nobody opens Pathment to look at a
 * programme that ended, and landing read-only on the first screen of the day
 * reads as the app being broken rather than as a deliberate scope. The lists
 * already arrive sorted active-first, so this is usually just the head — the
 * filter is for when it is not.
 */
export function defaultClanOf(clans: SelectableClan[]): string | null {
  if (!clans.length) return null;
  const live = clans.find((c) => c.kind === 'standing' || !c.frozenAt);
  return (live ?? clans[0]).id;
}

/**
 * The mentor's effective clan.
 *
 * `choice` is what they last picked: `null` before storage has been read, `''`
 * when they have never picked anything, `'all'` when they chose the merged
 * view, otherwise a clan id.
 *
 * Choosing "All clans" and never having chosen are deliberately NOT the same
 * answer. The old code collapsed them, so a first-time mentor — and anyone
 * whose saved clan had been archived — was parked on a view that merges every
 * clan they mentor. That is a reporting lens, and a strange place to start.
 */
export function resolveMentorClan(
  choice: string | null,
  clans: SelectableClan[],
  unsettled: boolean,
): string {
  if (choice === null) return ALL_CLANS;                 // storage not read yet
  if (choice === ALL_CLANS) return ALL_CLANS;            // their choice, kept
  if (choice && clans.some((c) => c.id === choice)) return choice;
  // An empty list is not evidence that their clan is gone — it is also what
  // "we have not been told yet" looks like, both while the request is in
  // flight and before it is even allowed to start. Falling back on either is
  // what made every visit flash "All clans", and what overwrote the saved
  // choice with "all" on the next sign-in.
  if (unsettled) return choice || ALL_CLANS;
  return defaultClanOf(clans) ?? ALL_CLANS;
}

/**
 * The mentee's effective clan. Same rule minus "all" — a mentee is always in
 * exactly one clan at a time, and a merged view would mean nothing to them.
 */
export function resolveMenteeClan(
  choice: string | null,
  clans: SelectableClan[],
  unsettled: boolean,
): string {
  if (choice === null) return '';
  if (choice && clans.some((c) => c.id === choice)) return choice;
  if (unsettled) return choice;
  return defaultClanOf(clans) ?? '';
}
