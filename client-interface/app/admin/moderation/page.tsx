'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Loader2, Trash2, CheckCircle2, XCircle, Flag } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { EmptyState } from '@/components/shared/EmptyState';
import { useModeration, type CommunityReportRow, type ReportedItem, type ReportStatus } from '@/lib/hooks/admin';

const STATUS_TABS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'dismissed', label: 'Dismissed' },
];

const EMPTY_COPY: Record<ReportStatus, { title: string; description: string }> = {
  open: { title: 'Nothing waiting for you', description: 'New reports from community spaces will show up here.' },
  reviewed: { title: 'No reviewed reports yet', description: 'Reports you act on are kept here.' },
  dismissed: { title: 'No dismissed reports', description: 'Reports you decide need no action are kept here.' },
};

const ROLE_LABEL: Record<string, string> = { mentor: 'Mentor', mentee: 'Mentee', admin: 'Admin' };

// The serious reasons read as serious; the rest stay quiet.
const REASON_TONE: Record<string, string> = {
  violence: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  hate: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  scam: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
};

/** A person's admin profile page, where one exists for their role. */
const profileHref = (id?: string | null, role?: string | null) =>
  id && role === 'mentee' ? `/admin/mentees/${id}` : id && role === 'mentor' ? `/admin/mentors/${id}` : undefined;

function timeAgo(iso: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Who reported it, and why — the profile the admin needs to weigh the report. */
function Reporter({ report, isAuthor, targetType }: { report: CommunityReportRow; isAuthor: boolean; targetType: 'post' | 'comment' }) {
  const { reporter } = report;
  const href = profileHref(reporter.id, reporter.role);
  const reason = report.categoryLabel || (report.details ? null : 'No reason given');
  const meta = reporter.role && ROLE_LABEL[reporter.role];

  return (
    <li className="flex items-start gap-3">
      {/* The author's profile is on the content below. When they reported it
          themselves, say so here rather than showing the same person twice. */}
      {isAuthor ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true">
          <Flag className="h-4 w-4" />
        </span>
      ) : (
        <Avatar name={reporter.name} src={reporter.avatarUrl} size="md" href={href} title={href ? `View ${reporter.name}'s profile` : undefined} />
      )}
      <div className="min-w-0 flex-1">
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${isAuthor ? 'min-h-10' : ''}`}>
          <p className="text-sm font-medium text-slate-900">{isAuthor ? `Reported their own ${targetType}` : reporter.name || 'Unknown member'}</p>
          {reason && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(report.category && REASON_TONE[report.category]) || 'bg-slate-100 text-slate-600'}`}>
              {reason}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{timeAgo(report.at)}</span>
        </div>
        {meta && !isAuthor && <p className="text-xs text-slate-500">{meta}</p>}
        {report.details && <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{report.details}</p>}
      </div>
    </li>
  );
}

export default function AdminModerationPage() {
  const { items, reports, status, setStatus, loading, resolveItem, removeItem } = useModeration();
  // "<item key>:<action>" while a decision is being saved.
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (item: ReportedItem, action: 'remove' | 'reviewed' | 'dismissed') => {
    if (busy) return;
    setBusy(`${item.key}:${action}`);
    try {
      if (action === 'remove') await removeItem(item);
      else await resolveItem(item, action);
    } finally {
      setBusy(null);
    }
  };

  // One card per reported post or comment. Several people flagging the same
  // thing is still one decision, so it is one card with everyone on it.
  const renderCard = (item: ReportedItem) => {
    const authorHref = profileHref(item.targetAuthorId, item.targetAuthorRole);
    const authorMeta = [item.targetAuthorRole && ROLE_LABEL[item.targetAuthorRole], `Posted this ${item.targetType}`].filter(Boolean).join(' · ');
    const working = (action: string) => busy === `${item.key}:${action}`;
    const locked = !!busy && busy.startsWith(`${item.key}:`);
    const secondary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50';

    return (
      <div key={item.key} className="bg-card rounded-2xl border border-slate-200 p-5">
        <ul className="space-y-4">
          {item.reports.map((report) => (
            <Reporter key={report.id} report={report} targetType={item.targetType} isAuthor={!!item.targetAuthorId && report.reporter.id === item.targetAuthorId} />
          ))}
        </ul>

        {/* What they reported, with the person who posted it. */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={item.targetAuthor || undefined} src={item.targetAuthorAvatarUrl} size="sm" href={authorHref} title={authorHref && item.targetAuthor ? `View ${item.targetAuthor}'s profile` : undefined} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{item.targetAuthor || 'Unknown author'}</p>
              <p className="text-xs text-slate-500">{authorMeta}</p>
            </div>
            {item.targetDeleted && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">already removed</span>}
          </div>
          <p className="mt-2.5 text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{item.preview || '(no preview)'}</p>
        </div>

        {item.status === 'open' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!item.targetDeleted && (
              <button onClick={() => act(item, 'remove')} disabled={locked} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                {working('remove') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove content
              </button>
            )}
            <button onClick={() => act(item, 'reviewed')} disabled={locked} className={secondary}>
              {working('reviewed') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Mark reviewed
            </button>
            <button onClick={() => act(item, 'dismissed')} disabled={locked} className={secondary}>
              {working('dismissed') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Dismiss
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-600" /> Moderation
          </h1>
          <p className="text-slate-600">Review content members flagged across community spaces.</p>
        </div>
        <div className="flex gap-1 bg-card border border-slate-200 rounded-xl p-1">
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setStatus(t.key)} aria-pressed={status === t.key}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${status === t.key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-500" /></div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200">
          <EmptyState icon={<ShieldCheck className="h-6 w-6 text-muted-foreground" />} title={EMPTY_COPY[status].title} description={EMPTY_COPY[status].description} />
        </div>
      ) : (
        <div className="space-y-3">
          {reports.length !== items.length && (
            <p className="text-sm text-slate-500">{reports.length} reports on {items.length} {items.length === 1 ? 'item' : 'items'}</p>
          )}
          {items.map(renderCard)}
        </div>
      )}
    </div>
  );
}
