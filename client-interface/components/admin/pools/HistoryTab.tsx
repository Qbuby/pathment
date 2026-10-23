'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, History, ListChecks, Settings2, UserMinus, UserPlus, Waypoints, type LucideIcon } from 'lucide-react';
import { useApiQuery } from '@/lib/query';
import { poolApi, type PoolDashboard, type PoolHistoryEvent, type PoolStatus } from '@/lib/services/pool-api';
import { EmptyState, ErrorNote, POOL_STATUS, PanelHeader, Spinner, fmtDate, panel } from './poolUi';

/**
 * The pool's history, read as sentences.
 *
 * Each event is logged with ids and raw counts; this turns them into what a
 * person wants to know — who, what, and why — using the names and titles the
 * pool page has already loaded. Anything it cannot name falls back to a plain
 * phrase, never to an id or a JSON dump.
 */

type Group = 'candidates' | 'work' | 'selection' | 'placement' | 'setup';

const GROUPS: { key: Group | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'work', label: 'Work & scores' },
  { key: 'selection', label: 'Selection' },
  { key: 'placement', label: 'Placement' },
  { key: 'setup', label: 'Setup' },
];

const META: Record<string, { label: string; group: Group; icon: LucideIcon; cls: string }> = {
  POOL_CREATED: { label: 'Pool created', group: 'setup', icon: Settings2, cls: 'bg-muted text-slate-500' },
  POOL_UPDATED: { label: 'Settings changed', group: 'setup', icon: Settings2, cls: 'bg-muted text-slate-500' },
  POOL_STATUS_CHANGED: { label: 'Stage changed', group: 'setup', icon: Settings2, cls: 'bg-muted text-slate-500' },
  POOL_ARCHIVED: { label: 'Pool archived', group: 'setup', icon: Settings2, cls: 'bg-muted text-slate-500' },
  POOL_MEMBERS_IMPORTED: { label: 'Candidates added', group: 'candidates', icon: UserPlus, cls: 'bg-brand-50 text-brand-600' },
  POOL_INVITE_RESENT: { label: 'Invitation sent again', group: 'candidates', icon: UserPlus, cls: 'bg-brand-50 text-brand-600' },
  POOL_MEMBER_WITHDRAWN: { label: 'Candidate withdrawn', group: 'candidates', icon: UserMinus, cls: 'bg-rose-50 text-rose-600' },
  POOL_MEMBER_DISQUALIFIED: { label: 'Candidate disqualified', group: 'candidates', icon: UserMinus, cls: 'bg-rose-50 text-rose-600' },
  POOL_WORK_CREATED: { label: 'Work added', group: 'work', icon: ClipboardList, cls: 'bg-amber-50 text-amber-600' },
  POOL_WORK_ASSIGNED: { label: 'Work given to candidates', group: 'work', icon: ClipboardList, cls: 'bg-amber-50 text-amber-600' },
  POOL_WORK_CANCELLED: { label: 'Work cancelled', group: 'work', icon: ClipboardList, cls: 'bg-amber-50 text-amber-600' },
  POOL_MANUAL_SCORE_SET: { label: 'Score entered by hand', group: 'work', icon: ListChecks, cls: 'bg-violet-50 text-violet-600' },
  POOL_SHORTLIST_GENERATED: { label: 'Shortlist generated', group: 'selection', icon: ListChecks, cls: 'bg-violet-50 text-violet-600' },
  POOL_SELECTION_CONFIRMED: { label: 'Selection confirmed', group: 'selection', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-600' },
  POOL_DECISION_CHANGED: { label: 'Decision changed', group: 'selection', icon: ListChecks, cls: 'bg-violet-50 text-violet-600' },
  POOL_PLACEMENT_PLANNED: { label: 'Clans planned', group: 'placement', icon: Waypoints, cls: 'bg-blue-50 text-blue-600' },
  POOL_PLACEMENT_RUN: { label: 'Candidates placed in clans', group: 'placement', icon: Waypoints, cls: 'bg-blue-50 text-blue-600' },
};
const FALLBACK = { label: 'Pool updated', group: 'setup' as Group, icon: Settings2, cls: 'bg-muted text-slate-500' };

const FIELD_LABEL: Record<string, string> = {
  name: 'name', description: 'description', selectionQuota: 'how many to select', capacity: 'capacity',
  opensAt: 'opening date', closesAt: 'closing date', qualificationDueAt: 'qualification deadline',
  scoringPolicy: 'scoring', reminderPolicy: 'reminders', settings: 'options', cohortId: 'cohort',
};
const DATE_FIELDS = new Set(['opensAt', 'closesAt', 'qualificationDueAt']);
const OUTCOME_LABEL: Record<string, string> = { selected: 'Selected', waitlisted: 'Waitlisted', not_selected: 'Not selected' };
const KIND_LABEL: Record<string, string> = { task: 'task', quiz: 'quiz', interview: 'interview' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Join only the parts that say something: "2 invited · 1 already in the pool". */
const parts = (...items: (string | false | null | undefined)[]) => items.filter(Boolean).join(' · ');

interface Lookups {
  member: (id?: unknown) => string | null;
  component: (key?: unknown) => string | null;
  work: (id?: unknown) => string | null;
}

interface Described { text: string; notes?: { text: string; tone?: 'warn' | 'block' }[] }

function describe(e: PoolHistoryEvent, look: Lookups): Described {
  const v = (e.newValues || {}) as Record<string, unknown>;
  const old = (e.oldValues || {}) as Record<string, unknown>;
  const n = (k: string) => Number(v[k]) || 0;
  const quote = (s: unknown) => (s ? `“${String(s)}”` : '');
  const who = look.member(v.memberId) || (v.email ? String(v.email) : 'A candidate');

  switch (e.action) {
    case 'POOL_CREATED':
      return { text: parts(v.name ? `“${v.name}”` : null, v.selectionQuota ? `to select ${v.selectionQuota}` : null) };
    case 'POOL_UPDATED': {
      const changed = Array.isArray(v.changed) ? (v.changed as string[]) : [];
      if (!changed.length) return { text: '' };
      return {
        text: `Changed the ${changed.map((k) => {
          const label = FIELD_LABEL[k] || k;
          const was = old[k];
          if (was === undefined || was === null || was === '' || typeof was === 'object') return label;
          return `${label} (was ${DATE_FIELDS.has(k) ? fmtDate(String(was)) : String(was)})`;
        }).join(', ')}`,
      };
    }
    case 'POOL_STATUS_CHANGED': {
      const label = (s: unknown) => POOL_STATUS[s as PoolStatus]?.label || String(s);
      return { text: `${label(v.from)} → ${label(v.to)}` };
    }
    case 'POOL_MEMBERS_IMPORTED':
      return {
        text: parts(
          v.source === 'application' ? 'From Intake applications' : 'From a list of emails',
          n('added') > 0 && `${n('added')} joined`,
          n('invited') > 0 && `${n('invited')} invited by email`,
          n('skipped') > 0 && `${n('skipped')} already in the pool`,
          n('failed') > 0 && `${n('failed')} could not be added`,
        ),
      };
    case 'POOL_INVITE_RESENT':
      return { text: `To ${v.email || who}` };
    case 'POOL_MEMBER_WITHDRAWN':
    case 'POOL_MEMBER_DISQUALIFIED':
      return { text: parts(who, quote(v.reason)) };
    case 'POOL_WORK_CREATED':
      return {
        text: parts(
          v.title ? `“${v.title}”` : null,
          v.kind ? KIND_LABEL[String(v.kind)] || String(v.kind) : null,
          look.component(v.componentKey) ? `counts towards ${look.component(v.componentKey)}` : 'not scored',
        ),
      };
    case 'POOL_WORK_ASSIGNED':
      return {
        text: parts(
          look.work(v.assignmentId) ? `“${look.work(v.assignmentId)}”` : null,
          n('assigned') > 0 ? `given to ${plural(n('assigned'), 'candidate')}` : 'nobody new to give it to',
          n('skipped') > 0 && `${n('skipped')} already had it`,
          n('failed') > 0 && `${n('failed')} failed`,
        ),
      };
    case 'POOL_WORK_CANCELLED':
      return {
        text: parts(
          look.work(v.assignmentId) ? `“${look.work(v.assignmentId)}”` : null,
          n('cancelled') > 0 && `withdrawn from ${plural(n('cancelled'), 'candidate')}`,
          quote(v.reason),
        ),
      };
    case 'POOL_MANUAL_SCORE_SET': {
      const fmt = (s: unknown) => (s === null || s === undefined ? 'none' : `${s}`);
      const before = old.score;
      return {
        text: parts(
          who,
          look.component(v.componentKey),
          before === null || before === undefined ? `${fmt(v.score)}/100` : `${fmt(before)} → ${fmt(v.score)}/100`,
        ),
      };
    }
    case 'POOL_SHORTLIST_GENERATED': {
      const issues = Array.isArray(v.blockers) ? (v.blockers as { message?: string; severity?: string }[]) : [];
      return {
        text: parts(`Version ${v.version}`, typeof v.entryCount === 'number' && `${plural(v.entryCount, 'candidate')} ranked`, v.quota ? `top ${v.quota} proposed` : null),
        notes: issues.filter((b) => b?.message).map((b) => ({ text: String(b.message), tone: b.severity === 'block' ? 'block' as const : 'warn' as const })),
      };
    }
    case 'POOL_SELECTION_CONFIRMED': {
      const overrides = Array.isArray(v.overrides) ? (v.overrides as { memberId?: string; outcome?: string; reason?: string }[]) : [];
      return {
        text: parts(
          `From version ${v.version}`,
          n('selected') > 0 && `${n('selected')} selected`,
          n('waitlisted') > 0 && `${n('waitlisted')} waitlisted`,
          n('notSelected') > 0 && `${n('notSelected')} not selected`,
        ),
        notes: overrides.map((o) => ({
          text: `${look.member(o.memberId) || 'A candidate'} → ${OUTCOME_LABEL[o.outcome || ''] || o.outcome}${o.reason ? `: “${o.reason}”` : ''}`,
        })),
      };
    }
    case 'POOL_DECISION_CHANGED':
      return { text: parts(`${who} → ${OUTCOME_LABEL[String(v.decision)] || v.decision}`, quote(v.reason)) };
    case 'POOL_PLACEMENT_PLANNED':
      return { text: n('saved') > 0 ? `Chose a clan for ${plural(n('saved'), 'candidate')}` : '' };
    case 'POOL_PLACEMENT_RUN': {
      const failures = Array.isArray(v.failures) ? (v.failures as { memberId?: string; reason?: string }[]) : [];
      return {
        text: parts(
          n('placed') > 0 ? `${n('placed')} placed` : 'Nobody new placed',
          n('alreadyPlaced') > 0 && `${n('alreadyPlaced')} already placed`,
          n('failed') > 0 && `${n('failed')} failed`,
        ),
        notes: failures.map((f) => ({ text: `${look.member(f.memberId) || 'A candidate'}: ${f.reason || 'could not be placed'}`, tone: 'block' as const })),
      };
    }
    default:
      return { text: '' };
  }
}

const dayKey = (d: Date) => d.toLocaleDateString('en-CA');
function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function HistoryTab({ poolId, data }: { poolId: string; data?: PoolDashboard }) {
  const { data: events, loading, error } = useApiQuery({ queryKey: ['pools', poolId, 'history'], queryFn: () => poolApi.history(poolId) });
  const [group, setGroup] = useState<Group | 'all'>('all');

  const look: Lookups = useMemo(() => {
    const members = new Map((data?.members || []).map((m) => [m.id, m.name || m.email]));
    const components = new Map((data?.pool.scoringPolicy?.components || []).map((c) => [c.key, c.label]));
    const work = new Map((data?.assignments || []).map((a) => [a.id, a.title]));
    return {
      member: (id) => (typeof id === 'string' ? members.get(id) || null : null),
      component: (key) => (typeof key === 'string' ? components.get(key) || null : null),
      work: (id) => (typeof id === 'string' ? work.get(id) || null : null),
    };
  }, [data]);

  const all = useMemo(() => events || [], [events]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const e of all) { const g = (META[e.action] || FALLBACK).group; c[g] = (c[g] || 0) + 1; }
    return c;
  }, [all]);
  const shown = group === 'all' ? all : all.filter((e) => (META[e.action] || FALLBACK).group === group);

  // Newest first, grouped under a heading per day.
  const days = useMemo(() => {
    const out: { key: string; label: string; items: PoolHistoryEvent[] }[] = [];
    for (const e of shown) {
      const d = new Date(e.createdAt);
      const key = dayKey(d);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, label: dayLabel(d), items: [e] });
    }
    return out;
  }, [shown]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <section className={panel}>
      <PanelHeader icon={History} title="History" count={all.length} subtitle="Everything that happened in this pool — what, who, and why." />
      {!all.length ? (
        <div className="border-t border-border"><EmptyState icon={History} title="Nothing yet" text="Changes to the pool appear here as they happen." /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3 sm:px-6" role="tablist" aria-label="Filter history">
            {GROUPS.filter((g) => g.key === 'all' || counts[g.key]).map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={group === g.key}
                onClick={() => setGroup(g.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  group === g.key ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {g.label}
                <span className="text-xs tabular-nums opacity-70">{counts[g.key] || 0}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border px-5 py-5 sm:px-6">
            {days.map((day) => (
              <div key={day.key} className="mb-6 last:mb-0">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{day.label}</h3>
                <ol>
                  {day.items.map((e, i) => {
                    const meta = META[e.action] || FALLBACK;
                    const { text, notes } = describe(e, look);
                    const time = new Date(e.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    const by = e.user ? `${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() : '';
                    return (
                      <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
                        {i < day.items.length - 1 && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden="true" />}
                        <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
                          <meta.icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1 pt-1">
                          <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                          {text && <p className="mt-0.5 text-sm text-slate-600">{text}</p>}
                          {notes && notes.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                              {notes.map((note, j) => (
                                <li key={j} className={`rounded-lg px-2.5 py-1 text-xs ${
                                  note.tone === 'block' ? 'bg-rose-50 text-rose-700' : note.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
                                }`}>{note.text}</li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>{time}</time>
                            {by && <> · {by}</>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
