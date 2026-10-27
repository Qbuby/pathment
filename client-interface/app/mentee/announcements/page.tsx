"use client";

import { Megaphone } from "lucide-react";
import { useAnnouncements } from "@/lib/hooks/shared/useAnnouncements";
import { AnnouncementFeed } from "@/components/shared/AnnouncementFeed";

export default function MenteeAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  return (
    <div className="max-w-5xl space-y-6">
      <div className="mentee-page-heading">
        <h1 className="mb-2 flex items-center gap-2 text-slate-900">
          <Megaphone className="h-5 w-5 text-brand-600" /> Announcements
        </h1>
        <p className="text-slate-600">
          Updates from your mentor, your program, and the team.
        </p>
      </div>
      {/* Search and the audience filter live in the feed, so every portal gets
          the same ones instead of each page rolling its own. */}
      <AnnouncementFeed
        announcements={announcements}
        loading={loading}
        error={error}
        onRefresh={refetch}
        emptyHint="No announcements yet - your mentor and admins will post here."
      />
    </div>
  );
}
