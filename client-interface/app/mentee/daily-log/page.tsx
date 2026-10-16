"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  Check,
  Loader2,
  Route,
  Repeat,
  Sun,
} from "lucide-react";
import { useDailyLog, useMenteeTasks } from "@/lib/hooks/mentee";
import { useClan, isHistoricalCohortClan } from "@/lib/context/ClanContext";
import { scheduleApi, type ScheduleSlot } from "@/lib/services/schedule-api";

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MenteeDailyLog() {
  const { menteeClans, menteeActiveClanId } = useClan();
  const historical = isHistoricalCohortClan(
    menteeClans.find((c) => c.id === menteeActiveClanId),
  );
  const HISTORICAL_TITLE = "Completed programs are read-only";
  const CLOSED_TITLE = "That day is closed — you can only log today";
  const { entries, loading, save } = useDailyLog();
  const { tasks } = useMenteeTasks();

  // Last 10 days (today first).
  const days = useMemo(() => {
    const out: { key: string; label: string; sub: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({
        key: toKey(d),
        label:
          i === 0
            ? "Today"
            : i === 1
              ? "Yesterday"
              : d.toLocaleDateString(undefined, { weekday: "short" }),
        sub: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
    }
    return out;
  }, []);

  const [activeKey, setActiveKey] = useState(days[0].key);
  /**
   * Earlier days are here to read, not to rewrite.
   *
   * This page used to invite the opposite — "Missed a day? Tap it and
   * backfill" — and the server stored whatever date the browser sent, streak
   * included. A log you can fill in afterwards measures nothing, and the gaps
   * are the signal a mentor actually reads. The server decides the day now; so
   * does this.
   */
  const isToday = activeKey === days[0].key;
  const activeDay = days.find((d) => d.key === activeKey);
  /** "Yesterday" reads better than "Oct 16"; a bare weekday ("thu") does not. */
  const activeDayName = activeDay?.label === "Yesterday" ? "Yesterday" : activeDay?.sub;
  const lockedBecause = historical
    ? HISTORICAL_TITLE
    : !isToday
      ? CLOSED_TITLE
      : null;
  const locked = lockedBecause !== null;
  const entryByKey = useMemo(
    () => Object.fromEntries(entries.map((e) => [e.dateKey, e])),
    [entries],
  );

  const [tasksDone, setTasksDone] = useState<Set<string>>(new Set());
  const [slotsDone, setSlotsDone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // The mentee's schedule, if a mentor assigned one.
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  useEffect(() => {
    scheduleApi
      .getMySchedule()
      .then((r: any) => setSlots(r?.data?.schedule?.schedule ?? []))
      .catch(() => {});
  }, [menteeActiveClanId]);

  // The slots that apply to the selected day (weekday vs weekend).
  const activeIsWeekend = useMemo(() => {
    const [y, m, d] = activeKey.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
  }, [activeKey]);
  const daySlots = useMemo(
    () =>
      slots.filter(
        (s) =>
          s.days === "everyday" ||
          (activeIsWeekend ? s.days === "weekends" : s.days !== "weekends"),
      ),
    [slots, activeIsWeekend],
  );

  // Load the selected day's entry into the form.
  useEffect(() => {
    const e = entryByKey[activeKey];
    setTasksDone(new Set(e?.tasksDone ?? []));
    setSlotsDone(new Set(e?.slotsDone ?? []));
    setNote(e?.note ?? "");
  }, [activeKey, entryByKey]);

  const activeTasks = (tasks || []).filter(
    (t: any) =>
      !["completed", "cancelled"].includes(t.status) || tasksDone.has(t.id),
  );
  const taskTitle = (t: any) => t?.roadmapTask?.title || t?.title || "Task";

  const toggle = (id: string) =>
    setTasksDone((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleSlot = (id: string) =>
    setSlotsDone((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onSave = async () => {
    if (locked) return;
    try {
      setSaving(true);
      await save({
        tasksDone: [...tasksDone],
        slotsDone: [...slotsDone],
        note: note.trim() || undefined,
      });
      toast.success("Logged");
    } catch {
      toast.error("Could not save your log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="mentee-page-heading">
        <h1 className="text-slate-900 mb-2">Daily log</h1>
        <p className="text-slate-600">
          A quick end-of-day check-in. Earlier days are here to read — a day
          closes when the day does, so the gaps mean something.
        </p>
      </div>

      {/* Day picker */}
      <div
        className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-3"
        aria-label="Choose a day"
      >
        {days.map((d) => {
          const logged = !!entryByKey[d.key];
          const active = d.key === activeKey;
          return (
            <button
              key={d.key}
              aria-pressed={active}
              aria-label={`${d.label}, ${d.sub}${logged ? ", logged" : ""}`}
              onClick={() => setActiveKey(d.key)}
              className={`shrink-0 min-w-20 rounded-xl border px-3 py-3 text-center transition-colors ${
                active
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div
                className={`text-xs font-medium ${active ? "text-brand-700" : "text-slate-700"}`}
              >
                {d.label}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 justify-center">
                {d.sub}
                {logged && <Check className="w-3 h-3 text-emerald-500" />}
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-5">
          {!isToday && !historical && (
            <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              {activeDayName} is closed. You can read what you logged, but only
              today can be written — that is what makes the gaps worth anything.
            </p>
          )}

          {/* Rituals / slots for this day */}
          {daySlots.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sun className="w-4 h-4 text-amber-500" />
                <h2 className="text-slate-900">
                  Rituals for {days.find((day) => day.key === activeKey)?.sub}
                </h2>
              </div>
              <div className="space-y-1.5">
                {daySlots.map((s, i) => {
                  // For a roadmap slot, surface the chain's first roadmap + this
                  // mentee's live progress (same as the mentor/admin view).
                  const det =
                    s.kind === "roadmap" ? s.chainDetails?.[0] : undefined;
                  return (
                    <label
                      key={s.id || `slot-${i}`}
                      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={slotsDone.has(s.id)}
                        onChange={() => toggleSlot(s.id)}
                        disabled={locked}
                        title={lockedBecause ?? undefined}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                      />
                      <span className="text-slate-400 text-xs w-20 shrink-0 pt-0.5">
                        {s.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-slate-700">
                            {s.recurring?.title || s.label}
                          </span>
                          {s.kind === "roadmap" && (
                            <Route className="w-3.5 h-3.5 text-brand-400" />
                          )}
                          {s.kind === "recurring" && (
                            <Repeat className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                        </div>
                        {det && det.totalSteps > 0 && (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${det.completed ? "bg-emerald-500" : "bg-brand-500"}`}
                                style={{ width: `${det.percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400 truncate">
                              {det.name} ·{" "}
                              {det.completed
                                ? "Completed"
                                : `${det.currentStep}/${det.totalSteps} steps`}
                            </span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-brand-500" />
            <h2 className="text-slate-900">What did you work on?</h2>
          </div>

          {activeTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks to check off.</p>
          ) : (
            <div className="space-y-1.5">
              {activeTasks.map((t: any) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={tasksDone.has(t.id)}
                    onChange={() => toggle(t.id)}
                    disabled={locked}
                    title={lockedBecause ?? undefined}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                  />
                  <span className="text-sm text-slate-700">{taskTitle(t)}</span>
                </label>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reflection{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              aria-label="Daily reflection"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              disabled={locked}
              title={lockedBecause ?? undefined}
              placeholder="How did today go? Anything you got stuck on?"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={onSave}
              disabled={saving || locked}
              title={lockedBecause ?? undefined}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
