"use client";

import Link from "next/link";
import { ChevronRight, Megaphone, Pin } from "lucide-react";
import { useAnnouncements } from "@/lib/hooks/shared/useAnnouncements";
import { Avatar } from "@/components/shared/Avatar";
import { stripHtml } from "@/lib/utils/html";

/**
 * "From your community" — the dashboard's view of the announcement feed.
 *
 * It used to be a grid of large tiles, each carrying three lines of body text,
 * which took most of a screen to say that three things had been posted. A
 * dashboard summary should cost a glance: one line per announcement, the
 * newest first, and the feed itself is one click away for anyone who wants to
 * read them.
 */
export function AnnouncementsCard({
  href,
  limit = 3,
  compact = false,
}: {
  href: string;
  limit?: number;
  mentor?: boolean;
  /**
   * One line instead of a card.
   *
   * A dashboard's job is to point at what to do next, and announcements are
   * context — worth seeing, not worth a block of the page. The compact form
   * shows the newest one and how many there are, in a single strip that can
   * sit at the top without pushing the work below the fold.
   */
  compact?: boolean;
}) {
  const { announcements, loading } = useAnnouncements();
  if (loading || announcements.length === 0) return null;
  const items = announcements.slice(0, limit);

  if (compact) {
    const [newest] = announcements;
    const more = announcements.length - 1;
    return (
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-brand-300"
      >
        <Megaphone className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        {newest.pinned && <Pin className="h-3 w-3 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          <span className="font-medium">{newest.title}</span>
          <span className="text-muted-foreground"> — {stripHtml(newest.body)}</span>
        </span>
        {more > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            +{more}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <h2 className="text-sm font-semibold text-foreground">From your community</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {announcements.length}
          </span>
        </div>
        <Link
          href={href}
          className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          View all
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={href}
              className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
            >
              <Avatar name={a.author?.name} src={a.author?.avatarUrl} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {a.pinned && <Pin className="h-3 w-3 shrink-0 text-brand-600 dark:text-brand-300" />}
                  <span className="truncate text-sm font-medium text-foreground">{a.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {a.audienceLabel} · {stripHtml(a.body)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
