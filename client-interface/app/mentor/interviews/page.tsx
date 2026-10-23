'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Mic, Plus, Loader2, Pencil, Trash2, FileQuestion } from 'lucide-react';
import { interviewApi, type InterviewKitSummary } from '@/lib/services/interview-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { InterviewKitDrawer } from '@/components/mentor/InterviewKitDrawer';

/**
 * Mentor › Interviews — author reusable interview kits (ordered voice/code/text
 * questions) that are later assigned as `interview` tasks. Phase 1 authoring UI.
 */
export default function MentorInterviewsPage() {
  const confirm = useConfirm();
  const [kits, setKits] = useState<InterviewKitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    interviewApi.listKits()
      .then((res: any) => setKits(res?.data?.kits ?? []))
      .catch(() => setKits([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (kit: InterviewKitSummary) => {
    const ok = await confirm({
      title: 'Delete this kit?',
      description: `"${kit.title}" will be permanently deleted. Kits in use by assigned interviews can't be deleted — archive them instead.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await interviewApi.deleteKit(kit.id);
      toast.success('Kit deleted');
      load();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not delete kit'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Mic className="w-6 h-6 text-brand-600" /> Interview kits
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Build a structured interview once — voice, code, or written questions — then assign it to
            any mentee as an interview task. They answer in a real interview flow; you grade what they said.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New kit
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : kits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Mic className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium">No interview kits yet</p>
          <p className="text-sm text-slate-500 mt-1 mb-5">Create your first kit to start assigning mock interviews.</p>
          <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> New kit
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {kits.map((k) => (
            <div key={k.id} className="rounded-2xl border border-slate-200 bg-card p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-slate-900 truncate">{k.title}</h3>
                  {k.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{k.description}</p>}
                </div>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full capitalize ${
                  k.status === 'published' ? 'bg-emerald-100 text-emerald-700' : k.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                }`}>{k.status}</span>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><FileQuestion className="w-3.5 h-3.5" />{k.questionCount} question{k.questionCount === 1 ? '' : 's'}</span>
                <span className="tabular-nums">{k.totalPoints} pts</span>
                <span>{k.timingMode === 'total' ? 'Total timer' : 'Per-question'}</span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={() => setEditing(k.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => remove(k)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <InterviewKitDrawer
          kitId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
