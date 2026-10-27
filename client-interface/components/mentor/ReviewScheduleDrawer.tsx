'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Trash2, Plus, Repeat, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { mentorApi } from '@/lib/services/mentor-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { ClanLite } from '@/lib/context/ClanContext';

interface ReviewSchedule {
  id: string;
  clanId: string;
  title: string | null;
  dayOfWeek: number;
  timeLocal: string;
  timezone: string;
  intervalWeeks: number;
  durationMinutes: number;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
  clan?: { id: string; name: string } | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INTERVAL_OPTIONS = [
  { value: '1', label: 'Every week' },
  { value: '2', label: 'Every other week' },
];
const DURATION_OPTIONS = [30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }));

const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};
// Local YYYY-MM-DD for "today" (default start date), no UTC shift.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const niceDay = (key: string) =>
  parseKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * A month grid for choosing the first review.
 *
 * It replaces a weekday dropdown AND a typed date field, which between them
 * let you pick "Monday" and a start date that falls on a Sunday — two
 * controls disagreeing about the same fact, with nothing on screen to say
 * which one won. Choosing a day on a calendar settles both at once, and a
 * date is easier to pick than to type.
 */
function MonthCalendar({ value, min, onChange }: {
  value: string;
  min: string;
  onChange: (key: string) => void;
}) {
  const selected = value ? parseKey(value) : new Date();
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const minKey = min;
  const todayKey = todayLocal();

  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  const shift = (months: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => shift(1)} aria-label="Next month"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-[10px] font-medium uppercase text-slate-400">{d}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const key = keyOf(d);
          const disabled = key < minKey;
          const isSelected = key === value;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onChange(key)}
              className={`aspect-square rounded-lg text-sm tabular-nums transition-colors ${
                isSelected
                  ? 'bg-brand-600 font-semibold text-white'
                  : disabled
                    ? 'text-slate-300 dark:text-slate-700'
                    : key === todayKey
                      ? 'font-semibold text-brand-700 ring-1 ring-brand-300 hover:bg-brand-50 dark:text-brand-300'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
  clans: ClanLite[];
  defaultClanId: string | null;
  readOnly?: boolean;
}

/**
 * ReviewScheduleDrawer — set up and manage recurring clan reviews. A mentor
 * picks a clan, weekday, local time and cadence; the backend materialises each
 * occurrence as a session (room auto-opens at the time) and emails everyone a
 * timezone-correct invite + reminders with a calendar attachment.
 */
export function ReviewScheduleDrawer({ open, onClose, clans, defaultClanId, readOnly = false }: Props) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<ReviewSchedule[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form state.
  const [clanId, setClanId] = useState(defaultClanId || clans[0]?.id || '');
  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1'); // Monday
  const [timeLocal, setTimeLocal] = useState('17:00');
  const [intervalWeeks, setIntervalWeeks] = useState('1');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [startsOn, setStartsOn] = useState(todayLocal());
  const [endsOn, setEndsOn] = useState('');
  /** An end date is rare, so it is behind a disclosure rather than on the form. */
  const [showEnd, setShowEnd] = useState(false);
  const tz = useMemo(browserTz, []);

  /** One date, chosen once: it fixes the first review AND the weekday it repeats on. */
  const pickFirstReview = (key: string) => {
    setStartsOn(key);
    setDayOfWeek(String(parseKey(key).getDay()));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await mentorApi.listReviewSchedules(); // eslint-disable-line @typescript-eslint/no-explicit-any
      setSchedules(r?.data ?? r?.data?.schedules ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    // Reset the create form each open.
    setClanId(defaultClanId || clans[0]?.id || '');
    setTitle(''); setTimeLocal('17:00');
    setIntervalWeeks('1'); setDurationMinutes('60'); setEndsOn(''); setShowEnd(false);
    const today = todayLocal();
    setStartsOn(today); setDayOfWeek(String(parseKey(today).getDay()));
  }, [open, load, defaultClanId, clans]);

  const clanName = (id: string) => clans.find((c) => c.id === id)?.name || 'Clan';

  const submit = async () => {
    const finalClanId = clanId || defaultClanId || clans[0]?.id;
    if (!finalClanId) { toast.error('Pick a clan'); return; }
    if (!/^\d{2}:\d{2}$/.test(timeLocal)) { toast.error('Pick a time'); return; }
    if (!startsOn) { toast.error('Pick a start date'); return; }
    if (endsOn && endsOn < startsOn) { toast.error('End date must be after the start date'); return; }
    try {
      setCreating(true);
      await mentorApi.createReviewSchedule({
        clanId: finalClanId,
        title: title.trim() || undefined,
        dayOfWeek: Number(dayOfWeek),
        timeLocal,
        timezone: tz,
        intervalWeeks: Number(intervalWeeks) as 1 | 2,
        durationMinutes: Number(durationMinutes),
        startsOn,
        endsOn: endsOn || null,
      });
      toast.success('Recurring review scheduled — invites are on their way');
      setTitle('');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the schedule'));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (s: ReviewSchedule) => {
    const ok = await confirm({
      title: 'Cancel this recurring review?',
      description: `New occurrences of "${s.title || `${clanName(s.clanId)} clan review`}" will stop. Upcoming, not-yet-started sessions are removed; past ones stay.`,
      variant: 'danger',
      confirmLabel: 'Cancel schedule',
    });
    if (!ok) return;
    try {
      setBusyId(s.id);
      await mentorApi.cancelReviewSchedule(s.id);
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: false } : x)));
      toast.success('Schedule cancelled');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not cancel the schedule'));
    } finally {
      setBusyId(null);
    }
  };

  const active = schedules.filter((s) => s.active);
  const multiClan = clans.length >= 2;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Recurring reviews"
      subtitle="Schedule a review that repeats — everyone gets a calendar invite and reminders."
      width="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50">Close</button>
          <button
            onClick={submit}
            disabled={creating || readOnly}
            title={readOnly ? 'Completed programs are read-only' : undefined}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Schedule review
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Existing schedules */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Active schedules</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
          ) : active.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-4 py-3">No recurring reviews yet. Set one up below.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((s) => (
                <li key={s.id} className="rounded-xl border border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{s.title || `${clanName(s.clanId)} clan review`}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {multiClan && <span>{clanName(s.clanId)}</span>}
                      <span className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" />{s.intervalWeeks === 2 ? 'Biweekly' : 'Weekly'}</span>
                      <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{DAYS[s.dayOfWeek]}s</span>
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{to12h(s.timeLocal)} · {s.durationMinutes}m</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{s.timezone}{s.endsOn ? ` · until ${s.endsOn}` : ''}</div>
                  </div>
                  <button
                    onClick={() => cancel(s)}
                    disabled={busyId === s.id || readOnly}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title={readOnly ? 'Completed programs are read-only' : 'Cancel this recurring review'}
                  >
                    {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create form */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">New recurring review</h3>

          {multiClan && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Clan</label>
              <SelectMenu
                value={clanId}
                onChange={setClanId}
                options={clans.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Pick a clan"
                ariaLabel="Clan"
              />
            </div>
          )}

          {/*
              Seven fields in a grid, two of which could contradict each other,
              is a form people get wrong and then distrust. This asks for the
              things in the order somebody actually decides them — which day,
              what time, how long, how often — and says the answer back in one
              sentence so nobody has to reassemble it from the controls.
          */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">First review</label>
            <MonthCalendar value={startsOn} min={todayLocal()} onChange={pickFirstReview} />
          </div>

          <div>
            <label htmlFor="review-time" className="block text-xs font-medium text-slate-600 mb-1">Time</label>
            <input
              id="review-time"
              type="time"
              value={timeLocal}
              onChange={(e) => setTimeLocal(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700"
            />
          </div>

          {/* Pills, not dropdowns: four short options each, and seeing them
              beats opening a menu to find out what the choices are. */}
          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1.5">Lasts</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duration">
              {DURATION_OPTIONS.map((o) => (
                <button key={o.value} type="button" aria-pressed={durationMinutes === o.value}
                  onClick={() => setDurationMinutes(o.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    durationMinutes === o.value
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1.5">Repeats</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cadence">
              {INTERVAL_OPTIONS.map((o) => (
                <button key={o.value} type="button" aria-pressed={intervalWeeks === o.value}
                  onClick={() => setIntervalWeeks(o.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    intervalWeeks === o.value
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* The whole form, read back as a sentence. */}
          {startsOn && (
            <p className="rounded-xl border border-brand-200 bg-brand-50/50 px-3.5 py-2.5 text-sm text-slate-700 dark:border-brand-500/20 dark:bg-brand-500/5 dark:text-slate-200">
              {INTERVAL_OPTIONS.find((o) => o.value === intervalWeeks)?.label.replace('Every', 'Every')}
              {' '}on <strong>{DAYS[Number(dayOfWeek)]}</strong> at <strong>{to12h(timeLocal)}</strong> for {durationMinutes} minutes,
              {' '}starting <strong>{niceDay(startsOn)}</strong>
              {endsOn ? <> until <strong>{niceDay(endsOn)}</strong></> : ''}.
            </p>
          )}

          {/* Optional, and almost always left empty — so it is a link, not a field. */}
          {showEnd || endsOn ? (
            <div>
              <label htmlFor="review-ends" className="block text-xs font-medium text-slate-600 mb-1">
                Ends on <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="review-ends"
                  type="date"
                  value={endsOn}
                  min={startsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700"
                />
                <button type="button" onClick={() => { setEndsOn(''); setShowEnd(false); }}
                  className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowEnd(true)}
              className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              + Add an end date
            </button>
          )}

          <div>
            <label htmlFor="review-title" className="block text-xs font-medium text-slate-600 mb-1">Title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              id="review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${clanName(clanId)} clan review`}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700"
            />
          </div>

          <p className="text-xs text-slate-400 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Times are in your timezone ({tz}). Each person sees the invite in their own.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

export default ReviewScheduleDrawer;
