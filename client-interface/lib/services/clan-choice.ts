/**
 * Reading and writing the clan a person last picked.
 *
 * Two callers need the same answer and must never disagree: `ClanContext`,
 * which drives the sidebar picker, and `portal-scope`, which builds the
 * `X-Active-Clan` header from outside the React tree. They used to hold their
 * own copies of the storage keys with a comment asking the next person to keep
 * them in step. This is that single place instead.
 *
 * The keys are per account — see `mentorClanKey` for why that is what makes the
 * choice survive signing in again.
 */

import {
  LEGACY_MENTEE_CLAN_KEY,
  LEGACY_MENTOR_CLAN_KEY,
  menteeClanKey,
  mentorClanKey,
} from '@/lib/utils/clan-selection';

export type ClanPortal = 'mentor' | 'mentee';

const keyFor = (portal: ClanPortal, userId: string | null | undefined) =>
  portal === 'mentee' ? menteeClanKey(userId) : mentorClanKey(userId);

const legacyKeyFor = (portal: ClanPortal) =>
  portal === 'mentee' ? LEGACY_MENTEE_CLAN_KEY : LEGACY_MENTOR_CLAN_KEY;

/**
 * The stored choice for this account, or `''` when they have never picked.
 *
 * On the first read after the per-account keys shipped, an existing global
 * choice is adopted and the global key retired. That key was shared by every
 * account on the browser, so moving it under the first account to ask is the
 * only reading of it that can be right — and `resolveMentorClan` discards a
 * clan the account is not a member of anyway, so a wrong guess self-corrects.
 */
export function readClanChoice(portal: ClanPortal, userId: string | null | undefined): string {
  if (typeof window === 'undefined') return '';
  const key = keyFor(portal, userId);
  if (!key) return '';
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
    const legacy = window.localStorage.getItem(legacyKeyFor(portal));
    if (legacy === null) return '';
    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(legacyKeyFor(portal));
    return legacy;
  } catch {
    return ''; // private mode / blocked storage
  }
}

export function writeClanChoice(
  portal: ClanPortal,
  userId: string | null | undefined,
  value: string,
): void {
  if (typeof window === 'undefined') return;
  const key = keyFor(portal, userId);
  if (!key) return;
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}
