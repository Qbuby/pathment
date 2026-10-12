'use client';

import { useState } from 'react';
import { LayoutGrid, Loader2, CheckCircle2, Plug, Unplug } from 'lucide-react';
import { useAppsTab } from '@/lib/hooks/admin';
import type { ExternalApp, ExternalAppType } from '@/lib/services/apps-api';

const TYPE_LABEL: Record<ExternalAppType, string> = {
  course: 'Course',
  communication: 'Communication',
  productivity: 'Productivity',
  developer: 'Developer',
  analytics: 'Analytics',
  other: 'Other',
};

const chip = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors';

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
  const { apps, total, connectedCount, types, typeFilter, setTypeFilter, loading, error, busyId, connect, disconnect } = useAppsTab();

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
            {apps.map((app) => (
              <div key={app.id} className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-card">
                <AppIcon app={app} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{app.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">{TYPE_LABEL[app.type] || app.type}</span>
                    {app.connected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />Connected
                      </span>
                    )}
                  </div>
                  {app.description && <p className="text-xs text-slate-500 mt-1">{app.description}</p>}
                </div>
                {app.connected ? (
                  <button
                    onClick={() => disconnect(app)}
                    disabled={busyId === app.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 shrink-0"
                  >
                    {busyId === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => connect(app)}
                    disabled={busyId === app.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-50 shrink-0"
                  >
                    {busyId === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
