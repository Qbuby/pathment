'use client';

import { ReactNode } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/components/ui/utils';

/** Money in cents → "$99" / "$29.50". List prices are whole dollars almost always. */
export function money(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null) return '—';
  const amount = cents / 100;
  const text = Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(2);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${text}`;
}

export function RelativeTime({ date, title }: { date: string | null | undefined; title?: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const d = new Date(date);
  return (
    <span title={title || format(d, 'PPpp')} className="whitespace-nowrap">
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}

const STATUS_TONES: Record<string, string> = {
  // Workspace
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  trial: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
  suspended: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400',
  archived: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
  // Subscription
  trialing: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  paused: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
  // Memberships / invites / leads / misc
  invited: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  left: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
  pending: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  used: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  expired: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
  revoked: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400',
  verified: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  disabled: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
  error: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400',
  connected: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  new: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  contacted: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400',
  qualified: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400',
  provisioned: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  lost: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
};

export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize',
      STATUS_TONES[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
      className,
    )}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/**
 * Usage against an effective limit. -1 or null publishes as unlimited; a bar
 * that silently capped at some made-up number would contradict the plan card.
 */
export function UsageMeter({ used, limit, label }: { used: number; limit: number | null | undefined; label?: string }) {
  const unlimited = limit == null || limit < 0;
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const tone = unlimited ? 'bg-brand-500' : pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="min-w-[8rem]">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums font-medium">{used.toLocaleString()}</span>
        <span className="text-muted-foreground tabular-nums">{unlimited ? '∞' : `/ ${Number(limit).toLocaleString()}`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${unlimited ? (used > 0 ? 6 : 0) : Math.max(pct, used > 0 ? 3 : 0)}%` }} />
      </div>
      {label ? <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p> : null}
    </div>
  );
}

export function SectionCard({ title, description, actions, children, className }: {
  title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function KV({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-1.5">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn('text-xs text-right break-all', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

/** Workspace avatar: logo when set, tinted initial when not. */
export function OrgMark({ name, logoUrl, color, size = 'md' }: { name: string; logoUrl?: string | null; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-lg' }[size];
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={cn(px, 'rounded-lg object-cover ring-1 ring-border shrink-0')} />;
  }
  return (
    <span
      className={cn(px, 'inline-flex items-center justify-center rounded-lg font-semibold text-white shrink-0')}
      style={{ background: color || '#4f46e5' }}
      aria-hidden
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Simple pagination footer shared by console tables. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs">
      <span className="text-muted-foreground tabular-nums">Page {page} of {pages}</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-border px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-muted"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-border px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-muted"
        >
          Next
        </button>
      </div>
    </div>
  );
}
