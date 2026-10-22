'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Check, ClipboardList, FileQuestion, FileText, ListChecks, Loader2, Mic, Plus, Route, Scale, Search, Send, Trash2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { TaskTimingRow, type TaskDueDraft } from '@/components/mentor/TaskTimingRow';
import { initialTaskSchedule } from '@/components/mentor/TaskScheduleFields';
import { cleanHtml } from '@/lib/utils/html';
import { useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolApi, type PoolAssignment, type PoolDashboard } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, EmptyState, PanelHeader, SOURCE_LABEL, Spinner, WORK_STATUS, fmtDate, panel, primaryBtn, secondaryBtn } from './poolUi';

const KIND_ICON = { task: ClipboardList, quiz: FileQuestion, interview: Mic } as const;
const KIND_TONE = { task: 'bg-brand-50 text-brand-600', quiz: 'bg-blue-50 text-blue-600', interview: 'bg-amber-50 text-amber-600' } as const;

// The same type chips, labels and styles as the mentor's "Assign a task"
// drawer (components/mentor/AssignTaskDrawer.tsx), so both read as one product.
// Quiz and Interview switch to their kit pickers, exactly as they do there.
const TYPES = ['assignment', 'project', 'quiz', 'reading', 'video', 'discussion', 'interview', 'open_source'] as const;
type WorkType = typeof TYPES[number];
const TYPE_LABEL: Record<WorkType, string> = {
  assignment: 'Assignment', project: 'Project', quiz: 'Quiz', reading: 'Reading', video: 'Video', discussion: 'Discussion', interview: 'Interview', open_source: 'Open Source',
};
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
    active
      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
      : 'border-slate-200 text-slate-600 hover:border-slate-300'
  }`;
const checkboxCls = 'mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500';

/** 'YYYY-MM-DD' in the viewer's zone. */
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

function AddWorkDrawer({ data, onClose, onDone }: { data: PoolDashboard; onClose: () => void; onDone: () => void }) {
  const { pool } = data;
  const components = pool.scoringPolicy?.components || [];
  const scorable = components.filter((c) => c.source !== 'manual');
  const { data: options } = useApiQuery({ queryKey: ['pools', 'options', pool.programId], queryFn: () => poolApi.options(pool.programId) });

  const [source, setSource] = useState<'custom' | 'roadmap'>('custom');
  const [type, setType] = useState<WorkType>('assignment');
  const kind = type === 'quiz' ? 'quiz' : type === 'interview' ? 'interview' : 'task';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('medium');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [roadmapTaskId, setRoadmapTaskId] = useState('');
  const [stepQuery, setStepQuery] = useState('');
  const [kitId, setKitId] = useState('');
  const [evaluationMode, setEvaluationMode] = useState<'auto' | 'review'>('auto');
  const [allowRetake, setAllowRetake] = useState(false);
  const [componentKey, setComponentKey] = useState('');
  const [required, setRequired] = useState(true);
  const [assignNow, setAssignNow] = useState(true);
  // Due defaults to the pool's qualification deadline, as before.
  const deadline = pool.qualificationDueAt ? new Date(pool.qualificationDueAt) : null;
  const [due, setDue] = useState<TaskDueDraft>(deadline ? { days: 7, exact: dayKey(deadline) } : { days: 7, exact: '' });
  const [schedule, setSchedule] = useState(initialTaskSchedule);
  const [busy, setBusy] = useState(false);

  // Switching between a quiz and an interview means a different kit list.
  const pickType = (t: WorkType) => {
    if ((t === 'quiz') !== (type === 'quiz') || (t === 'interview') !== (type === 'interview')) setKitId('');
    setType(t);
  };

  /** The chosen deadline as an instant: the pool's own deadline kept exact, otherwise the end of that day. */
  const dueAt = () => {
    if (deadline && due.exact === dayKey(deadline)) return deadline.toISOString();
    const d = due.exact ? new Date(`${due.exact}T23:59:00`) : new Date();
    if (!due.exact) { d.setDate(d.getDate() + due.days); d.setHours(23, 59, 0, 0); }
    return d.toISOString();
  };

  const steps = options?.roadmapSteps || [];
  const q = stepQuery.trim().toLowerCase();
  const shownSteps = q ? steps.filter((s) => `${s.title} ${s.roadmap?.name || ''} ${s.type}`.toLowerCase().includes(q)) : steps;
  const kits = (kind === 'quiz' ? options?.quizKits : options?.interviewKits) || [];

  const submit = async () => {
    const body: Record<string, unknown> = {
      componentKey: componentKey || null,
      required,
      dueAt: dueAt(),
      assignTo: assignNow ? 'all' : undefined,
    };
    if (source === 'roadmap') {
      if (!roadmapTaskId) return toast.error('Choose a roadmap step');
      Object.assign(body, { kind: 'task', roadmapTaskId });
    } else if (kind === 'task') {
      if (!title.trim()) return toast.error('Give the work a title');
      Object.assign(body, {
        kind, title: title.trim(), description: cleanHtml(description), type, difficulty,
        deliverable, acceptanceCriteria: criteria.map((c) => c.trim()).filter(Boolean),
      });
    } else {
      if (!kitId) return toast.error(kind === 'quiz' ? 'Choose a quiz' : 'Choose an interview kit');
      Object.assign(body, {
        kind, kitId, title: title.trim() || undefined, description: cleanHtml(description) || undefined,
        ...(kind === 'quiz' ? { evaluationMode, allowRetake } : {}),
      });
    }
    setBusy(true);
    try {
      const out = await poolApi.createAssignment(pool.id, body);
      const s = out?.assigned?.summary;
      toast.success(s ? `Work created and given to ${s.assigned} candidate${s.assigned === 1 ? '' : 's'}` : 'Work created');
      onDone();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the work'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Add qualifying work"
      subtitle={`For the candidates in ${pool.name}`}
      width="lg"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {assignNow ? 'Add & assign' : 'Add work'}
          </button>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* Source tabs — a new piece of work vs a step from a roadmap. */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
          {([['custom', 'Custom task', FileText], ['roadmap', 'From roadmap', Route]] as const).map(([key, text, Icon]) => (
            <button key={key} type="button" onClick={() => setSource(key)} aria-pressed={source === key}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${source === key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icon className="w-4 h-4" />{text}
            </button>
          ))}
        </div>

        {source === 'custom' && (<>
          <div>
            <label htmlFor="pool-work-title" className="block text-sm font-medium text-slate-700 mb-1">
              Title {kind === 'task' ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">(optional — defaults to the kit&apos;s name)</span>}
            </label>
            <input id="pool-work-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a small REST API" className={inputCls} />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Type</span>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t} type="button" onClick={() => pickType(t)} className={pill(type === t)} aria-pressed={type === t}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
          </div>

          {kind !== 'task' && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                {kind === 'quiz' ? <ListChecks className="w-4 h-4 text-brand-600" /> : <Mic className="w-4 h-4 text-brand-600" />}
                {kind === 'quiz' ? 'Quiz' : 'Interview kit'} <span className="text-red-500">*</span>
              </div>
              {!options ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading…</div>
              ) : kits.length === 0 ? (
                <p className="text-sm text-slate-500">No <span className="font-medium">published</span> {kind === 'quiz' ? 'quizzes' : 'interview kits'} to assign.</p>
              ) : (
                <select value={kitId} onChange={(e) => setKitId(e.target.value)} className={inputCls} aria-label={kind === 'quiz' ? 'Quiz' : 'Interview kit'}>
                  <option value="">{kind === 'quiz' ? 'Select a quiz…' : 'Select a kit…'}</option>
                  {kits.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                </select>
              )}
              {kind === 'quiz' && (<>
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">How to grade</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['auto', 'Auto-grade', 'The score counts the moment they submit'],
                      ['review', 'Reviewer confirms', 'Auto-scored, but a reviewer confirms it'],
                    ] as const).map(([val, text, hint]) => (
                      <button key={val} type="button" onClick={() => setEvaluationMode(val)}
                        className={`text-left rounded-lg border p-2.5 ${evaluationMode === val ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                        <span className="block text-sm font-medium text-slate-800">{text}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input type="checkbox" checked={allowRetake} onChange={(e) => setAllowRetake(e.target.checked)} className={checkboxCls} />
                  <span className="text-sm text-slate-700">Allow re-attempt<span className="block text-[11px] text-slate-400">Off = strict one-take</span></span>
                </label>
              </>)}
              <p className="text-[11px] text-slate-400">Only published {kind === 'quiz' ? 'quizzes' : 'kits'} with questions can be assigned.</p>
            </div>
          )}
        </>)}

        {source === 'roadmap' && (
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="block text-sm font-medium text-slate-700">Pick a roadmap step</span>
              {steps.length > 0 && <span className="text-xs text-slate-400 tabular-nums">{shownSteps.length} of {steps.length}</span>}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={stepQuery} onChange={(e) => setStepQuery(e.target.value)} placeholder="Search steps or roadmaps…" aria-label="Search roadmap steps" className={`${inputCls} pl-9`} />
            </div>
            {!options ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading steps…</div>
            ) : shownSteps.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                {steps.length ? 'No step matches that search.' : 'This programme has no roadmap steps that can be handed in.'}
              </p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {shownSteps.map((s) => (
                  <button key={s.id} type="button" onClick={() => setRoadmapTaskId(s.id)} aria-pressed={roadmapTaskId === s.id}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${roadmapTaskId === s.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{s.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{s.roadmap?.name || 'Roadmap'} · <span className="capitalize">{s.type.replace('_', ' ')}</span>{s.difficulty ? <> · <span className="capitalize">{s.difficulty}</span></> : null}</span>
                    </span>
                    {roadmapTaskId === s.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* The same timing control as the mentor drawer. A pool round does not repeat. */}
        <TaskTimingRow due={due} onDueChange={setDue} schedule={schedule} onScheduleChange={setSchedule} repeat={false} assigning={assignNow} />

        {source === 'custom' && (<>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Brief</label>
            <RichTextEditor content={description} onChange={setDescription} placeholder="Optional — what should they do?" minHeight="120px" />
          </div>

          {kind === 'task' && (<>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</span>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)} className={`${pill(difficulty === d)} capitalize`} aria-pressed={difficulty === d}>{d}</button>
                ))}
              </div>
            </div>

            <details className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Deliverable &amp; checks <span className="text-muted-foreground font-normal">(optional)</span></summary>
              <div className="space-y-4 mt-4">
                <div>
                  <label htmlFor="pool-work-deliverable" className="block text-sm font-medium text-slate-700 mb-1">Deliverable</label>
                  <input id="pool-work-deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="What should they submit?" className={inputCls} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">Acceptance criteria</span>
                    <button type="button" onClick={() => setCriteria((c) => [...c, ''])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add check</button>
                  </div>
                  <div className="space-y-2">
                    {criteria.length === 0 && <p className="text-xs text-slate-400">No criteria yet. Add checks the candidate must meet — reviewers tick them off.</p>}
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={c} onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Check ${i + 1}`} aria-label={`Acceptance criterion ${i + 1}`} className={inputCls} />
                        <button type="button" onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove criterion" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </>)}
        </>)}

        {/* What only a pool has: how the work counts, and who gets it. */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Scale className="h-4 w-4 text-brand-600" />Counts towards</span>
            {scorable.length ? (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setComponentKey('')} className={pill(componentKey === '')} aria-pressed={componentKey === ''}>Not scored</button>
                {scorable.map((c) => (
                  <button key={c.key} type="button" onClick={() => setComponentKey(c.key)} className={pill(componentKey === c.key)} aria-pressed={componentKey === c.key}>
                    {c.label} <span className="font-normal opacity-70">· {c.weight}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Set up scoring in Settings to link work to a score component.</p>
            )}
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className={checkboxCls} />
            <span className="text-sm text-slate-700">Required<span className="block text-[11px] text-slate-400">Missing it is flagged on the shortlist</span></span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={assignNow} onChange={(e) => setAssignNow(e.target.checked)} className={checkboxCls} />
            <span className="text-sm text-slate-700">Give it to every active candidate now<span className="block text-[11px] text-slate-400">Off = add it to the pool and assign it later from this tab</span></span>
          </label>
        </div>
      </div>
    </Drawer>
  );
}

export function WorkTab({ data, onChange, canAssign }: { data: PoolDashboard; onChange: () => void; canAssign: boolean }) {
  const { pool } = data;
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: assignments, loading, refetch } = useApiQuery({ queryKey: ['pools', pool.id, 'assignments'], queryFn: () => poolApi.assignments(pool.id) });
  const components = pool.scoringPolicy?.components || [];
  const reload = async () => { await refetch(); onChange(); };

  const giveToAll = async (a: PoolAssignment) => {
    setBusyId(a.id);
    try {
      const out = await poolApi.assign(pool.id, a.id);
      toast.success(`Given to ${out.summary.assigned} more candidate${out.summary.assigned === 1 ? '' : 's'} (${out.summary.skipped} already had it or are not active)`);
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not assign the work'));
    } finally {
      setBusyId(null);
    }
  };
  const cancel = async (a: PoolAssignment) => {
    const ok = await confirm({ title: `Cancel “${a.title}”?`, description: 'It is withdrawn from everyone who has not finished it. Approved work stays.', confirmLabel: 'Cancel work' });
    if (!ok) return;
    try {
      await poolApi.cancelAssignment(pool.id, a.id);
      toast.success('Work cancelled');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not cancel the work'));
    }
  };

  const list = assignments || [];
  return (
    <div className="space-y-4">
      <section className={panel}>
        <PanelHeader
          icon={ClipboardList}
          title="Qualifying work"
          count={list.filter((a) => !a.cancelledAt).length}
          subtitle="Tasks, quizzes and interviews candidates complete to earn their score."
          actions={canAssign && pool.status !== 'closed' && (
            <button onClick={() => setAdding(true)} className={primaryBtn}><Plus className="h-4 w-4" /> Add work</button>
          )}
        />
        {loading && <Spinner />}
        {!loading && list.length === 0 && (
          <div className="border-t border-border">
            <EmptyState icon={ClipboardList} title="No qualifying work yet" text="Add a special assignment, a roadmap step, a quiz or an interview, and link it to a score component." />
          </div>
        )}
        {list.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {list.map((a) => {
              const Icon = KIND_ICON[a.kind];
              const component = components.find((c) => c.key === a.componentKey);
              const counts = a.counts || {};
              const total = Object.entries(counts).filter(([k]) => k !== 'cancelled').reduce((s, [, n]) => s + n, 0);
              const approved = counts.completed || 0;
              return (
                <li key={a.id} className={`p-5 transition-colors hover:bg-muted/40 sm:px-6 ${a.cancelledAt ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`shrink-0 rounded-xl p-2 ${KIND_TONE[a.kind]}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{a.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-slate-600">{a.kind === 'task' ? (a.roadmapTask?.type || 'task').replace('_', ' ') : a.kind}</span>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${a.required ? 'bg-brand-50 text-brand-700' : 'bg-muted text-slate-500'}`}>{a.required ? 'Required' : 'Optional'}</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Due {fmtDate(a.dueAt)}</span>
                          <span className="text-muted-foreground">
                            · {component ? `Feeds “${component.label}” (${component.weight}%, ${SOURCE_LABEL[component.source]})` : 'Not scored'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {a.cancelledAt ? <Chip cls="bg-slate-100 text-slate-500 border-slate-200">Cancelled</Chip> : canAssign && pool.status !== 'closed' && (
                      <div className="flex gap-2">
                        <button onClick={() => giveToAll(a)} disabled={busyId === a.id} className={secondaryBtn}>
                          {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Give to everyone
                        </button>
                        <button onClick={() => cancel(a)} title="Cancel this work" aria-label="Cancel this work" className={`${secondaryBtn} text-rose-600 hover:bg-rose-50`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-4 sm:pl-11">
                      <div className="flex items-center gap-3">
                        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          {Object.entries(WORK_STATUS).map(([k, v]) => (counts[k] ? <div key={k} className={v.dot} style={{ width: `${(counts[k] / total) * 100}%` }} /> : null))}
                        </div>
                        <span className="text-xs font-medium text-slate-600 tabular-nums">{approved}/{total} approved</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {Object.entries(WORK_STATUS).filter(([k]) => k !== 'not_started').map(([k, v]) => {
                          const n = k === 'assigned' ? (counts.assigned || 0) + (counts.not_started || 0) : counts[k];
                          return n ? <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} /> {n} {v.label.toLowerCase()}</span> : null;
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {adding && <AddWorkDrawer data={data} onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}
