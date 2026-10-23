'use client';

import { useEffect } from 'react';

/**
 * One owner for `document.body.style.overflow`.
 *
 * Six components used to lock background scrolling, and five of them did it
 * the obvious way: save whatever `overflow` currently is, set it to `hidden`,
 * and put the saved value back on the way out. That is correct alone and
 * wrong together, because the value one of them saves is the value another
 * one just wrote.
 *
 *   drawer opens          saves ""        → overflow: hidden
 *   notification sheet    saves "hidden"  → overflow: hidden
 *   drawer closes                         → overflow: ""        (unlocked early)
 *   sheet closes          restores        → overflow: hidden    (stuck)
 *
 * The page is then unscrollable until a refresh, which is exactly how it was
 * reported — by mentors and mentees, on no page in particular, because the
 * page it strands you on is just wherever you happened to navigate next.
 *
 * So: a count, not a saved value. The first lock records what `overflow` was
 * before anybody touched it and the last release puts that back; the ones in
 * between only move the number. Releasing twice is a no-op rather than a
 * double decrement — React re-runs effects in development, and a component
 * that unmounts mid-transition can otherwise take the count below zero and
 * leave the next lock unable to unlock.
 */
let locks = 0;
let restoreTo: string | null = null;

/** Lock background scroll. Returns the release — call it once, or never. */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (locks === 0) {
    restoreTo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      document.body.style.overflow = restoreTo ?? '';
      restoreTo = null;
    }
  };
}

/**
 * Lock background scroll for as long as `active` is true and this component is
 * mounted. Pass the same flag that decides whether the overlay is showing.
 */
export function useScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}

export default useScrollLock;
