'use client';

/**
 * ActivityTrackerMount
 *
 * A zero-UI component that mounts the activity tracker.
 * Include once inside any authenticated role layout.
 *
 * It also records which page the person is on. That had been built on both
 * sides and connected on neither: the endpoint existed, the hook exposed
 * `trackPageView`, and nothing on the web ever called it — so the only rows in
 * the page-view log came from the mobile app, and the question "is anybody
 * using this screen?" had no data behind it at all. One effect on the pathname
 * closes that, which is the whole input to the feature-usage report.
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useActivityTracker } from '@/lib/hooks/shared/useActivityTracker';
import { pageKey } from '@/lib/utils/page-key';

export function ActivityTrackerMount() {
  const { trackPageView } = useActivityTracker();
  const pathname = usePathname();
  // React runs effects twice in development; a page view is a count, so the
  // second run would quietly double every number in the report.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const key = pageKey(pathname);
    if (lastSent.current === key) return;
    lastSent.current = key;
    trackPageView(key);
  }, [pathname, trackPageView]);

  return null;
}
