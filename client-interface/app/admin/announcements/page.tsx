'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';
import { AnnouncementFeed } from '@/components/shared/AnnouncementFeed';
import { AnnouncementComposer, type AudienceTarget } from '@/components/shared/AnnouncementComposer';
import { programsApi } from '@/lib/services/program-api';
import { clanApi } from '@/lib/services/clan-api';

export default function AdminAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [programs, setPrograms] = useState<AudienceTarget[]>([]);
  const [clans, setClans] = useState<AudienceTarget[]>([]);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    programsApi.getAll()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => setPrograms((Array.isArray(r?.data) ? r.data : (r?.data?.programs ?? []))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
    clanApi.list()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => setClans((r?.data?.clans ?? r?.clans ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="admin-page-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 flex items-center gap-2 text-slate-900">
            <Megaphone className="h-5 w-5 text-brand-600" /> Announcements
          </h1>
          <p className="text-slate-600">Broadcast to everyone, a role, a program, or a clan.</p>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New announcement
        </button>
      </div>

      <AnnouncementFeed
        announcements={announcements}
        loading={loading}
        error={error}
        onRefresh={refetch}
        canManage
        emptyHint="No announcements yet."
      />

      <AnnouncementComposer
        open={composing}
        onClose={() => setComposing(false)}
        onPosted={refetch}
        audiences={['all', 'mentors', 'mentees', 'program', 'clan']}
        programs={programs}
        clans={clans}
      />
    </div>
  );
}
