'use client';

import React, { useState } from 'react';
import { PackageOpen, Wrench, ArrowUpCircle, Rocket, ChevronRight, ChevronDown } from 'lucide-react';
import { type ChangelogEntry } from '@/lib/services/changelog-api';
import { useChangelogFeed } from '@/lib/hooks/shared/useChangelogFeed';
import { Drawer } from '@/components/shared/Drawer';

interface ChangelogDrawerProps {
  role: string;
}

// Per-type chip + icon so an entry's nature reads at a glance.
const TYPE_META: Record<string, { label: string; Icon: typeof PackageOpen; chip: string; tint: string }> = {
  feature: { label: 'New', Icon: Rocket, chip: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300', tint: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300' },
  improvement: { label: 'Improved', Icon: ArrowUpCircle, chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  fix: { label: 'Fixed', Icon: Wrench, chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', tint: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
};
const meta = (t?: string) => TYPE_META[t || 'feature'] || TYPE_META.feature;

function formatDate(dateString: string | null) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const { Icon, tint, chip, label } = meta(entry.type);
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip}`}>{label}</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
            {entry.unread && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-w-none mt-1.5 text-slate-600 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: entry.body }}
          />
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-slate-400">{formatDate(entry.publishedAt)}</p>
            {entry.actionUrl && (
              <a
                href={entry.actionUrl}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {entry.actionLabel || 'Learn more'} <ChevronRight className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChangelogDrawer({ role }: ChangelogDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFixes, setShowFixes] = useState(false);

  // Shared with ChangelogMount — the modal marking seen clears this badge through
  // the cache, so no cross-component event is needed.
  const { feed, loading: isLoading, markSeen } = useChangelogFeed(role);
  const updates: ChangelogEntry[] = feed.updates;
  const unreadCount = feed.unreadCount;

  // Opening the drawer = the user has seen what's new → clear badge + persist.
  const open = () => {
    setIsOpen(true);
    if (unreadCount > 0) markSeen();
  };

  // The slide, the Escape handler and the scroll lock all belong to the shared
  // Drawer now. They were reimplemented here, and the third copy of a timing
  // constant is how two sheets on the same rail end up feeling different.

  const highlights = updates.filter((u) => u.type !== 'fix');
  const fixes = updates.filter((u) => u.type === 'fix');

  return (
    <>
      <button
        onClick={open}
        className={`relative p-2 rounded-xl transition-colors duration-200 ${
          isOpen ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
        aria-label={`What's new ${unreadCount > 0 ? `(${unreadCount} new)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="What's new"
      >
        <span className="relative shrink-0">
          <PackageOpen className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </button>

      {/*
          The shared Drawer, not a second copy of it.
          This carried its own backdrop, panel, two-frame slide, Escape
          handler and scroll lock — a near-duplicate of `components/shared/
          Drawer`, which is what the feedback sheet beside it in the same
          sidebar uses. One timing constant and one focus trap now, so the
          three sheets on that rail cannot feel like three different products.
      */}
      {/* No mount guard: the shared Drawer portals only once it is open, and
          `open` is false during server rendering. */}
      <Drawer
          open={isOpen}
          onClose={() => setIsOpen(false)}
          width="sm"
          title="What's new"
          subtitle="Latest features &amp; fixes"
        >
          <div className="-mx-6 -my-5 flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
              ) : updates.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 px-6 text-center">
                  <PackageOpen className="w-8 h-8 text-slate-300" />
                  <span>Nothing new yet — check back soon.</span>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {highlights.map((e) => <EntryRow key={e.id} entry={e} />)}
                  </div>
                  {fixes.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setShowFixes((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>Also fixed ({fixes.length})</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showFixes ? 'rotate-180' : ''}`} />
                      </button>
                      {showFixes && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {fixes.map((e) => <EntryRow key={e.id} entry={e} />)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
      </Drawer>
    </>
  );
}

export { ChangelogDrawer };
