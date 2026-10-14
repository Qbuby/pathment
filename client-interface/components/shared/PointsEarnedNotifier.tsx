"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { activeWorkspaceSlug, logicalPathname, workspacePath } from "@/lib/services/workspace-scope";
import {
  gamificationApi,
  type PointsHistoryEntry,
} from "@/lib/services/gamification-api";

/** Daily login is awarded on auth; keep enough window to finish onboarding. */
const DAILY_LOGIN_FRESH_MS = 15 * 60 * 1000;
/** Single live award (task approve, etc.) — not a seed backlog. */
const LIVE_AWARD_FRESH_MS = 90 * 1000;

function formatReason(item: PointsHistoryEntry): string {
  if (item.reason && item.reason.trim()) {
    return item.reason.trim();
  }
  const typeMap: Record<string, string> = {
    daily_login: "Daily Login Check-in",
    task_completion: "Task Completed",
    task_approved: "Task Approved",
    review_contribution: "Cohort Review Contribution",
    community_kudos: "Received Kudos",
    community_answer: "Accepted Answer",
    quiz_passed: "Quiz Passed",
    interview_completed: "Interview Completed",
    streak_bonus: "Streak Bonus",
    badge_reward: "Badge Unlocked",
  };
  return typeMap[item.sourceType] || "Activity Milestone";
}

function readSeenIds(cacheKey: string): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSeenIds(cacheKey: string, ids: string[]) {
  try {
    const existing = readSeenIds(cacheKey);
    const updated = Array.from(new Set([...existing, ...ids]));
    localStorage.setItem(cacheKey, JSON.stringify(updated.slice(-150)));
  } catch {
    // Ignore storage errors
  }
}

