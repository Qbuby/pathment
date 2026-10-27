'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PauseCircle, MessageCircle, Mail, ChevronDown } from 'lucide-react';
import { useMenteePause, daysPaused, type PausedClan } from '@/lib/hooks/useMenteePause';

/**
 * The paused strip: present on every mentee page, for as long as the pause is.
 *
 * It has one job, which is to be impossible to settle into. A pause is not an
 * error state and it is not a punishment — it is a conversation someone has
 * stopped having — so this is deliberately not a red alert and deliberately
 * not dismissible. It is a quiet line that is always there, carrying the one
 * number that does the work: how many days it has been.
 *
 * Everything else is folded away. The reason, who to ask, and the two ways to
 * ask them are one click behind "What this means", because a mentee reading
 * their certificates does not need the full explanation on screen — they need
 * to be reminded, and to have the way back within reach when they want it.
 */

const dayLine = (days: number | null) => {
  if (days === null) return null;
  if (days === 0) return 'since today';
  if (days === 1) return 'for 1 day';
  return `for ${days} days`;
};

export function PausedBanner() {
  const { loading, paused, pausedClans, activeElsewhere } = useMenteePause();
  const [open, setOpen] = useState(false);

  // Nothing while we do not know — a strip that flashes in and out is worse
  // than one that arrives a moment late.
  if (loading || !paused) return null;

  const longest = [...pausedClans].sort((a, b) => {
    const at = a.pausedAt ? new Date(a.pausedAt).getTime() : Infinity;
    const bt = b.pausedAt ? new Date(b.pausedAt).getTime() : Infinity;
    return at - bt;
  })[0];
  const days = dayLine(daysPaused(longest?.pausedAt ?? null));
  const many = pausedClans.length > 1;

  return (
    <div className="no-print mb-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-950/25">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <PauseCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-100">
          {many ? (
            <>You are paused in <span className="font-semibold">{pausedClans.length} clans</span></>
          ) : (
            <>Your place in <span className="font-semibold">{longest?.clanName || 'your clan'}</span> is paused</>
          )}
          {days && <span className="text-amber-700/90 dark:text-amber-200/80"> {days}</span>}
          {activeElsewhere && (
            <span className="text-amber-700/90 dark:text-amber-200/80">
              {' '}&middot; your other clan carries on as normal
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          What this means
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-amber-200/70 px-4 py-3.5 dark:border-amber-500/20">
          <p className="text-sm leading-6 text-amber-900/90 dark:text-amber-100/90">
            Your tasks and roadmap in {many ? 'these clans' : 'this clan'} are on hold. Everything
            else is still yours &mdash; your certificates, your progress so far, your messages and
            your community. Nothing has been taken away, and nothing is lost by coming back.
          </p>
          {pausedClans.map((clan) => (
            <ClanRow key={clan.clanId} clan={clan} showName={many} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClanRow({ clan, showName }: { clan: PausedClan; showName: boolean }) {
  const primary = clan.mentors[0] ?? null;

  return (
    <div className="rounded-xl border border-amber-200/70 bg-card/70 p-3 dark:border-amber-500/20">
      {showName && (
        <p className="mb-1 text-sm font-medium text-foreground">{clan.clanName}</p>
      )}
      {clan.pausedReason && (
        <p className="mb-2 text-sm text-muted-foreground">
          Reason given: <span className="text-foreground">{clan.pausedReason}</span>
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {primary
          ? <>One message to <span className="font-medium text-foreground">{primary.name}</span> puts you back in &mdash; resuming you takes them a single click.</>
          : <>Ask a mentor in this clan to resume you &mdash; it takes them a single click.</>}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Ask to come back
        </Link>
        {primary?.email && (
          <a
            href={`mailto:${primary.email}?subject=${encodeURIComponent(`Please resume me in ${clan.clanName}`)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email {primary.name.split(' ')[0]}
          </a>
        )}
      </div>
      {clan.mentors.length > 1 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Also here to help: {clan.mentors.slice(1).map((m) => m.name).join(', ')}
        </p>
      )}
    </div>
  );
}

export default PausedBanner;
