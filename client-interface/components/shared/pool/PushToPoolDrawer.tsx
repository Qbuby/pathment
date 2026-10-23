'use client';

import { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { handoverPoolApi, type HandoverReason } from '@/lib/services/handover-pool-api';
import { toast } from 'sonner';

/**
 * Handing a mentee — or a whole clan — on to whoever can take them.
 *
 * The drawer leads with the fact that reassures: nothing happens to the mentee
 * yet. A mentor hesitating over this is usually worried they are about to cut
 * somebody adrift, and they are not — the mentee stays theirs, with their work,
 * until another mentor actually takes them, and the offer can be withdrawn at
 * any point before that. Saying so is what makes the feature usable.
 *
 * The note is the part that earns its place. A transfer normally loses
 * everything the old mentor knew, so this is the one chance to pass on what the
 * task history does not say.
 */

const REASONS: { value: HandoverReason; label: string; hint: string }[] = [
  { value: 'program_closed', label: 'The programme has closed', hint: 'and I am not carrying on with them' },
  { value: 'mentor_leaving', label: 'I am stepping away', hint: 'somebody else needs to pick them up' },
  { value: 'capacity', label: 'I have too many mentees', hint: 'they would do better with more attention' },
  { value: 'fit', label: 'Not the right fit', hint: 'a different mentor would suit them better' },
  { value: 'mentee_request', label: 'They asked to move', hint: '' },
  { value: 'other', label: 'Something else', hint: '' },
];

export function PushToPoolDrawer({
  open,
  onClose,
  onDone,
  clanId,
  clanName,
  /** One mentee, or the whole clan when omitted. */
  mentee,
  menteeCount,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  clanId: string;
  clanName?: string;
  mentee?: { id: string; name: string } | null;
  menteeCount?: number;
}) {
  const wholeClan = !mentee;
  const [reason, setReason] = useState<HandoverReason>(wholeClan ? 'program_closed' : 'capacity');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (wholeClan) {
        const result = await handoverPoolApi.pushClan({ clanId, reason, handoverNote: note.trim() || undefined });
        toast.success(`${result.pushed} of ${result.total} added to the handover pool`);
      } else {
        const result = await handoverPoolApi.push({
          menteeId: mentee.id, clanId, reason, handoverNote: note.trim() || undefined,
        });
        toast.success(result.alreadyOpen
          ? `${mentee.name} was already in the pool — note updated`
          : `${mentee.name} is in the handover pool`);
      }
      setNote('');
      onClose();
      onDone?.();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not add to the pool');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={wholeClan ? 'Hand this clan on' : `Hand ${mentee?.name || 'this mentee'} on`}
      subtitle={wholeClan
        ? `Every mentee in ${clanName || 'this clan'}${menteeCount ? ` (${menteeCount})` : ''} goes into the pool for another mentor to pick up.`
        : 'Another mentor can then take them into their clan, with all of their work.'}
      footer={(dismiss) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button" onClick={dismiss} disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button" onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {wholeClan ? 'Add them all to the pool' : 'Add to the pool'}
          </button>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* The reassurance, first and plainly. */}
        <p className="flex gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Nothing changes for {wholeClan ? 'them' : mentee?.name || 'them'} yet.{' '}
            {wholeClan ? 'They stay' : 'They stay'} in {clanName || 'your clan'} with you, and keep
            working, until another mentor takes them. You can withdraw the offer at any time before
            that.
          </span>
        </p>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">Why are you handing them on?</legend>
          <ul className="mt-2 space-y-1.5">
            {REASONS.map((r) => (
              <li key={r.value}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  reason === r.value ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-950/20' : 'border-border hover:bg-muted/50'
                }`}>
                  <input
                    type="radio" name="handover-reason" value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm text-foreground">{r.label}</span>
                    {r.hint && <span className="block text-xs text-muted-foreground">{r.hint}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div>
          <label htmlFor="handover-note" className="text-sm font-medium text-foreground">
            What should the next mentor know?{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="handover-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder={wholeClan
              ? 'Where this group got to, and anything the next mentors should pick up on.'
              : 'Where they got to, what they are stuck on, what has already been tried.'}
            className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The task history shows what they did. This is the only place to pass on what it does not say.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

export default PushToPoolDrawer;
