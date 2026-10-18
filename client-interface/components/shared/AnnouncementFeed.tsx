'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Megaphone,
  Pin,
  PinOff,
  Trash2,
  CheckCircle2,
  ThumbsUp,
  Loader2,
  MoreHorizontal,
  Search,
} from 'lucide-react';
import { announcementsApi } from '@/lib/services/announcements-api';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useProgramClans } from '@/lib/hooks/shared/useProgramClans';
import type { Announcement } from '@/lib/hooks/shared/useAnnouncements';
import { Avatar } from '@/components/shared/Avatar';
import { Dropdown } from '@/components/shared/Dropdown';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { linkify, shortenUrl } from '@/lib/utils/linkify';

/**
 * The announcement feed.
 *
 * An announcement is a broadcast someone has to read, not a tile in a gallery.
 * The old layout put them in a two-column grid with every body rendered in
 * full, so one mentor's twelve-paragraph post set the height of the row and
 * pushed everything after it off the screen, while a one-line downtime notice
 * sat in an equally large box. Pinned items were sorted first but looked
 * identical to the rest, and a pasted link was unclickable text.
 *
 * So: one readable column, pinned called out as its own section, long bodies
 * clamped with a control to open them, links that are links, and the manage
 * actions folded into a menu so they stop competing with the content.
 */

