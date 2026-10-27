"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menteeWorkspaces } from "@/lib/config/menteeWorkspaces";
import { useMenteeScope } from "@/lib/hooks/mentee";
import { logicalPathname, workspacePath } from "@/lib/services/workspace-scope";

/**
 * What a candidate in a selection pool has, in the learner workspace's tabs.
 *
 * A round has qualifying work and nothing else: no roadmap of their own, no
 * library, no daily log, no certificates. The sidebar hides those groups
 * entirely; this keeps the strip in step so a group never renders with one
 * tab missing or, worse, a single tab that is also the page you are on.
 */
const POOL_TABS = new Set(["/mentee/tasks"]);

const matchesMentorPath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MenteeWorkspaceTabs() {
  const pathname = logicalPathname(usePathname());
  const { inPool } = useMenteeScope();
  const found = menteeWorkspaces.find((group) =>
    group.tabs.some((tab) => matchesMentorPath(pathname, tab.href)),
  );
  const workspace = found && inPool
    ? { ...found, tabs: found.tabs.filter((tab) => POOL_TABS.has(tab.href)) }
    : found;
  // One tab is not a choice, so the strip would only be taking up room.
  if (!workspace || workspace.tabs.length < 2) return null;
  return (
    <div className="mb-7">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {workspace.label}
      </p>
      <nav
        aria-label={`${workspace.label} tools`}
        className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5"
      >
        {workspace.tabs.map((tab) => (
          <Link
            key={tab.href}
            href={workspacePath(tab.href)}
            aria-current={
              matchesMentorPath(pathname, tab.href) ? "page" : undefined
            }
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${matchesMentorPath(pathname, tab.href) ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
