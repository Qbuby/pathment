'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CloudOff, Copy, LifeBuoy, Lock, RotateCcw, SearchX, TriangleAlert } from 'lucide-react';

/**
 * What the product says when a screen breaks.
 *
 * It used to say "Something went wrong. This part of the app hit an
 * unexpected error." for every failure there is — including the two most
 * common ones, which are not errors at all: the person's connection dropped,
 * or their session ended. Telling somebody who is on a train that the
 * application has failed is both wrong and the most frustrating version of
 * wrong, because the fix was to wait ten seconds.
 *
 * So this reads the error first and says the most specific true thing it can,
 * with the action that actually resolves THAT case first. Red is kept for the
 * case that deserves it; a dropped connection gets a calm slate panel, because
 * nothing is broken.
 *
 * The reference is copyable. A support code you cannot select is a support
 * code nobody quotes.
 */

type Kind = 'offline' | 'session' | 'forbidden' | 'missing' | 'crash';

interface Shape {
  icon: typeof TriangleAlert;
  tone: string;
  title: string;
  body: string;
  primary?: { label: string; href?: string };
}

const SHAPES: Record<Kind, Shape> = {
  offline: {
    icon: CloudOff,
    tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
    title: 'You are offline',
    body: 'We could not reach Pathment. Nothing you have done is lost — reconnect and try again.',
  },
  session: {
    icon: Lock,
    tone: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    title: 'Your session ended',
    body: 'You were signed out, usually because the session expired. Sign in again and you will come straight back here.',
    primary: { label: 'Sign in again', href: '/login' },
  },
  forbidden: {
    icon: Lock,
    tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
    title: 'You do not have access to this',
    body: 'This page belongs to a part of the workspace you are not in. If that is wrong, an admin can grant it.',
  },
  missing: {
    icon: SearchX,
    tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
    title: 'This is not here any more',
    body: 'It may have been deleted or moved. The rest of your workspace is unaffected.',
  },
  crash: {
    icon: TriangleAlert,
    tone: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300',
    title: 'Something went wrong',
    body: 'This part of the page failed to load. Your work is saved — trying again usually fixes it, and the reference below tells us exactly what happened.',
  },
};

/**
 * Read the failure, rather than assume the worst.
 *
 * Deliberately conservative: anything that is not clearly one of the quiet
 * cases is treated as a crash, because telling somebody their connection
 * dropped when the code actually threw would be the same mistake in reverse.
 */
function classify(error?: Error & { digest?: string; status?: number }): Kind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const status = error?.status;
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'missing';
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (/failed to fetch|networkerror|network request failed|load failed/.test(text)) return 'offline';
  if (/unauthori[sz]ed|session (has )?expired|token expired/.test(text)) return 'session';
  if (/forbidden|not authori[sz]ed|permission/.test(text)) return 'forbidden';
  return 'crash';
}

export function ErrorView({
  error, reset, home, title,
}: {
  error?: Error & { digest?: string; status?: number };
  reset?: () => void;
  home?: string;
  /** Overrides the headline — only pass one when the caller knows better. */
  title?: string;
}) {
  const kind = classify(error);
  const shape = SHAPES[kind];
  const Icon = shape.icon;

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyReference = async () => {
    if (!error?.digest) return;
    try { await navigator.clipboard.writeText(error.digest); setCopied(true); } catch { /* clipboard blocked */ }
  };

  const action = 'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${shape.tone}`}>
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title || shape.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{shape.body}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {shape.primary?.href ? (
            <a href={shape.primary.href} className={`${action} bg-brand-600 text-white hover:bg-brand-700`}>
              {shape.primary.label}
            </a>
          ) : reset && (
            <button onClick={reset} className={`${action} bg-brand-600 text-white hover:bg-brand-700`}>
              <RotateCcw className="h-4 w-4" aria-hidden />Try again
            </button>
          )}
          {/* Going back is almost always what somebody wants from a screen
              that did not load, and it was the one route not offered. */}
          <button
            onClick={() => window.history.back()}
            className={`${action} border border-border text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />Go back
          </button>
          {home && (
            // `dark:text-slate-700` was on this link, so in dark mode it was
            // dark text on a dark panel — unreadable exactly when somebody is
            // trying to get out of a broken screen.
            <a href={home} className={`${action} border border-border text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800`}>
              Dashboard
            </a>
          )}
        </div>

        {kind === 'crash' && error?.digest && (
          <button
            type="button"
            onClick={copyReference}
            className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-brand-300 hover:text-brand-700"
            title="Copy this reference"
          >
            {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            {copied ? 'Copied' : <>Reference <span className="font-mono">{error.digest}</span></>}
          </button>
        )}

        {kind === 'crash' && (
          <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <LifeBuoy className="h-3 w-3" aria-hidden />
            Keeps happening? Send it to us with the feedback button in the sidebar.
          </p>
        )}
      </div>
    </div>
  );
}

export default ErrorView;
