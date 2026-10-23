'use client';

import { useState } from 'react';
import { Loader2, Send, X, Plus } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';

/**
 * Mailing progress reports to people who do not have Pathment accounts.
 *
 * Usually whoever funds the fellowship: they pay the stipends and need to see
 * that the people they pay for are getting somewhere. That makes this the one
 * place in the product where a user sends somebody else's progress to a
 * stranger, so the drawer says plainly who is about to receive what before the
 * button is pressed, rather than afterwards in a toast.
 *
 * The server caps and validates the list as well. This is the courtesy copy,
 * not the enforcement.
 */

const LIMIT = 10;
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export function SendReportsDrawer({
  count,
  sending,
  onSend,
  trigger,
}: {
  count: number;
  sending: boolean;
  onSend: (recipients: string[], note: string) => Promise<boolean>;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    // Pasting a list is the common case, so commas and spaces both split.
    const candidates = draft.split(/[,\s;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!candidates.length) return;
    const bad = candidates.find((value) => !looksLikeEmail(value));
    if (bad) { setError(`${bad} does not look like an email address`); return; }
    const next = [...new Set([...recipients, ...candidates])];
    if (next.length > LIMIT) { setError(`${LIMIT} recipients at a time is the limit`); return; }
    setRecipients(next);
    setDraft('');
    setError(null);
  };

  const submit = async () => {
    if (!recipients.length) { setError('Add at least one email address'); return; }
    const ok = await onSend(recipients, note.trim());
    if (ok) {
      setOpen(false);
      setRecipients([]);
      setNote('');
      setDraft('');
      setError(null);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title="Email these reports"
        subtitle={`${count} mentee${count === 1 ? '' : 's'} selected. Recipients do not need a Pathment account.`}
        footer={(dismiss) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button" onClick={dismiss} disabled={sending}
              className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button" onClick={submit} disabled={sending || !recipients.length || count === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="report-recipient" className="text-sm font-medium text-foreground">
              Send to
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="report-recipient"
                value={draft}
                onChange={(event) => { setDraft(event.target.value); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); }
                }}
                placeholder="finance@organisation.org"
                type="email"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button" onClick={add}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste several at once if you like. Up to {LIMIT}.
            </p>
          </div>

          {recipients.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {recipients.map((email) => (
                <li
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => setRecipients((prev) => prev.filter((value) => value !== email))}
                    aria-label={`Remove ${email}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="report-note" className="text-sm font-medium text-foreground">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="report-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="September stipend review for the Gaza cohort."
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Appears at the top of the email, above the table.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          {/*
            * Said before the send, not after. This is somebody's progress
            * leaving the system to a person who cannot be asked to log in and
            * check it, so the sender should know exactly what is going.
            */}
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            They will receive each mentee&apos;s name, overall progress, what was finished in the
            period, their on-time rate and their place in the clan. Every send is recorded against
            your account.
          </p>
        </div>
      </Drawer>
    </>
  );
}

export default SendReportsDrawer;
