import React, { useEffect, useRef } from 'react';
import { Check, X, Minus, HelpCircle, Pause } from 'lucide-react';
import { getInitials } from '@/lib/utils/formatting';
import { Avatar } from '@/components/shared/Avatar';

type Attendance = 'present' | 'absent' | 'excused' | null;

export interface AttendanceMentee {
  id: string;
  name: string;
  /** Pre-computed initials from the cohort payload; falls back to deriving them. */
  avatar?: string;
  profilePictureUrl?: string | null;
  /**
   * Paused in this clan. They are shown — a mentor cannot bring back somebody
   * they cannot see — but attendance does not apply to them, so the chip is
   * muted and carries a pause badge instead of a present/absent one.
   */
  paused?: boolean;
}

interface MenteeAttendanceCardProps {
  mentee: AttendanceMentee;
  attendance: Attendance;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Instagram-story-style attendance chip: a circular avatar wrapped in a
 * status-coloured ring, a small status badge, and the mentee's first name.
 * The ring/badge encode attendance at a glance (green = present, red = absent,
 * amber = excused, grey = not yet marked), and the active mentee gets a brand
 * halo so the mentor never loses their place while scrubbing the cohort.
 */

const RING: Record<NonNullable<Attendance> | 'null', string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  excused: 'bg-amber-400',
  null: 'bg-slate-200',
};

const BADGE: Record<NonNullable<Attendance> | 'null', { cls: string; Icon: typeof Check }> = {
  present: { cls: 'bg-emerald-500 text-white', Icon: Check },
  absent: { cls: 'bg-red-500 text-white', Icon: X },
  excused: { cls: 'bg-amber-400 text-white', Icon: Minus },
  null: { cls: 'bg-slate-300 text-white', Icon: HelpCircle },
};

export function MenteeAttendanceCard({ mentee, attendance, isActive, onClick }: MenteeAttendanceCardProps) {
  const key = (attendance ?? 'null') as NonNullable<Attendance> | 'null';
  const paused = !!mentee.paused;
  const ring = paused ? 'bg-slate-300' : RING[key];
  const { cls: badgeCls, Icon } = paused
    ? { cls: 'bg-slate-400 text-white', Icon: Pause }
    : BADGE[key];
  const initials = mentee.avatar || getInitials(mentee.name);
  const firstName = mentee.name.split(' ')[0];

  // When this becomes the active mentee (e.g. via the Prev/Next/Skip buttons),
  // bring the chip into view so the mentor can see where they are in the rail.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [isActive]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      title={paused ? `${mentee.name} — paused in this clan` : `${mentee.name} — ${attendance ?? 'not marked'}`}
      aria-pressed={isActive}
      className={`group/card relative flex shrink-0 snap-start flex-col items-center gap-2 rounded-2xl px-1.5 pb-1.5 pt-2 outline-none transition-colors ${
        isActive ? 'w-[92px] bg-brand-50/80 dark:bg-brand-500/10' : 'w-[84px]'
      }`}
    >
      {/* The one being reviewed is lifted out of the row entirely: its own
          tinted tile, a bigger avatar, and a marker pointing at the card below
          it. A thin ring on a row of fourteen faces was not findable. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand-500"
        />
      )}
      <div className="relative">
        {/* Status ring — a coloured halo around the avatar. The person being
            reviewed right now carries the running light, so "where am I" is
            answerable from the rail without reading a single name. */}
        <div
          className={`rounded-full transition-transform duration-200 group-hover/card:-translate-y-0.5 ${ring} ${
            isActive ? 'pm-snake pm-snake-ring scale-110 p-[3px] shadow-lg shadow-brand-500/25' : 'p-[3px]'
          }`}
        >
          <div className="rounded-full bg-card p-[2px]">
            <Avatar
              name={mentee.name}
              src={mentee.profilePictureUrl}
              initials={initials}
              size="lg"
              tone={paused ? 'muted' : 'brand'}
            />
          </div>
        </div>

        {/* Status badge — bottom-right tick / cross / dash / question. */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${badgeCls}`}
        >
          <Icon className="w-3 h-3" strokeWidth={3} />
        </span>
      </div>

      <span
        className={`max-w-full truncate text-xs ${
          isActive
            ? 'rounded-full bg-brand-600 px-2 py-0.5 font-semibold text-white'
            : paused
              ? 'font-medium text-slate-400'
              : 'font-medium text-slate-700 group-hover/card:text-slate-900'
        }`}
      >
        {firstName}
      </span>
    </button>
  );
}
