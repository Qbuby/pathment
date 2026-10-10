'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ArrowRight, Check, History, Loader2, Route, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/shared/Drawer';
import {
  completionApi,
  type ContinuationPreview,
} from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const EMPTY_PREVIEW: ContinuationPreview = { roadmaps: [], customTasks: [], sourceClans: [] };

export function ContinueWorkLauncher({
  clanId,
  menteeId,
  variant = 'button',
  onContinued,
}: {
  clanId: string;
  menteeId: string;
  variant?: 'button' | 'link';
  onContinued?: () => void;
}) {
  const [preview, setPreview] = useState<ContinuationPreview>(EMPTY_PREVIEW);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!clanId || !menteeId) return;
    setLoading(true);
    try {
      setPreview(await completionApi.continuationPreview(clanId, menteeId));
    } catch {
      // This action is supplementary context; a failed preview must never hide
      // the rest of review/profile or replace it with an error state.
      setPreview(EMPTY_PREVIEW);
    } finally {
      setLoading(false);
    }
  }, [clanId, menteeId]);

  useEffect(() => { void load(); }, [load]);

  const available = preview.roadmaps.length + preview.customTasks.filter((task) => task.supported).length;
  if (loading || available === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === 'link'
          ? 'inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300'
          : 'inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300'}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Continue previous work
      </button>
      {open && (
        <ContinueWorkDrawer
          clanId={clanId}
          menteeId={menteeId}
          initialPreview={preview}
          onClose={() => setOpen(false)}
          onContinued={() => {
            setOpen(false);
            void load();
            onContinued?.();
          }}
        />
      )}
    </>
  );
}

function ContinueWorkDrawer({
  clanId,
  menteeId,
  initialPreview,
  onClose,
  onContinued,
}: {
  clanId: string;
  menteeId: string;
  initialPreview: ContinuationPreview;
  onClose: () => void;
  onContinued: () => void;
}) {
  const [roadmapIds, setRoadmapIds] = useState<Set<string>>(new Set());
  const [taskIds, setTaskIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedCount = roadmapIds.size + taskIds.size;
  const sourceNames = useMemo(
    () => initialPreview.sourceClans.map((clan) => clan.name).filter(Boolean).join(', '),
    [initialPreview.sourceClans],
  );

  const toggle = (setter: Dispatch<SetStateAction<Set<string>>>, id: string) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!selectedCount || saving) return;
    setSaving(true);
    try {
      const result = await completionApi.continueWork(clanId, menteeId, {
        roadmapIds: [...roadmapIds],
        taskIds: [...taskIds],
        dueDate: dueDate || undefined,
      });
      const readyCount = result.createdCount + result.reusedCount;
      toast.success(`${readyCount} item${readyCount === 1 ? '' : 's'} ready in this plan`);
      onContinued();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not continue this work'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Continue previous work"
      subtitle="Choose what should become new work in this plan. Previous records stay unchanged."
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{selectedCount || 'No'} item{selectedCount === 1 ? '' : 's'} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
            <button type="button" onClick={submit} disabled={!selectedCount || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Continue in this plan
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-start gap-2.5">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">History remains read-only</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Completed steps, submissions, feedback, and points stay in {sourceNames || 'the previous clan'}. Only fresh assignments are created here.
              </p>
            </div>
          </div>
        </div>

        {initialPreview.roadmaps.length > 0 && (
          <section aria-labelledby="continue-roadmaps-heading">
            <h3 id="continue-roadmaps-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Roadmaps</h3>
            <p className="mt-0.5 text-xs text-slate-500">A roadmap resumes at its first unfinished step and keeps normal auto-advance.</p>
            <div className="mt-2 space-y-2">
              {initialPreview.roadmaps.map((roadmap) => {
                const selected = roadmapIds.has(roadmap.roadmapId);
                return (
                  <label key={roadmap.roadmapId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? 'border-brand-300 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggle(setRoadmapIds, roadmap.roadmapId)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{roadmap.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{roadmap.completedSteps} of {roadmap.totalSteps} steps completed previously</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[9px] text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{roadmap.resumeIndex + 1}</span>
                        Resume with {roadmap.resumeStep.title}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {initialPreview.customTasks.length > 0 && (
          <section aria-labelledby="continue-custom-heading">
            <h3 id="continue-custom-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Custom tasks</h3>
            <p className="mt-0.5 text-xs text-slate-500">Each selection becomes an independent new task.</p>
            <div className="mt-2 space-y-2">
              {initialPreview.customTasks.map((task) => {
                const selected = taskIds.has(task.sourceTaskId);
                return (
                  <label key={task.sourceTaskId} title={task.unavailableReason || undefined} className={`flex items-start gap-3 rounded-xl border p-3 ${task.supported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${selected ? 'border-brand-300 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800'}`}>
                    <input type="checkbox" disabled={!task.supported} checked={selected} onChange={() => toggle(setTaskIds, task.sourceTaskId)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="capitalize">{task.type.replace(/_/g, ' ')}</span>
                        <span>·</span>
                        <span className="capitalize">Previously {task.status.replace(/_/g, ' ')}</span>
                      </div>
                      {!task.supported && <p className="mt-1 text-[11px] text-slate-500">{task.unavailableReason}</p>}
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <div>
          <label htmlFor="continue-work-due-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">New deadline <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="continue-work-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-200 bg-card px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:text-slate-100" />
          <p className="mt-1 text-xs text-slate-400">Leave blank to use each roadmap step’s timing; custom tasks default to seven days.</p>
        </div>
      </div>
    </Drawer>
  );
}