function ageMs(item: PointsHistoryEntry): number {
  const t = new Date(item.createdAt).getTime();
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

/** Pick at most one toast-worthy row; never a backlog dump from demo seed. */
function pickToastItems(unseen: PointsHistoryEntry[]): PointsHistoryEntry[] {
  const daily = unseen
    .filter((i) => i.sourceType === "daily_login" && ageMs(i) <= DAILY_LOGIN_FRESH_MS)
    .sort((a, b) => ageMs(a) - ageMs(b));
  if (daily.length) return [daily[0]];

  const live = unseen
    .filter((i) => i.sourceType !== "daily_login" && ageMs(i) <= LIVE_AWARD_FRESH_MS)
    .sort((a, b) => ageMs(a) - ageMs(b));
  // One live award only — multiple “fresh” rows almost always means seed/backfill.
  if (live.length === 1) return live;
  return [];
}

/** Hide toast during profile setup only — do not treat /login as blocked or we
 *  mark the fresh daily-login XP as “seen” before the mentee reaches the app. */
function isOnboardingPath(logical: string, raw: string): boolean {
  return logical.startsWith("/onboarding") || raw.includes("/onboarding");
}

export function PointsEarnedNotifier() {
  const { user } = useAuth();
  const rawPath = usePathname() || "";
  const pathname = logicalPathname(rawPath);
  const hasWorkspace = Boolean(activeWorkspaceSlug());
  const [items, setItems] = useState<PointsHistoryEntry[]>([]);
  const [itemsOwnerId, setItemsOwnerId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * How many days in a row, for a check-in toast.
   *
   * The toast used to lead with "+1 XP", which is not a number anybody can
   * care about — it is the same every day and it buys nothing on its own. The
   * streak is the number that makes someone come back tomorrow, and it was the
   * one thing the card did not show. Null until it arrives, so the toast can
   * open immediately and fill in.
   */
  const [streak, setStreak] = useState<number | null>(null);
  const [dismissedOwnerId, setDismissedOwnerId] = useState<string | null>(null);

  const blocked = !hasWorkspace || isOnboardingPath(pathname, rawPath);
  const userId = user?.id || null;
  const dismissed = dismissedOwnerId === userId;
  const visible = !blocked && !dismissed && itemsOwnerId === userId && items.length > 0;

  // Hide toast on onboarding, but keep a fresh daily_login toastable for after setup.
  useEffect(() => {
    if (!blocked) return;
    if (!userId) return;
    const cacheKey = `pathment_seen_point_ids_${userId}`;
    let cancelled = false;
    (async () => {
      try {
        const history = await gamificationApi.getUserPointsHistory(userId, 20);
        if (cancelled) return;
        // Mark backlog only — never eat today’s fresh daily check-in.
        const ids = (history || [])
          .filter(
            (i) =>
              Number(i.pointsChange) > 0 &&
              !(i.sourceType === "daily_login" && ageMs(i) <= DAILY_LOGIN_FRESH_MS),
          )
          .map((i) => i.id);
        if (ids.length) writeSeenIds(cacheKey, ids);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blocked, userId]);

  useEffect(() => {
    if (!userId || dismissed || blocked) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const cacheKey = `pathment_seen_point_ids_${userId}`;
      const seenIds = new Set(readSeenIds(cacheKey));
      try {
        const history = await gamificationApi.getUserPointsHistory(userId, 15);
        if (cancelled) return;
        const unseen = (history || []).filter(
          (item) => Number(item.pointsChange) > 0 && !seenIds.has(item.id),
        );
        const toastItems = pickToastItems(unseen);
        const toastIds = new Set(toastItems.map((item) => item.id));
        const quietIds = unseen.filter((item) => !toastIds.has(item.id)).map((item) => item.id);
        if (quietIds.length) writeSeenIds(cacheKey, quietIds);
        if (toastItems.length) {
          setItems(toastItems);
          setItemsOwnerId(userId);
          if (toastItems[0].sourceType === 'daily_login') {
            // Secondary and optional: a missing streak costs the headline, not
            // the toast.
            gamificationApi.getUserStats(userId)
              .then((stats) => { if (!cancelled) setStreak(Number(stats?.currentStreak) || 0); })
              .catch(() => { /* headline falls back to the check-in itself */ });
          }
        }
      } catch {
        // A toast is optional; points history remains available on the page.
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, dismissed, blocked]);

  const handleDismiss = () => {
    if (!userId || items.length === 0) return;
    setDismissedOwnerId(userId);
    writeSeenIds(
      `pathment_seen_point_ids_${userId}`,
      items.map((i) => i.id),
    );
  };

  useEffect(() => {
    if (visible && !paused) {
      const timer = setTimeout(() => {
        if (!userId) return;
        setDismissedOwnerId(userId);
        writeSeenIds(
          `pathment_seen_point_ids_${userId}`,
          items.map((item) => item.id),
        );
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [visible, paused, userId, items]);

  if (blocked || !visible || items.length === 0) return null;

  const totalPoints = items.reduce(
    (sum, item) => sum + Number(item.pointsChange || 0),
    0,
  );
  const primaryItem = items[0];
  const dailyLogin = primaryItem.sourceType === "daily_login";
  const rewardsHref = pathname.startsWith("/mentee")
    ? "/mentee/gamification"
    : null;

  /**
   * The headline is the streak, not the points.
   *
   * A check-in is worth +1 XP every single day, so leading with it says
   * nothing — the card shouted a number that never changes. "6 days" is the
   * number that makes tomorrow matter, and it is the only reason a streak
   * mechanic works at all.
   */
  const headline = dailyLogin
    ? (streak && streak > 1 ? `${streak} day streak` : "Checked in today")
    : formatReason(primaryItem);
  const sub = dailyLogin
    ? (streak && streak > 1 ? "Keep it going tomorrow" : "Come back tomorrow to start a streak")
    : "Your level progress moved forward";

  /**
   * The last seven days, lit as far back as the streak reaches.
   *
   * Derived from the streak rather than invented: six days means six lit and
   * one dark, which is exactly what the number already claims. It replaces a
   * line of motivational filler with the thing that actually creates the
   * not-breaking-the-chain feeling, and it costs one row.
   */
  const week = dailyLogin && streak !== null
    ? Array.from({ length: 7 }, (_, i) => i >= 7 - Math.min(streak, 7))
    : null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[80] flex justify-center sm:inset-auto sm:right-6 sm:top-6 sm:block">
      <aside
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setPaused(false);
        }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${headline}. You earned ${totalPoints} XP.`}
        className="pointer-events-auto relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-[0_12px_32px_-12px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:motion-safe:slide-in-from-top-2 sm:motion-safe:duration-300"
      >
        <div className="flex items-center gap-3 p-3.5 pr-10">
          {/* Fire for a streak, cup for everything else. One mark, no
              decoration — the old card had three stray dots and a floating
              sparkle that read as rendering faults. */}
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              dailyLogin
                ? "bg-linear-to-br from-amber-400 to-orange-500 text-white"
                : "bg-linear-to-br from-brand-500 to-brand-700 text-white"
            }`}
          >
            {dailyLogin
              ? <Flame className="h-5 w-5" aria-hidden="true" />
              : <Trophy className="h-5 w-5" aria-hidden="true" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{headline}</p>
              {/* The points, demoted to what they are: a footnote. */}
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                +{totalPoints} XP
              </span>
            </div>

            {week ? (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex gap-1" aria-hidden="true">
                  {week.map((lit, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${
                        lit ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    />
                  ))}
                </div>
                <span className="truncate text-[11px] text-muted-foreground">{sub}</span>
              </div>
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
            )}
          </div>

          {rewardsHref && (
            <Link
              href={workspacePath(rewardsHref)}
              onClick={handleDismiss}
              aria-label="See your progress"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-700 dark:hover:bg-slate-800"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/*
            The countdown, drawn.

            It leaves on its own after a few seconds and hovering holds it —
            both were true before and neither was visible, so the card read as
            something you had to deal with rather than something passing by.
        */}
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-0.5 origin-left ${dailyLogin ? "bg-amber-400" : "bg-brand-500"} ${
            paused ? "" : "animate-pm-toast-timer"
          }`}
          style={paused ? { width: "100%", opacity: 0.35 } : undefined}
        />
      </aside>
    </div>
  );
}
