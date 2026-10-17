'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
 * The operator console shell.
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
  owner: 'bg-brand-500/15 text-brand-300 ring-brand-500/30',
  billing: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  support: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  readonly: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

function NotFoundPanel() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <p className="text-6xl font-semibold tracking-tight text-muted-foreground/40">404</p>
        <h1 className="mt-4 text-lg font-semibold">This page could not be found</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check the address, or head back to your workspace.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Go home
        </Link>
      </div>
    </div>
  );
}

function SidebarNav({ me, onNavigate }: { me: PlatformMe; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((section) => {
        const items = section.items.filter((item) => !item.gate || me.gates.includes(item.gate));
        if (!items.length) return null;
        return (
          <div key={section.heading || 'root'}>
            {section.heading ? (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.heading}</p>
            ) : null}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                        active ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label="Opening console" />
      </div>
    );
  }
  if (!user) return null;
  if (!me?.isPlatformAdmin) return <NotFoundPanel />;

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center gap-2.5 border-b border-slate-800/80 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <TerminalSquare className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">Pathment</p>
          <p className="text-[11px] leading-tight text-slate-500">Platform console</p>
        </div>
      </div>
      <SidebarNav me={me} onNavigate={() => setMobileOpen(false)} />
      <div className="border-t border-slate-800/80 px-5 py-4">
        <p className="truncate text-xs font-medium text-slate-300">{me.user.firstName} {me.user.lastName}</p>
        <p className="truncate text-[11px] text-slate-500">{me.user.email}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize', ROLE_TONES[me.role || 'readonly'])}>
            {me.role}{me.via === 'env' ? ' · env' : ''}
          </span>
          <Link href="/" className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
            <ArrowLeftFromLine className="h-3 w-3" aria-hidden /> Exit
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <PlatformContext.Provider value={me}>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">{sidebar}</aside>

        {/* Mobile top bar + drawer */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-slate-950 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2 text-white">
            <TerminalSquare className="h-4 w-4" aria-hidden />
            <span className="text-sm font-semibold">Platform console</span>
          </div>
          <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Toggle navigation">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 w-72">{sidebar}</aside>
          </div>
        ) : null}

        <main className="lg:pl-60">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </PlatformContext.Provider>
  );
}

/** Standard page heading for console pages. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
