'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, Check, EyeOff, GripVertical, LayoutTemplate, Loader2, Lock, Plus, Route,
  Trash2, Unlock, X,
} from 'lucide-react';

import {
  scheduleApi,
  type ChainRoadmapDetail, type PlanBoard, type PlanItem, type PlanSlot, type SelectableTemplate,
} from '@/lib/services/schedule-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * A day as blocks you can put things in.
 *
 * Built around how few actions it takes to use, because a planner people have
 * to fight is a planner they stop opening:
 *
 *   add an item   type in the block and press Enter — the field is always
 *                 there, so it is one action, not "click +, fill a modal, save"
 *   move an item  drag it, or pick it up with the keyboard and drop it in
 *   finish it     one click on the box
 *
 * Nothing here asks "are you sure". Every action is reversible, and a
 * confirmation on a reversible action is just a second click.
 *
 * One component serves the mentee and the mentor. The server decides what each
 * of them may do and sends it down per block as `rights`, so this never has to
 * guess from a role — and the two views cannot drift apart, because there is
 * only one.
 */
export function DayPlanner({
  menteeId = 'me',
  clanId = null,
  onChanged,
}: {
  /** 'me' for a mentee's own day; a real id when a mentor is planning with them. */
  menteeId?: string;
  clanId?: string | null;
  onChanged?: () => void;
}) {
  const [board, setBoard] = useState<PlanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  /** The item picked up by keyboard, for people not using a mouse. */
  const [carrying, setCarrying] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [templates, setTemplates] = useState<SelectableTemplate[] | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await scheduleApi.getBoard(menteeId, clanId);
      setBoard(res.data ?? null);
      setError(null);
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Could not load this plan'));
    } finally {
      setLoading(false);
    }
  }, [menteeId, clanId]);

  useEffect(() => { void load(); }, [load]);

  // What this workspace offers a mentee to choose from. Quiet on failure: a
  // missing list just means no button, never an error on their day.
  useEffect(() => {
    let live = true;
    scheduleApi.listSelectableTemplates(menteeId, clanId)
      .then((r) => { if (live) setTemplates(r.data?.templates ?? []); })
      .catch(() => { if (live) setTemplates([]); });
    return () => { live = false; };
  }, [menteeId, clanId]);

  const mark = (id: string, on: boolean) => setBusy((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /**
   * Run a change, show the result immediately, and put it back if the server
   * disagrees. The optimistic copy is what makes ticking feel like ticking
   * rather than like submitting a form.
   */
  const optimistic = async (id: string, apply: (b: PlanBoard) => PlanBoard, call: () => Promise<unknown>) => {
    const before = board;
    if (before) setBoard(apply(before));
    mark(id, true);
    try {
      await call();
      await load(true);
      onChanged?.();
    } catch (e) {
      if (before) setBoard(before);
      toast.error(extractApiErrorMessage(e, 'That did not save'));
    } finally {
      mark(id, false);
    }
  };

  const moveItem = (taskId: string, toSlot: string | null) => {
    setCarrying(null);
    setDropTarget(null);
    void optimistic(taskId, (b) => {
      let moved: PlanItem | undefined;
      const slots = b.slots.map((s) => {
        const found = s.items.find((i) => i.id === taskId);
        if (found) moved = found;
        return { ...s, items: s.items.filter((i) => i.id !== taskId) };
      });
      const fromTray = b.unplanned.find((i) => i.id === taskId);
      if (fromTray) moved = fromTray;
      const unplanned = b.unplanned.filter((i) => i.id !== taskId);
      if (!moved) return b;
      if (toSlot === null) return { ...b, slots, unplanned: [...unplanned, moved] };
      return {
        ...b, unplanned,
        slots: slots.map((s) => (s.id === toSlot ? { ...s, items: [...s.items, moved as PlanItem] } : s)),
      };
    }, () => scheduleApi.movePlanItem(taskId, toSlot, clanId));
  };

  const toggleDone = (item: PlanItem) => {
    if (item.kind === 'review') {
      /**
       * Deliberately not silent — ticking work for review would tell nobody
       * anything; it has to go through a submission, which is where the
       * feedback and the points come from.
       *
       * And deliberately in the right voice. This said "open it from My
       * learning and submit your work" to EVERYONE, so a mentor looking at
       * their mentee's day was told to go and submit it themselves.
       */
      toast.message(mine ? 'This one goes to your mentor' : 'This one is theirs to submit', {
        description: mine
          ? 'Open it from My learning and submit your work.'
          : 'It reaches your Approvals queue once they send it in.',
      });
      return;
    }
    const done = item.status !== 'completed';
    void optimistic(item.id, (b) => ({
      ...b,
      slots: b.slots.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === item.id ? { ...i, status: done ? 'completed' : 'assigned' } : i)),
        done: s.items.filter((i) => (i.id === item.id ? done : i.status === 'completed')).length,
      })),
    }), () => scheduleApi.setPlanItemDone(item.id, done));
  };

  const addItem = async (slotId: string, title: string) => {
    const text = title.trim();
    if (!text) return;
    mark(slotId, true);
    try {
      await scheduleApi.addPlanItem(menteeId, slotId, { title: text, kind: 'personal', clanId });
      await load(true);
      onChanged?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add that'));
    } finally {
      mark(slotId, false);
    }
  };

  /**
   * Whose day this is, from the server rather than from a prop.
   *
   * Every piece of copy below turns on it. The planner used to be written
   * entirely in the mentee's voice and handed unchanged to mentors, who were
   * shown "From your mentor" on blocks they had set themselves.
   */
  const mine = board?.viewer.isOwnerMentee ?? true;

  const totals = useMemo(() => {
    const all = (board?.slots ?? []).flatMap((s) => s.items);
    return { total: all.length, done: all.filter((i) => i.status === 'completed').length };
  }, [board]);

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-label="Loading plan" />
      </div>
    );
  }
  if (error || !board) {
    return <p className="py-8 text-sm text-muted-foreground">{error || 'No plan to show.'}</p>;
  }

  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/*
        It has to say what it is.
        
        This opened as a bare "Today" above three empty boxes, dropped into the
        middle of the mentee's dashboard with nothing to explain it — so the
        first thing a mentee met was three identical prompts and no idea what
        they were for. The heading names the thing, and the line under it says
        what to do, which is the only job an empty state has.
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-card px-4 py-3 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
            {mine ? 'Your day' : 'Their day'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {totals.total === 0
              ? (mine
                ? 'Blocks are the shape of your day. Put work in one to plan it — type and press Enter.'
                : 'Nothing in their blocks yet. Type into a block to put work there.')
              : `${totals.done} of ${totals.total} done today`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>

      {carrying && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          Carrying an item. Choose a block to drop it in, or press Escape to put it back.
        </p>
      )}

      <ul className="space-y-3">
        {board.slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            busy={busy.has(slot.id)}
            carrying={carrying}
            isDropTarget={dropTarget === slot.id}
            onDropTarget={setDropTarget}
            onDropItem={(taskId) => moveItem(taskId, slot.id)}
            onCarry={setCarrying}
            onToggleDone={toggleDone}
            onAddItem={(title) => addItem(slot.id, title)}
            onRetime={(patch) => optimistic(slot.id, (b) => b,
              () => scheduleApi.updatePlanSlot(menteeId, slot.id, { ...patch, clanId }))}
            onRemove={() => optimistic(slot.id, (b) => ({ ...b, slots: b.slots.filter((s) => s.id !== slot.id) }),
              () => scheduleApi.removePlanSlot(menteeId, slot.id, clanId))}
            onHide={() => optimistic(slot.id, (b) => ({ ...b, slots: b.slots.filter((s) => s.id !== slot.id) }),
              () => scheduleApi.hidePlanSlot(menteeId, slot.id, true, clanId))}
            mine={mine}
            itemBusy={busy}
          />
        ))}
      </ul>

      {board.slots.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-slate-700">
          No blocks yet. Add one and your day has somewhere to live.
        </p>
      )}

      {addingBlock ? (
        <NewBlock
          onCancel={() => setAddingBlock(false)}
          onSave={async (label, time) => {
            try {
              await scheduleApi.addPlanSlot(menteeId, { label, time, clanId });
              setAddingBlock(false);
              await load(true);
              onChanged?.();
            } catch (e) {
              toast.error(extractApiErrorMessage(e, 'Could not add that block'));
            }
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddingBlock(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {board.viewer.isOwnerMentee ? 'Add your own block' : 'Add a block'}
          </button>

          {/* Only shown once we know something is on offer, so a workspace that
              publishes no templates never grows a button that leads nowhere. */}
          {board.viewer.isOwnerMentee && templates !== null && templates.length > 0 && (
            <button
              type="button"
              onClick={() => setPickingTemplate((v) => !v)}
              aria-expanded={pickingTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              <LayoutTemplate className="h-4 w-4" aria-hidden />
              Start from a template
            </button>
          )}
        </div>
      )}

      {pickingTemplate && templates && templates.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await scheduleApi.applySelectableTemplate(menteeId, t.id, clanId);
                    const added = res.data?.added ?? 0;
                    toast.success(added
                      ? `Added ${added} block${added === 1 ? '' : 's'} to your day`
                      : 'Your day already has those blocks');
                    setPickingTemplate(false);
                    await load(true);
                    onChanged?.();
                  } catch (e) {
                    toast.error(extractApiErrorMessage(e, 'Could not add that template'));
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-card p-3.5 text-left transition-colors hover:border-brand-300 dark:border-slate-800"
              >
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {t.blocks.map((b) => `${b.time} ${b.label}`).join(' · ')}
                </p>
              </button>
            </li>
          ))}
          {/* Says plainly what taking one does, because "apply template" reads
              like it might replace the day. It never does. */}
          <li className="sm:col-span-2 text-[11px] text-muted-foreground">
            Blocks are added to your day. Nothing you or your mentor already set is changed.
          </li>
        </ul>
      )}

      {/* Work that exists but is not on the day yet. Hidden when there is none,
          so the common case shows no extra chrome. */}
      {board.unplanned.length > 0 && (
        <section
          onDragOver={(e) => { e.preventDefault(); setDropTarget('__tray__'); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) moveItem(id, null); }}
          onClick={() => { if (carrying) moveItem(carrying, null); }}
          className={`rounded-2xl border bg-card p-4 transition-colors dark:bg-slate-900/40 ${
            dropTarget === '__tray__' ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          {/*
            This read "NOT ON THE DAY YET · 2" and sat directly above the
            dashboard's own work queue showing the same two tasks, so a mentee
            met the same work twice on one screen with no hint that these two
            lists did different jobs. Saying what to DO with them is what tells
            them apart: the queue is for reading, this is for planning.
          */}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mine ? 'Work to plan' : 'Not in a block yet'} · {board.unplanned.length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mine
              ? 'Drag one into a block above to decide when you’ll do it — or use the handle and tap a block.'
              : 'Drag one into a block to give it a time in their day.'}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {board.unplanned.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                busy={busy.has(item.id)}
                carrying={carrying === item.id}
                onCarry={setCarrying}
                onToggleDone={toggleDone}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ── one block ───────────────────────────────────────────────────────────── */

function SlotCard({
  slot, busy, carrying, isDropTarget, onDropTarget, onDropItem, onCarry,
  onToggleDone, onAddItem, onRetime, onRemove, onHide, itemBusy, mine,
}: {
  slot: PlanSlot;
  busy: boolean;
  carrying: string | null;
  isDropTarget: boolean;
  onDropTarget: (id: string | null) => void;
  onDropItem: (taskId: string) => void;
  onCarry: (id: string | null) => void;
  onToggleDone: (item: PlanItem) => void;
  onAddItem: (title: string) => void;
  onRetime: (patch: { time?: string; label?: string; locked?: boolean }) => void;
  onRemove: () => void;
  onHide: () => void;
  itemBusy: Set<string>;
  /** True when the viewer IS the mentee. Decides whose voice the block speaks in. */
  mine: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ownerChip = slot.owner === 'mentee'
    ? {
      text: mine ? 'Your block' : 'Theirs',
      cls: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    }
    : slot.locked
      ? { text: 'Locked', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
      : {
        text: mine ? 'From your mentor' : 'You set this',
        cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      };

  return (
    <li
      onDragOver={(e) => { e.preventDefault(); onDropTarget(slot.id); }}
      onDragLeave={() => onDropTarget(null)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropItem(id); }}
      onClick={() => { if (carrying) onDropItem(carrying); }}
      className={`rounded-2xl border bg-card transition-colors dark:bg-slate-900/40 ${
        isDropTarget ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span className="pt-0.5 font-mono text-[13px] tabular-nums text-foreground">{slot.time}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <input
                defaultValue={slot.label}
                aria-label="Block name"
                autoFocus
                onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== slot.label) onRetime({ label: e.target.value.trim() }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
                className="rounded-lg border border-slate-200 bg-card px-2 py-0.5 text-sm font-semibold dark:border-slate-700"
              />
            ) : (
              <button
                type="button"
                disabled={!slot.rights.canRetime}
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="text-sm font-semibold text-foreground disabled:cursor-default"
                title={slot.rights.canRetime ? 'Rename this block' : 'Your mentor locked this block'}
              >
                {slot.label}
              </button>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ownerChip.cls}`}>
              {ownerChip.text}
            </span>
            {slot.editedByMentee && slot.owner === 'mentor' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Changed
              </span>
            )}
          </div>
          {slot.items.length > 0 && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{slot.done} of {slot.items.length} done</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
          {slot.rights.canLock && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetime({ locked: !slot.locked }); }}
              title={slot.locked ? 'Let them move this block' : 'Lock this block so it cannot be moved'}
              aria-label={slot.locked ? 'Unlock block' : 'Lock block'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              {slot.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          )}
          {slot.rights.canRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              aria-label={`Remove ${slot.label}`}
              title={mine
                ? 'Remove this block — anything in it goes back to your list'
                : 'Remove this block — anything in it goes back to their list'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* A block you were given is not yours to delete — but one bad day is
              not a reason to carry it either. It comes back tomorrow by itself. */}
          {slot.rights.canHide && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHide(); }}
              aria-label={`Skip ${slot.label} today`}
              title="Skip this one today — it comes back tomorrow"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* A roadmap block is governed by its chain, so the chain is what it has
          to show. Without this it rendered as an empty block with a label,
          which is worse than showing nothing: it looked like work had been
          lost. */}
      {slot.chainDetails && slot.chainDetails.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 px-4">
          {slot.chainDetails.map((chain, i) => (
            <ChainRow key={chain.id || `chain-${i}`} chain={chain} index={i} total={slot.chainDetails!.length} />
          ))}
        </ul>
      )}

      <ul className="mt-2.5 space-y-1.5 px-4">
        {slot.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            busy={itemBusy.has(item.id)}
            carrying={carrying === item.id}
            onCarry={onCarry}
            onToggleDone={onToggleDone}
          />
        ))}
      </ul>

      {/* Always present, never behind a button: adding something is one action. */}
      <div className="px-4 pb-3.5 pt-2" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          id={`plan-add-${slot.id}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) { onAddItem(draft); setDraft(''); }
            if (e.key === 'Escape') setDraft('');
          }}
          placeholder={slot.items.length
            ? (mine ? 'Add another…' : 'Add another for them…')
            : (mine ? 'What goes in this block?' : `Add work to ${slot.label}…`)}
          aria-label={`Add an item to ${slot.label}`}
          className="w-full rounded-xl border border-transparent bg-slate-50 px-3 py-2 text-sm text-foreground placeholder:text-slate-400 hover:border-slate-200 focus:border-brand-300 focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-800/60 dark:hover:border-slate-700"
        />
      </div>
    </li>
  );
}

