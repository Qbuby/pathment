'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Info, Loader2, Plus, Save, Scale, SlidersHorizontal, Trash2, UsersRound } from 'lucide-react';
import { useApiQuery } from '@/lib/query';
import { poolApi, type PoolDashboard, type ScoreComponent, type ScoreSource } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { PanelHeader, SOURCE_LABEL, field, fromLocalInput, label, panel, primaryBtn, secondaryBtn, toLocalInput } from './poolUi';

const body = 'space-y-4 border-t border-border p-5 sm:px-6';
const footer = 'flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/40 px-5 py-3 sm:px-6';
const check = 'flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm text-slate-700 has-checked:border-brand-300 has-checked:bg-brand-50/50';

const keyOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

export function SettingsTab({ data, onChange, canManage }: { data: PoolDashboard; onChange: () => void; canManage: boolean }) {
  const { pool } = data;
  const locked = !canManage || pool.status === 'closed';
  const { data: options } = useApiQuery({ queryKey: ['pools', 'options', pool.programId], queryFn: () => poolApi.options(pool.programId) });

  const [basics, setBasics] = useState({
    name: pool.name, description: pool.description || '', selectionQuota: String(pool.selectionQuota), capacity: pool.capacity ? String(pool.capacity) : '',
    opensAt: toLocalInput(pool.opensAt), closesAt: toLocalInput(pool.closesAt), qualificationDueAt: toLocalInput(pool.qualificationDueAt),
  });
  const [components, setComponents] = useState<ScoreComponent[]>(pool.scoringPolicy?.components || []);
  const [reminders, setReminders] = useState(pool.reminderPolicy);
  const [settings, setSettings] = useState(pool.settings);
  const [saving, setSaving] = useState<string | null>(null);
  const total = components.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const save = async (section: string, body: Record<string, unknown>) => {
    setSaving(section);
    try {
      await poolApi.update(pool.id, body);
      toast.success('Saved');
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save'));
    } finally {
      setSaving(null);
    }
  };
  const SaveBtn = ({ section, onClick, disabled = false }: { section: string; onClick: () => void; disabled?: boolean }) => (
    locked ? null : (
      <button onClick={onClick} disabled={disabled || saving === section} className={primaryBtn}>
        {saving === section ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
      </button>
    )
  );

  return (
    <div className="space-y-6">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-slate-600">
          <Info className="h-4 w-4 shrink-0" /> {pool.status === 'closed' ? 'This pool is closed, so its settings are read-only.' : 'You can view these settings, but only pool managers can change them.'}
        </p>
      )}
      <section className={panel}>
        <PanelHeader icon={UsersRound} title="The pool" subtitle="Name, size and the dates of the round." />
        <div className={body}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Name</label><input disabled={locked} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} className={field} /></div>
          <div className="sm:col-span-2"><label className={label}>Description</label><textarea disabled={locked} rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} className={field} /></div>
          <div><label className={label}>Select how many</label><input disabled={locked} type="number" min={1} value={basics.selectionQuota} onChange={(e) => setBasics({ ...basics, selectionQuota: e.target.value })} className={field} /></div>
          <div><label className={label}>Capacity</label><input disabled={locked} type="number" min={1} placeholder="No limit" value={basics.capacity} onChange={(e) => setBasics({ ...basics, capacity: e.target.value })} className={field} /></div>
          <div><label className={label}>Opens</label><input disabled={locked} type="datetime-local" value={basics.opensAt} onChange={(e) => setBasics({ ...basics, opensAt: e.target.value })} className={field} /></div>
          <div><label className={label}>Closes</label><input disabled={locked} type="datetime-local" value={basics.closesAt} onChange={(e) => setBasics({ ...basics, closesAt: e.target.value })} className={field} /></div>
          <div><label className={label}>Qualification deadline</label><input disabled={locked} type="datetime-local" value={basics.qualificationDueAt} onChange={(e) => setBasics({ ...basics, qualificationDueAt: e.target.value })} className={field} /></div>
        </div>
        </div>
        {!locked && <div className={footer}>
          <SaveBtn section="basics" onClick={() => save('basics', {
            name: basics.name, description: basics.description || null,
            selectionQuota: Number(basics.selectionQuota), capacity: basics.capacity ? Number(basics.capacity) : null,
            opensAt: fromLocalInput(basics.opensAt), closesAt: fromLocalInput(basics.closesAt), qualificationDueAt: fromLocalInput(basics.qualificationDueAt),
          })} />
        </div>}
      </section>

      <section className={panel}>
        <PanelHeader
          icon={Scale}
          title="Scoring"
          subtitle="Each component is a visible part of the total. Weights must add up to 100%. Link work to a component on the Work tab. Changing the scoring creates a new version; shortlists already made keep theirs."
        />
        <div className={body}>
        {components.length > 0 && (
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
            <span className="col-span-5">Component</span><span className="col-span-3">Scored from</span><span className="col-span-2">Weight</span><span className="col-span-2">Required</span>
          </div>
        )}
        <div className="space-y-2">
          {components.map((c, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <input disabled={locked} value={c.label} placeholder="Label, e.g. Special assignment"
                onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, label: e.target.value, key: x.key && pool.scoringPolicy.components.some((p) => p.key === x.key) ? x.key : keyOf(e.target.value) } : x))}
                className={`${field} col-span-12 sm:col-span-5`} />
              <select disabled={locked} value={c.source} onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, source: e.target.value as ScoreSource } : x))} className={`${field} col-span-6 sm:col-span-3`}>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="col-span-3 flex items-center gap-1 sm:col-span-2">
                <input disabled={locked} type="number" min={1} max={100} value={c.weight} onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} className={field} />
                <span className="text-sm text-slate-400">%</span>
              </div>
              <label className="col-span-2 flex items-center gap-1 text-xs text-slate-600 sm:col-span-1"><input disabled={locked} type="checkbox" checked={c.required !== false} onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} /> Req.</label>
              {!locked && <button onClick={() => setComponents(components.filter((_, j) => j !== i))} className="col-span-1 justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
        {!components.length && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No components yet. Add one for each part of the score, e.g. Quiz, Special assignment, Interview.</p>}
        {components.length > 0 && <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Weights</span>
            <span className={`font-semibold ${Math.abs(total - 100) < 0.01 || !components.length ? 'text-emerald-700' : 'text-rose-600'}`}>Total {total}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-all ${Math.abs(total - 100) < 0.01 ? 'bg-emerald-500' : total > 100 ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, total)}%` }} />
          </div>
        </div>}
        </div>
        {!locked && (
          <div className={`${footer} justify-between`}>
            <button onClick={() => setComponents([...components, { key: '', label: '', weight: 0, source: 'task_review', required: true }])} className={secondaryBtn}>
              <Plus className="h-4 w-4" /> Add component
            </button>
            <SaveBtn
              section="scoring"
              disabled={Boolean(components.length) && Math.abs(total - 100) > 0.01}
              onClick={() => save('scoring', { scoringPolicy: { components: components.map((c) => ({ ...c, key: c.key || keyOf(c.label) })) } })}
            />
          </div>
        )}
      </section>

      <section className={panel}>
        <PanelHeader icon={BellRing} title="Reminders" subtitle="In-app and email. They stop by themselves once the work is handed in, the candidate leaves or is decided, or the pool closes." />
        <div className={body}>
        <label className={`${check} w-fit`}><input disabled={locked} type="checkbox" checked={reminders.enabled} onChange={(e) => setReminders({ ...reminders, enabled: e.target.checked })} /> Send reminders</label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className={label}>Resend an unaccepted invitation every (days)</label><input disabled={locked} type="number" min={0} value={reminders.inviteAfterDays} onChange={(e) => setReminders({ ...reminders, inviteAfterDays: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>…at most (times)</label><input disabled={locked} type="number" min={0} value={reminders.inviteMaxCount} onChange={(e) => setReminders({ ...reminders, inviteMaxCount: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>Remind before a due date (hours)</label><input disabled={locked} type="number" min={0} value={reminders.dueSoonHours} onChange={(e) => setReminders({ ...reminders, dueSoonHours: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>Nudge after no activity for (days)</label><input disabled={locked} type="number" min={0} value={reminders.inactivityDays} onChange={(e) => setReminders({ ...reminders, inactivityDays: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>…at most (times)</label><input disabled={locked} type="number" min={0} value={reminders.inactivityMaxCount} onChange={(e) => setReminders({ ...reminders, inactivityMaxCount: Number(e.target.value) })} className={field} /></div>
        </div>
        </div>
        {!locked && <div className={footer}><SaveBtn section="reminders" onClick={() => save('reminders', { reminderPolicy: reminders })} /></div>}
      </section>

      <section className={panel}>
        <PanelHeader icon={SlidersHorizontal} title="Options" subtitle="How work is handed out, the waitlist, and where selected candidates go." />
        <div className={body}>
        <label className={`${check} w-fit`}><input disabled={locked} type="checkbox" className="mt-0.5" checked={settings.autoAssignOnActivation} onChange={(e) => setSettings({ ...settings, autoAssignOnActivation: e.target.checked })} /> Give the pool&apos;s work to candidates automatically when they activate</label>
        <div className="max-w-xs">
          <label className={label}>Waitlist size</label>
          <input disabled={locked} type="number" min={0} placeholder={`Same as quota (${pool.selectionQuota})`} value={settings.waitlistSize ?? ''} onChange={(e) => setSettings({ ...settings, waitlistSize: e.target.value === '' ? null : Number(e.target.value) })} className={field} />
        </div>
        <div>
          <label className={label}>Place into these clans <span className="font-normal text-slate-400">(none chosen = every open clan in the programme)</span></label>
          <div className="flex flex-wrap gap-2">
            {(options?.clans || []).map((c) => {
              const on = settings.targetClanIds.includes(c.id);
              return (
                <button key={c.id} disabled={locked} onClick={() => setSettings({ ...settings, targetClanIds: on ? settings.targetClanIds.filter((x) => x !== c.id) : [...settings.targetClanIds, c.id] })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-border text-slate-600 hover:bg-muted'}`}>
                  {c.name}
                </button>
              );
            })}
            {!(options?.clans || []).length && <span className="text-sm text-slate-500">This programme has no clans yet.</span>}
          </div>
        </div>
        </div>
        {!locked && <div className={footer}><SaveBtn section="settings" onClick={() => save('settings', { settings })} /></div>}
      </section>
    </div>
  );
}
