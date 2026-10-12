'use client';

import { useState } from 'react';
import { LayoutGrid, Loader2, CheckCircle2, AlertTriangle, Plug, Unplug, Zap, KeyRound } from 'lucide-react';
import { useAppsTab } from '@/lib/hooks/admin';
import type { ExternalApp, ExternalAppType } from '@/lib/services/apps-api';
import { Drawer } from '@/components/shared/Drawer';

const TYPE_LABEL: Record<ExternalAppType, string> = {
  course: 'Course',
  communication: 'Communication',
  productivity: 'Productivity',
  developer: 'Developer',
  analytics: 'Analytics',
  other: 'Other',
};

const chip = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors';
const field = 'w-full bg-background border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const ghostBtn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50';

/** App icon, falling back to the app's initial when there is no icon or it fails to load. */
function AppIcon({ app }: { app: ExternalApp }) {
  const [failed, setFailed] = useState(false);
  if (!app.iconUrl || failed) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 text-sm font-semibold">
        {app.name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={app.iconUrl} alt="" className="h-6 w-6 object-contain" onError={() => setFailed(true)} />
    </span>
  );
}

export default function AppsTab() {
  const {
    apps, total, connectedCount, types, typeFilter, setTypeFilter, connecting, setConnecting,
    loading, error, busyId, connect, test, disconnect,
  } = useAppsTab();

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-slate-900 flex items-center gap-2"><LayoutGrid className="w-5 h-5 text-brand-600" /> Apps</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          Connect external apps to this workspace.{total > 0 && ` ${connectedCount} of ${total} connected.`}
        </p>
      </div>

      {error ? (
        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <p className="text-slate-600">{error}</p>
        </div>
      ) : total === 0 ? (
        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <LayoutGrid className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No apps are available yet.</p>
        </div>
      ) : (
        <>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTypeFilter('all')}
                className={`${chip} ${typeFilter === 'all' ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                All
              </button>
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`${chip} ${typeFilter === t ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {TYPE_LABEL[t] || t}
                </button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {apps.map((app) => {
              const busy = busyId === app.id;
              const failing = app.connected && app.status === 'error';
              return (
                <div key={app.id} className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-card">
                  <AppIcon app={app} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{app.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">{TYPE_LABEL[app.type] || app.type}</span>
                      {app.connected && !failing && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />Connected
                        </span>
                      )}
                      {failing && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" />Keys rejected
                        </span>
                      )}
                    </div>
                    {app.description && <p className="text-xs text-slate-500 mt-1">{app.description}</p>}
                    {app.connected && (app.accountName || app.credentialsMasked) && (
                      <p className="text-xs text-slate-400 mt-1.5">
                        {app.accountName}
                        {app.accountName && app.credentialsMasked ? ' · ' : ''}
                        {app.credentialsMasked && <code className="font-mono">{app.credentialsMasked}</code>}
                      </p>
                    )}
                    {app.connected && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {app.connectable && (
                          <>
                            <button onClick={() => test(app)} disabled={busy} className={ghostBtn}>
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Test
                            </button>
                            <button onClick={() => setConnecting(app)} disabled={busy} className={ghostBtn}>
                              <KeyRound className="w-3.5 h-3.5" />{failing ? 'Reconnect' : 'Update keys'}
                            </button>
                          </>
                        )}
                        <button onClick={() => disconnect(app)} disabled={busy} className={ghostBtn}>
                          <Unplug className="w-3.5 h-3.5" />Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                  {!app.connected && (app.connectable ? (
                    <button
                      onClick={() => setConnecting(app)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-50 shrink-0"
                    >
                      <Plug className="w-3.5 h-3.5" />Connect
                    </button>
                  ) : (
                    <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-medium shrink-0">Coming soon</span>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {connecting && (
        <ConnectAppModal
          app={connecting}
          onClose={() => setConnecting(null)}
          onConnect={(credentials) => connect(connecting, credentials)}
        />
      )}
    </div>
  );
}

/**
 * Asks for the keys the integration declares, sends them to the Pathment server
 * to verify with the provider, and stays open with the provider's reason when
 * they are refused. Keys are never read back — only a masked form is shown.
 */
function ConnectAppModal({
  app,
  onClose,
  onConnect,
}: {
  app: ExternalApp;
  onClose: () => void;
  onConnect: (credentials: Record<string, string>) => Promise<string | null>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const complete = app.credentialFields.every((f) => (values[f.key] || '').trim());

  const submit = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setFailure(null);
    const problem = await onConnect(
      Object.fromEntries(app.credentialFields.map((f) => [f.key, values[f.key].trim()])),
    );
    setSaving(false);
    if (problem) setFailure(problem); else onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${app.connected ? 'Update' : 'Connect'} ${app.name}`}
      subtitle={`Enter the keys from your ${app.name} organization. We check them with ${app.name} before saving.`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving || !complete} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {saving ? 'Verifying…' : 'Verify & connect'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {app.credentialFields.map((f, i) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              value={values[f.key] || ''}
              onChange={(e) => { setValues((prev) => ({ ...prev, [f.key]: e.target.value })); setFailure(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              autoComplete="off"
              autoFocus={i === 0}
              className={`${field} font-mono`}
            />
          </div>
        ))}

        {failure && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span><span className="font-medium">Not connected.</span> {failure}</span>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Keys are stored encrypted on the server and only ever shown masked.
        </p>
      </div>
    </Drawer>
  );
}
