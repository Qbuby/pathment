'use client';

import { useMemo, useState } from 'react';
import { useApps } from './useApps';
import type { ExternalAppType } from '@/lib/services/apps-api';

/**
 * Custom hook wrapping AppsTab presentation logic:
 * - External app catalog & connection state
 * - Type filter (only types that actually have apps are offered)
 */
export function useAppsTab() {
  const { apps, loading, error, busyId, connect, disconnect } = useApps();
  const [typeFilter, setTypeFilter] = useState<ExternalAppType | 'all'>('all');

  const types = useMemo(() => Array.from(new Set(apps.map((a) => a.type))), [apps]);
  const visible = useMemo(
    () => (typeFilter === 'all' ? apps : apps.filter((a) => a.type === typeFilter)),
    [apps, typeFilter],
  );

  return {
    apps: visible,
    connectedCount: apps.filter((a) => a.connected).length,
    total: apps.length,
    types,
    typeFilter,
    setTypeFilter,
    loading,
    error,
    busyId,
    connect,
    disconnect,
  };
}
