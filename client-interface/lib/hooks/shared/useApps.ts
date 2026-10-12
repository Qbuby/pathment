'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { appsApi, type ExternalApp } from '@/lib/services/apps-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const EMPTY: ExternalApp[] = [];

/** The external app catalog as this workspace sees it, plus connect/disconnect. */
export function useApps() {
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery<ExternalApp[]>({
    queryKey: qk.admin.apps,
    queryFn: async () => {
      const res: any = await appsApi.list(); // eslint-disable-line @typescript-eslint/no-explicit-any
      return res?.data?.apps ?? [];
    },
    errorMessage: 'Failed to load apps',
  });

  const connect = useCallback(async (app: ExternalApp) => {
    try {
      setBusyId(app.id);
      await appsApi.connect(app.id);
      toast.success(`${app.name} connected`);
      await refetch();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not connect the app')); }
    finally { setBusyId(null); }
  }, [refetch]);

  const disconnect = useCallback(async (app: ExternalApp) => {
    try {
      setBusyId(app.id);
      await appsApi.disconnect(app.id);
      toast.success(`${app.name} disconnected`);
      await refetch();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not disconnect the app')); }
    finally { setBusyId(null); }
  }, [refetch]);

  return { apps: data ?? EMPTY, loading, error, busyId, refetch, connect, disconnect };
}
