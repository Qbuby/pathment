'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, Rocket, Inbox, ReceiptText, Layers,
  SlidersHorizontal, UserSearch, ServerCog, ScrollText, ShieldCheck,
  ArrowLeftFromLine, Menu, X, TerminalSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformMe, type PlatformGate } from '@/lib/services/platform-api';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/components/ui/utils';

/**
 * The operator console shell, in the product's own visual language (the same
 * sidebar treatment as shared/Navigation and the admin appearance tokens).
 *
 * Access is decided by /platform/me, not by any workspace role: a tenant
 * super_admin is NOT a platform admin. A signed-in non-operator gets a quiet
 * not-found panel rather than a 403 - the console's existence is not a thing
 * to advertise to every tenant admin who guesses the URL.
 */
const PlatformContext = createContext<PlatformMe | null>(null);

export function usePlatform(): PlatformMe {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform must be used inside PlatformShell');
  return value;
}

export function useGate(gate: PlatformGate): boolean {
  return usePlatform().gates.includes(gate);
}

const NAV: Array<{ heading: string | null; items: Array<{ href: string; label: string; icon: typeof Building2; gate?: PlatformGate; exact?: boolean }> }> = [
  { heading: null, items: [{ href: '/platform', label: 'Overview', icon: LayoutDashboard, exact: true }] },
  {
    heading: 'Customers',
    items: [
      { href: '/platform/organizations', label: 'Workspaces', icon: Building2 },
      { href: '/platform/provision', label: 'Provision', icon: Rocket, gate: 'billing' },
      { href: '/platform/leads', label: 'Leads', icon: Inbox },
    ],
  },
  {
    heading: 'Billing',
    items: [
      { href: '/platform/billing', label: 'Plan requests', icon: ReceiptText },
      { href: '/platform/plans', label: 'Plan catalog', icon: Layers },
      { href: '/platform/overrides', label: 'Overrides', icon: SlidersHorizontal },
    ],
  },
  {
    heading: 'People',
    items: [{ href: '/platform/users', label: 'User lookup', icon: UserSearch, gate: 'support' }],
  },
  {
    heading: 'Operations',
    items: [{ href: '/platform/ops', label: 'Queues & jobs', icon: ServerCog }],
  },
  {
    heading: 'Governance',
    items: [
      { href: '/platform/audit', label: 'Audit trail', icon: ScrollText },
      { href: '/platform/admins', label: 'Platform admins', icon: ShieldCheck, gate: 'owner' },
    ],
  },
];

const ROLE_TONES: Record<string, string> = {
  owner: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-400',
  billing: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400',
  support: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  readonly: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
};

function NotFoundPanel() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="text-center">
        <p className="text-6xl font-semibold tracking-tight text-muted-foreground/40">404</p>
        <h1 className="mt-4 text-lg font-semibold">This page could not be found</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check the address, or head back to your workspace.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Go home
        </Link>
      </div>
    </div>
  );
}

function SidebarNav({ me, onNavigate }: { me: PlatformMe; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {NAV.map((section) => {
        const items = section.items.filter((item) => !item.gate || me.gates.includes(item.gate));
        if (!items.length) return null;
        return (
          <div key={section.heading || 'root'}>
            {section.heading ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.heading}</p>
            ) : null}
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
                      active
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    )}
                  >
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300')} aria-hidden />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: me, loading } = useApiQuery({
    queryKey: qk.platform.me,
    queryFn: platformApi.me,
    enabled: Boolean(user),
    staleTime: STALE.long,
  });

  useEffect(() => {
    if (!isLoading && !user) router.replace('/');
  }, [isLoading, user, router]);

  if (isLoading || (user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner size="lg" label="Opening console" />
      </div>
    );
  }
  if (!user) return null;
  if (!me?.isPlatformAdmin) return <NotFoundPanel />;

  const sidebar = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-200">
          <TerminalSquare className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Pathment</p>
          <p className="text-[11px] leading-tight text-muted-foreground">Platform console</p>
        </div>
      </div>
      <SidebarNav me={me} onNavigate={() => setMobileOpen(false)} />
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <p className="truncate text-xs font-medium">{me.user.firstName} {me.user.lastName}</p>
        <p className="truncate text-[11px] text-muted-foreground">{me.user.email}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize', ROLE_TONES[me.role || 'readonly'])}>
            {me.role}{me.via === 'env' ? ' · env' : ''}
          </span>
          <Link href="/" className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
            <ArrowLeftFromLine className="h-3 w-3" aria-hidden /> Exit
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <PlatformContext.Provider value={me}>
      <div data-admin-appearance className="min-h-screen bg-canvas">
        {/* Desktop sidebar - same treatment as the product navigation */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-100 dark:border-slate-800 z-40">{sidebar}</aside>

        {/* Mobile top bar + drawer */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <TerminalSquare className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold">Platform console</span>
          </div>
          <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle navigation">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-border shadow-xl">{sidebar}</aside>
          </div>
        ) : null}

        <main className="lg:pl-64">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </PlatformContext.Provider>
  );
}

/** Standard page heading - the product's admin-page-heading card. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="admin-page-heading mb-6">
      <div>
        <h1>{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
