'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, LayoutDashboard, Loader2, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { NotificationDrawer } from '@/components/shared/NotificationDrawer';
import { workspaceLandingPath, workspacePath, logicalPathname } from '@/lib/services/workspace-scope';

/**
 * The candidate area's frame — the same sidebar, mobile header and colours as
 * the admin/mentor/mentee portals, with only what a selection-pool candidate
 * needs: their qualifying work and their notifications. No community, no
 * directory, no mentee portal; those arrive with placement into a clan.
 */
function useCandidateAccess() {
  const { user, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const [rechecked, setRechecked] = useState(false);
  const capabilities = (user?.capabilities as string[] | undefined) ?? [];
  const allowed = capabilities.includes('candidate');

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.push(workspacePath('/login')); return; }
    if (allowed) return;
    // Capabilities may be stale (they activated a moment ago) — ask once.
    if (!rechecked) { refreshUser().finally(() => setRechecked(true)); return; }
    router.push(workspaceLandingPath(user));
  }, [isLoading, user, allowed, rechecked, refreshUser, router]);

  return { user, ready: !isLoading && !!user && allowed, hasMentee: capabilities.includes('mentee') };
}

interface CandidateLink { href: string; label: string; icon: LucideIcon; match: string[] }

function NavItems({ links, pathname, onNavigate }: { links: CandidateLink[]; pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={href}
            href={workspacePath(href)}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
              active ? 'bg-brand-600 text-white shadow-sm shadow-brand-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function CandidateShell({ children }: { children: React.ReactNode }) {
  const { user, ready, hasMentee } = useCandidateAccess();
  const { logout } = useAuth();
  const pathname = logicalPathname(usePathname() || '');
  const [menuOpen, setMenuOpen] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const links: CandidateLink[] = [
    { href: '/candidate/dashboard', label: 'My qualification', icon: ClipboardList, match: ['/candidate/dashboard', '/candidate/tasks', '/candidate/quizzes', '/candidate/interviews'] },
    // Notifications live in the bell drawer, as in every other portal; its
    // "View all" opens /candidate/notifications.
    // Once placed, the mentee portal is theirs too.
    ...(hasMentee ? [{ href: '/mentee/dashboard', label: 'My clan', icon: LayoutDashboard, match: [] as string[] }] : []),
  ];
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';
  const signOut = () => { void logout(); };

  return (
    <div data-mentee-appearance className="min-h-screen bg-canvas">
      {/* ── Desktop sidebar (same frame as the portals) ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-card border-r border-slate-100">
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-4 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-tile.png" alt="Pathment" className="w-11 h-11 rounded-2xl shadow-sm shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-base leading-tight truncate">Pathment</div>
                <div className="text-slate-400 text-xs truncate">Candidate</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Selection</p>
            <NavItems links={links.slice(0, 1)} pathname={pathname} />
            {/* The portals' notification drawer, shown as a labelled menu item. */}
            {user?.id && <NotificationDrawer userId={user.id} showLabel />}
            <NavItems links={links.slice(1)} pathname={pathname} />
          </nav>

          <div className="px-3 py-4 border-t border-slate-100 space-y-1">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{fullName || user?.email}</p>
                <p className="truncate text-xs text-slate-500">Candidate</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left group"
            >
              <LogOut className="w-4 h-4 group-hover:text-red-500" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile header ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 glass border-b border-slate-100 dark:border-slate-700 z-60">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-tile.png" alt="Pathment" className="w-10 h-10 rounded-2xl shadow-sm" />
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pathment</div>
              <div className="text-slate-400 text-xs">Candidate</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {user?.id && <NotificationDrawer userId={user.id} />}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-100 bg-card">
            <nav className="px-3 py-3 space-y-0.5">
              <NavItems links={links} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </nav>
          </div>
        )}
      </div>

      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
