'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

/**
 * A quiet, tinted "read" of the mentee - the summary + the concrete signals it
 * is based on. Explainable by design: it always shows the signals so it never
 * reads as a black box, and it never gates a human decision.
 */
export function AISummaryPanel({ summary, signals, collapsible = false }: {
  summary: string;
  signals: string[];
  /**
   * Start shut, open on a click.
   *
   * On a screen built for stepping through people — clan review — a paragraph
   * of generated prose is the largest thing between the mentor and the work,
   * and it is read once, if at all. Everywhere it IS the content (the mentee's
   * own progress page, the profile) it stays open, which is why this is a prop
   * and not a redesign.
   */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-2.5 text-left transition-colors hover:bg-brand-50 dark:bg-brand-500/10"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span className="text-sm font-medium text-slate-900">Progress at a glance</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/50 dark:bg-brand-500/10 p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-brand-600" />
        </div>
        <h3 className="font-semibold text-slate-900">Progress at a glance</h3>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide the summary"
            className="ml-auto rounded-lg p-1 text-brand-600 hover:bg-brand-100"
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{summary}</p>
      {signals?.length > 0 && (
        <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-brand-700">Why this summary · {signals.length} signals</summary><ul className="mt-3 space-y-1.5">
          {signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-brand-400 shrink-0" />
              {s}
            </li>
          ))}
        </ul></details>
      )}
    </div>
  );
}
