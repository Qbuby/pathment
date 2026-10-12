'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { appsApi, type ExternalApp } from '@/lib/services/apps-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const EMPTY: ExternalApp[] = [];

/** The external app catalog as this workspace sees it, plus connect/test/disconnect. */
export function useApps() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const invalidate = useInvalidate();

  const { data, loading, error, refetch } = useApiQuery<ExternalApp[]>({
    queryKey: qk.admin.apps,
    queryFn: async () => {
      const res: any = await appsApi.list(); // eslint-disable-line @typescript-eslint/no-explicit-any
      return res?.data?.apps ?? [];
    },
    errorMessage: 'Failed to load apps',
  });

  // A connection changing is what makes course surfaces appear or disappear.
  const afterChange = useCallback(async () => {
    await Promise.all([refetch(), invalidate(qk.courses.all)]);
  }, [refetch, invalidate]);

  /**
   * Send the keys for the server to verify with the provider. Resolves to null
   * on success, or the reason the provider (or we) refused — the dialog shows
   * it inline so the admin can correct the keys without losing them.
   */
  const connect = useCallback(async (app: ExternalApp, credentials: Record<string, string>): Promise<string | null> => {
    try {
      setBusyId(app.id);
      await appsApi.connect(app.id, credentials);
      toast.success(`${app.name} connected`);
      await afterChange();
      return null;
    } catch (e) {
      return extractApiErrorMessage(e, `Could not connect ${app.name}`);
    } finally { setBusyId(null); }
  }, [afterChange]);

  const test = useCallback(async (app: ExternalApp) => {
    try {
      setBusyId(app.id);
      const res: any = await appsApi.test(app.id); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (res?.data?.status === 'connected') toast.success(`${app.name} connection works`);
      else toast.error(res?.data?.error || `${app.name} rejected the saved keys`);
      await afterChange();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Test failed')); }
    finally { setBusyId(null); }
  }, [afterChange]);

  const disconnect = useCallback(async (app: ExternalApp) => {
    try {
      setBusyId(app.id);
      await appsApi.disconnect(app.id);
      toast.success(`${app.name} disconnected`);
      await afterChange();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not disconnect the app')); }
    finally { setBusyId(null); }
  }, [afterChange]);

  return { apps: data ?? EMPTY, loading, error, busyId, refetch, connect, test, disconnect };
}