/* ── one item ────────────────────────────────────────────────────────────── */

function ItemRow({ item, busy, carrying, onCarry, onToggleDone }: {
  item: PlanItem;
  busy: boolean;
  carrying: boolean;
  onCarry: (id: string | null) => void;
  onToggleDone: (item: PlanItem) => void;
}) {
  const done = item.status === 'completed';
  const waiting = item.status === 'submitted';
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`group flex items-start gap-2.5 rounded-xl border bg-card px-2.5 py-2 dark:bg-slate-900/60 ${
        carrying ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Keyboard route to the same thing dragging does, so the planner is not
          mouse-only. Space picks up, then a block takes it. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onCarry(carrying ? null : item.id); }}
        aria-label={carrying ? `Put ${item.title} back` : `Pick up ${item.title} to move it`}
        className="mt-0.5 cursor-grab rounded p-0.5 text-slate-300 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:text-slate-500"
      >
        {carrying ? <X className="h-3.5 w-3.5" /> : <GripVertical className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDone(item); }}
        disabled={busy}
        aria-label={done ? `Reopen ${item.title}` : `Finish ${item.title}`}
        aria-pressed={done}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-colors ${
          done ? 'border-emerald-600 bg-emerald-600 text-white'
            : waiting ? 'border-sky-500 bg-sky-500 text-white'
              : 'border-slate-300 bg-card hover:border-brand-500 dark:border-slate-600'
        }`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : (done || waiting) && <Check className="h-3 w-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${
            item.kind === 'review'
              ? 'border-sky-200 text-sky-700 dark:border-sky-500/30 dark:text-sky-300'
              : 'border-brand-200 text-brand-700 dark:border-brand-500/30 dark:text-brand-300'
          }`}>
            {item.kind === 'review' ? 'For review' : 'Personal'}
          </span>
          {waiting && <span className="text-[10px] font-medium text-sky-600">Awaiting your mentor</span>}
          {item.fromRoadmapSlot && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Here because this block runs its roadmap">
              <Route className="h-3 w-3" aria-hidden />roadmap
            </span>
          )}
          {item.dueDate && !done && (
            <span className="text-[10px] text-muted-foreground">due {new Date(item.dueDate).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/* ── one roadmap in a chain ──────────────────────────────────────────────── */

function ChainRow({ chain, index, total }: { chain: ChainRoadmapDetail; index: number; total: number }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center gap-2">
        <Route className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {total > 1 && <span className="text-muted-foreground">{index + 1}. </span>}{chain.name}
        </span>
        {chain.completed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="h-3 w-3" aria-hidden />Done
          </span>
        ) : chain.started ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {chain.currentStep}/{chain.totalSteps}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">Not started</span>
        )}
      </div>
      {chain.totalSteps > 0 && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${chain.completed ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${chain.percent}%` }}
          />
        </div>
      )}
    </li>
  );
}

/* ── new block ───────────────────────────────────────────────────────────── */

function NewBlock({ onSave, onCancel }: { onSave: (label: string, time: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('19:00');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <input
        type="time"
        value={time}
        id="plan-new-time"
        aria-label="Block time"
        onChange={(e) => setTime(e.target.value)}
        className="rounded-xl border border-slate-200 bg-card px-2.5 py-2 font-mono text-sm dark:border-slate-700"
      />
      <input
        value={label}
        autoFocus
        id="plan-new-label"
        aria-label="Block name"
        placeholder="Name this block"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) onSave(label.trim(), time); if (e.key === 'Escape') onCancel(); }}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm dark:border-slate-700"
      />
      <button
        type="button"
        onClick={() => label.trim() && onSave(label.trim(), time)}
        disabled={!label.trim()}
        className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="rounded-xl px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}

export default DayPlanner;
