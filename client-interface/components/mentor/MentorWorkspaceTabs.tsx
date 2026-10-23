'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  mentorWorkspaces,
  matchesMentorPath,
} from '@/lib/config/mentorWorkspaces';
import { logicalPathname, workspacePath } from '@/lib/services/workspace-scope';
import { useCoursesStatus } from '@/lib/hooks/shared';

export function MentorWorkspaceTabs() {
  const pathname = logicalPathname(usePathname());
  const workspace = mentorWorkspaces.find((group) =>
    group.tabs.some((tab) => matchesMentorPath(pathname, tab.href)),
  );
  const needsCourses = !!workspace?.tabs.some((tab) => 'requires' in tab && tab.requires === 'courses');
  const { connected: coursesConnected } = useCoursesStatus(needsCourses);
  if (!workspace) return null;
  const tabs = workspace.tabs.filter((tab) => !('requires' in tab) || tab.requires !== 'courses' || coursesConnected);
  return (
    <div className="mb-7">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {workspace.label}
      </p>
      <nav
        aria-label={`${workspace.label} tools`}
        className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={workspacePath(tab.href)}
            aria-current={
              matchesMentorPath(pathname, tab.href) ? 'page' : undefined
            }
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${matchesMentorPath(pathname, tab.href) ? 'bg-brand-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
