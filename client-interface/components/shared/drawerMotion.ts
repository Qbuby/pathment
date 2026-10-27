'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One definition of how a drawer moves.
 *
 * The shared Drawer animated; every hand-rolled drawer beside it did not, so
 * the app slid open in one place and snapped open in another. Timing and
 * easing live here so a second implementation cannot drift from the first.
 *
 * 250ms is long enough to read as motion and short enough not to be a wait.
 * The curve is a hard ease-out: almost all of the distance is covered early,
 * so the panel feels caught rather than delivered.
 */
export const DRAWER_DURATION = 250;
export const DRAWER_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Tailwind for the sliding panel. Pass whether it is currently shown. */
export const drawerPanelClass = (shown: boolean) =>
  `transform-gpu transition-transform duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
    shown ? 'translate-x-0' : 'translate-x-full'
  }`;

/** Tailwind for the backdrop behind it. */
export const drawerBackdropClass = (shown: boolean) =>
  `absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-[250ms] ease-out motion-reduce:transition-none dark:bg-black/70 ${
    shown ? 'opacity-100' : 'opacity-0'
  }`;

/**
 * Enter and exit for a drawer that its PARENT mounts and unmounts.
 *
 * The parent renders it conditionally, so an exit animation needs the drawer
 * to stay alive while it plays: `beginExit` runs the animation first and only
 * then calls `onExit`, which is what actually removes it. Calling the parent's
 * close handler directly is what made every one of these vanish instantly.
 */
export function useDrawerMotion(onExit: () => void) {
  const [shown, setShown] = useState(false);
  const exiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; });

  // Two frames: the off-screen transform has to paint before we flip to the
  // on-screen one, or the browser has nothing to interpolate from and skips
  // straight to the end.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      if (exiting.current) clearTimeout(exiting.current);
    };
  }, []);

  const beginExit = useCallback(() => {
    // Guard against a second click during the exit, which would schedule two
    // unmounts and, on a form, fire its cleanup twice.
    if (exiting.current) return;
    setShown(false);
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    exiting.current = setTimeout(() => {
      exiting.current = null;
      onExitRef.current();
    }, reduced ? 0 : DRAWER_DURATION);
  }, []);

  return { shown, beginExit };
}