const AUDIENCE_TONE: Record<string, string> = {
  all: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  mentors: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200',
  mentees: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200',
  program: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  clan: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

/** Long enough that reading it in a list is a chore. */
const CLAMP_AT = 420;

function postedAt(iso: string): { label: string; title: string } {
  const then = new Date(iso);
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  const exact = then.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  if (seconds < 60) return { label: 'just now', title: exact };
  if (seconds < 3600) return { label: `${Math.floor(seconds / 60)}m ago`, title: exact };
  if (seconds < 86400) return { label: `${Math.floor(seconds / 3600)}h ago`, title: exact };
  const days = Math.floor(seconds / 86400);
  // Past a week "63d ago" stops meaning anything — give the date instead.
  if (days < 7) return { label: `${days}d ago`, title: exact };
  return {
    label: then.toLocaleDateString(undefined, {
      day: 'numeric', month: 'short',
      ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    }),
    title: exact,
  };
}

/** Plain text with its URLs rendered as links. No HTML is ever injected. */
function Body({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.kind === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600 dark:text-brand-300 break-words"
          >
            {shortenUrl(part.value)}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function ReactionButton({
  active, count, icon, label, onClick, disabled,
}: {
  active: boolean; count: number; icon: React.ReactNode; label: string;
  onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        active
          ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200'
          : 'border-border text-muted-foreground hover:border-slate-300 hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={`tabular-nums ${active ? '' : 'text-muted-foreground'}`}>{count}</span>
      )}
    </button>
  );
}

function AnnouncementRow({
  announcement: a, canManage, busy, onAct,
}: {
  announcement: Announcement;
  canManage: boolean;
  busy: boolean;
  onAct: (id: string, fn: () => Promise<unknown>, confirmLabel?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const manage = canManage || a.mine;
  const long = a.body.length > CLAMP_AT;
  const shown = long && !expanded ? `${a.body.slice(0, CLAMP_AT).trimEnd()}…` : a.body;
  const when = postedAt(a.at);

  return (
    <article
      className={`rounded-2xl border bg-card p-5 transition-colors sm:p-6 ${
        a.pinned ? 'border-brand-200 dark:border-brand-800' : 'border-border'
      }`}
    >
      <header className="flex items-start gap-3">
        <Avatar name={a.author?.name} src={a.author?.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-foreground sm:text-lg">
            {a.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{a.author?.name || 'Pathment'}</span>
            {a.author?.role && <span className="capitalize">· {a.author.role}</span>}
            <span>·</span>
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${AUDIENCE_TONE[a.audience] ?? AUDIENCE_TONE.all}`}
            >
              {a.audienceLabel}
            </span>
            <span>·</span>
            <time dateTime={a.at} title={when.title}>{when.label}</time>
          </p>
        </div>

        {manage && (
          <Dropdown
            align="end"
            width="w-44"
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                disabled={busy}
                aria-label={`Manage "${a.title}"`}
                className="-mr-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  onClick={() => { close(); onAct(a.id, () => announcementsApi.togglePin(a.id)); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                >
                  {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {a.pinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button
                  onClick={() => { close(); onAct(a.id, () => announcementsApi.remove(a.id), a.title); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </Dropdown>
        )}
      </header>

      <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
        <Body text={shown} />
      </div>
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <ReactionButton
          active={a.myReactions.includes('acknowledged')}
          count={a.reactions.acknowledged}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Acknowledged"
          disabled={busy}
          onClick={() => onAct(a.id, () => announcementsApi.react(a.id, 'acknowledged'))}
        />
        <ReactionButton
          active={a.myReactions.includes('helpful')}
          count={a.reactions.helpful}
          icon={<ThumbsUp className="h-3.5 w-3.5" />}
          label="Helpful"
          disabled={busy}
          onClick={() => onAct(a.id, () => announcementsApi.react(a.id, 'helpful'))}
        />
      </footer>
    </article>
  );
}

export function AnnouncementFeed({
  announcements,
  loading,
  error,
  onRefresh,
  canManage = false,
  emptyHint = 'No announcements yet.',
  /** Show the search + audience filters above the list. */
  filterable = true,
}: {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  canManage?: boolean;
  emptyHint?: string;
  filterable?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<string>('all-audiences');
  const [programFilter, setProgramFilter] = useState('');
  const confirm = useConfirm();

  const act = async (id: string, fn: () => Promise<unknown>, confirmLabel?: string) => {
    if (confirmLabel) {
      const ok = await confirm({
        title: 'Delete this announcement?',
        description: `"${confirmLabel}" will be removed for everyone who can see it. This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!ok) return;
    }
    try {
      setBusy(id);
      await fn();
      onRefresh();
    } catch {
      toast.error('Action failed');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Which programme an announcement belongs to.
   *
   * A programme-targeted one says so directly; a clan-targeted one belongs to
   * its clan's programme, which is why this needs the clan list at all. The
   * org-wide audiences — everyone, all mentors, all mentees — belong to no
   * programme and are deliberately kept visible under every filter: they
   * reach the people in that programme too, so hiding them would misreport
   * what a programme's members have actually been told.
   */
  const { programs, programOf } = useProgramClans();
  const programOfAnnouncement = (a: Announcement) =>
    (a.audience === 'program' ? a.audienceId : a.audience === 'clan' ? programOf(a.audienceId) : null);

  // Which audience chips to offer — only the ones actually present, so the
  // filter never advertises a category with nothing behind it.
  const audiences = useMemo(() => {
    const seen = new Map<string, string>();
    announcements.forEach((a) => { if (!seen.has(a.audience)) seen.set(a.audience, a.audienceLabel); });
    return [...seen.entries()];
  }, [announcements]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return announcements.filter((a) => {
      if (audience !== 'all-audiences' && a.audience !== audience) return false;
      if (programFilter) {
        const owner = programOfAnnouncement(a);
        // Org-wide posts stay: they reached this programme's people as well.
        const orgWide = ['all', 'mentors', 'mentees'].includes(a.audience);
        if (!orgWide && owner !== programFilter) return false;
      }
      if (!q) return true;
      return `${a.title} ${a.body} ${a.author?.name ?? ''}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, query, audience, programFilter, programOf]);

  const pinned = visible.filter((a) => a.pinned);
  const rest = visible.filter((a) => !a.pinned);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card py-12 text-center">
        <p className="mb-3 text-muted-foreground">{error}</p>
        <button onClick={onRefresh} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Try again
        </button>
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-14 text-center">
        <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
        <p className="text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  const chip = (value: string, label: string) => (
    <button
      key={value}
      onClick={() => setAudience(value)}
      aria-pressed={audience === value}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        audience === value
          ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200'
          : 'border-border text-muted-foreground hover:border-slate-300 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  const section = (items: Announcement[], heading?: string) =>
    items.length > 0 && (
      <section className="space-y-4">
        {heading && (
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {heading === 'Pinned' && <Pin className="h-3 w-3" />}
            {heading}
          </h2>
        )}
        {items.map((a) => (
          <AnnouncementRow
            key={a.id}
            announcement={a}
            canManage={canManage}
            busy={busy === a.id}
            onAct={act}
          />
        ))}
      </section>
    );

  return (
    <div className="max-w-3xl space-y-6">
      {filterable && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search announcements"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search announcements…"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {(audiences.length > 1 || programs.length > 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {chip('all-audiences', 'All')}
              {audiences.map(([value, label]) => chip(value, label))}
              {programs.length > 1 && (
                <div className="ml-auto w-56 max-w-full">
                  <SelectMenu
                    value={programFilter}
                    onChange={setProgramFilter}
                    ariaLabel="Filter by program"
                    options={[{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.label }))]}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center">
          <p className="text-muted-foreground">Nothing matches that filter.</p>
          <button
            onClick={() => { setQuery(''); setAudience('all-audiences'); setProgramFilter(''); }}
            className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {section(pinned, pinned.length && rest.length ? 'Pinned' : undefined)}
          {section(rest, pinned.length && rest.length ? 'Everything else' : undefined)}
        </>
      )}
    </div>
  );
}
