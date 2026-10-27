'use client';

import { Component, type ReactNode } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/components/ui/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The console's button recipes. One vocabulary instead of fourteen hand-rolled
 * variants: same radius, same focus ring, same disabled treatment everywhere.
 */
export const btn = {
  primary: 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  primarySm: 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  ghost: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40',
  ghostSm: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40',
  dangerSm: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20',
} as const;

/** Skeleton rows shaped like the console's tables; shimmer instead of a spinner. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3 max-w-[14rem]" />
            <Skeleton className="h-2.5 w-1/5 max-w-[8rem]" />
          </div>
          <Skeleton className="hidden h-3 w-24 md:block" />
          <Skeleton className="hidden h-3 w-16 lg:block" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for the stat-tile row on dashboards. */
export function TileSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-border bg-card p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-2.5 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a SectionCard body. */
export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-3" style={{ width: `${85 - index * 12}%` }} />
        ))}
      </div>
    </div>
  );
}


/**
 * Region boundary: a crash in one card or tab renders an inline error with
 * the real message instead of unmounting the whole console page.
 */
export class Region extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[platform region error]', this.props.label, error); }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-3xl border border-red-200 bg-red-50/50 p-5 text-sm dark:border-red-500/30 dark:bg-red-500/5">
          <p className="font-medium text-red-700 dark:text-red-400">This section failed to render{this.props.label ? ` (${this.props.label})` : ''}.</p>
          <pre className="mt-2 overflow-auto rounded-lg bg-background/60 p-3 font-mono text-xs whitespace-pre-wrap break-all">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  // date-fns throws RangeError on an invalid date; a bad value from one row
  // must never take the whole page down with it.
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
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
    <section className={cn('rounded-3xl border border-border bg-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-6 py-5">{children}</div>
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
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btn.ghostSm}>
          Previous
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btn.ghostSm}>
          Next
        </button>
      </div>
    </div>
  );
}
