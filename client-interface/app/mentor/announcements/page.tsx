'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';
import { AnnouncementFeed } from '@/components/shared/AnnouncementFeed';
import { AnnouncementComposer, type AudienceTarget } from '@/components/shared/AnnouncementComposer';
import { announcementsApi } from '@/lib/services/announcements-api';

export default function MentorAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [clans, setClans] = useState<AudienceTarget[]>([]);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    announcementsApi
      .ledClans()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => setClans(r?.data?.clans ?? []))
      .catch(() => setClans([]));
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div>
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Megaphone className="h-5 w-5 text-brand-600" /> Announcements
          </h1>
          <p className="text-slate-600">
            Post updates to your clan&apos;s mentees, and see what admins have shared.
          </p>
        </div>
        {clans.length > 0 && (
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New announcement
          </button>
        )}
      </div>

      {clans.length === 0 && !loading && (
        <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          You don&apos;t lead a clan yet. Once you do, you can post announcements to its
          mentees from here.
        </p>
      )}

      <AnnouncementFeed
        announcements={announcements}
        loading={loading}
        error={error}
        onRefresh={refetch}
        emptyHint="No announcements yet."
      />

      {/* A mentor may only broadcast to a clan they lead — the server enforces
          the same rule, so the composer just offers what will be accepted. */}
      <AnnouncementComposer
        open={composing}
        onClose={() => setComposing(false)}
        onPosted={refetch}
        audiences={['clan']}
        clans={clans}
      />
    </div>
  );
}
