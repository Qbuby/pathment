'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { communityApi } from '@/lib/services/community-api';

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface CommunityReportRow {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  /** The stored line, e.g. "Spam — keeps posting links". */
  reason: string | null;
  /** The reason picked in the report dialog, when there was one. */
  category?: string | null;
  categoryLabel?: string | null;
  /** What the reporter wrote, without the category in front. */
  details?: string | null;
  status: ReportStatus;
  at: string;
  reporter: { id: string; name: string; role?: string | null; avatarUrl?: string | null };
  preview: string;
  targetAuthor: string | null;
  targetAuthorId?: string | null;
  targetAuthorRole?: string | null;
  targetAuthorAvatarUrl?: string | null;
  targetDeleted: boolean;
}

/** One reported post or comment, with every report made against it. */
export interface ReportedItem {
  key: string;
  targetType: 'post' | 'comment';
  targetId: string;
  status: ReportStatus;
  preview: string;
  targetAuthor: string | null;
  targetAuthorId?: string | null;
  targetAuthorRole?: string | null;
  targetAuthorAvatarUrl?: string | null;
  targetDeleted: boolean;
  /** Newest first. */
  reports: CommunityReportRow[];
}

const EMPTY: CommunityReportRow[] = [];

export function useModeration() {
  const [status, setStatus] = useState<ReportStatus>('open');

  const { data, loading, refetch } = useApiQuery<CommunityReportRow[]>({
    queryKey: qk.admin.moderation(status),
    queryFn: async () => {
      const r: any = await communityApi.reports(status); // eslint-disable-line @typescript-eslint/no-explicit-any
      return r?.data?.reports ?? [];
    },
    staleTime: STALE.short,
    errorMessage: 'Failed to load reports',
  });
  const reports = data ?? EMPTY;

  // The moderator decides about a piece of content, so several reports on the
  // same post are one item. The API returns newest first, which the grouping
  // keeps: an item sits where its most recent report is.
  const items = useMemo(() => {
    const map = new Map<string, ReportedItem>();
    for (const r of reports) {
      const key = `${r.targetType}:${r.targetId}`;
      let item = map.get(key);
      if (!item) {
        item = {
          key, targetType: r.targetType, targetId: r.targetId, status: r.status, preview: r.preview,
          targetAuthor: r.targetAuthor, targetAuthorId: r.targetAuthorId, targetAuthorRole: r.targetAuthorRole,
          targetAuthorAvatarUrl: r.targetAuthorAvatarUrl,
          targetDeleted: r.targetDeleted, reports: [],
        };
        map.set(key, item);
      }
      item.reports.push(r);
    }
    return [...map.values()];
  }, [reports]);

  const resolve = useCallback(async (id: string, s: 'reviewed' | 'dismissed') => {
    try {
      await communityApi.resolveReport(id, s);
      toast.success(s === 'dismissed' ? 'Dismissed' : 'Marked reviewed');
      await refetch();
    } catch { toast.error('Could not update report'); }
  }, [refetch]);

  const removeContent = useCallback(async (row: CommunityReportRow) => {
    try {
      if (row.targetType === 'post') await communityApi.deletePost(row.targetId);
      else await communityApi.deleteComment(row.targetId);
      await communityApi.resolveReport(row.id, 'reviewed');
      toast.success('Content removed');
      await refetch();
    } catch { toast.error('Could not remove content'); }
  }, [refetch]);

  /** Close every report on one item with the same decision. */
  const resolveItem = useCallback(async (item: ReportedItem, s: 'reviewed' | 'dismissed') => {
    try {
      await Promise.all(item.reports.map((r) => communityApi.resolveReport(r.id, s)));
      toast.success(s === 'dismissed' ? 'Dismissed' : 'Marked reviewed');
    } catch {
      toast.error('Could not update every report on this item');
    } finally {
      await refetch();
    }
  }, [refetch]);

  /** Delete the content once, then close every report on it. */
  const removeItem = useCallback(async (item: ReportedItem) => {
    try {
      if (item.targetType === 'post') await communityApi.deletePost(item.targetId);
      else await communityApi.deleteComment(item.targetId);
      await Promise.all(item.reports.map((r) => communityApi.resolveReport(r.id, 'reviewed')));
      toast.success('Content removed');
    } catch {
      toast.error('Could not remove content');
    } finally {
      await refetch();
    }
  }, [refetch]);

  return { reports, items, status, setStatus, loading, refetch, resolve, removeContent, resolveItem, removeItem };
}
