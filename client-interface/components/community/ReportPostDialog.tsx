'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  REPORT_CATEGORIES, REPORT_DETAILS_MAX, REPORT_DETAILS_REQUIRED_FOR,
  type ReportCategory,
} from '@/lib/services/community-api';

interface ReportPostDialogProps {
  open: boolean;
  onClose: () => void;
  /** Sends the report; resolves true when it was accepted, so the dialog can close. */
  onSubmit: (report: { category: ReportCategory; details: string }) => Promise<boolean>;
}

/**
 * "Why are you reporting this post?" — a reason is always picked; the free
 * text is optional except for "Something else", where it is the only thing
 * that tells a moderator what is wrong.
 */
export function ReportPostDialog({ open, onClose, onSubmit }: ReportPostDialogProps) {
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const detailsRequired = category === REPORT_DETAILS_REQUIRED_FOR;
  const trimmed = details.trim();
  // "Something else" with nothing written cannot be sent — Submit stays off.
  const missingDetails = detailsRequired && !trimmed;
  const canSubmit = !!category && !missingDetails && !busy;

  const reset = () => { setCategory(''); setDetails(''); };

  const submit = async () => {
    if (!category || !canSubmit) return;
    setBusy(true);
    const ok = await onSubmit({ category, details: trimmed });
    setBusy(false);
    if (ok) { reset(); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) { reset(); onClose(); } }}>
      <DialogContent className="block max-h-[calc(100vh-2rem)] w-full max-w-md gap-0 overflow-y-auto rounded-3xl border-border bg-card p-0 text-foreground shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="pr-8 text-lg leading-7 text-foreground">Report post</DialogTitle>
        </div>

        <div className="px-6 py-5">
          <p id="report-reason-label" className="text-sm font-semibold text-foreground">Why are you reporting this post?</p>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Select the option that best describes the problem.
          </DialogDescription>

          <RadioGroup
            aria-labelledby="report-reason-label"
            value={category}
            onValueChange={(value) => setCategory(value as ReportCategory)}
            className="mt-4 gap-1"
          >
            {REPORT_CATEGORIES.map((option) => {
              const id = `report-reason-${option.value}`;
              const selected = category === option.value;
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? 'bg-brand-50 font-medium text-foreground dark:bg-brand-500/15'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {option.label}
                  <RadioGroupItem
                    id={id}
                    value={option.value}
                    className="size-[18px] border-slate-400 text-brand-600 dark:border-slate-500 dark:text-brand-300 [&_svg]:size-2.5 [&_svg]:fill-current"
                  />
                </label>
              );
            })}
          </RadioGroup>

          <label htmlFor="report-details" className="mt-5 block text-sm font-semibold text-foreground">
            Additional details{' '}
            <span className={`font-normal ${detailsRequired ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              ({detailsRequired ? 'required' : 'optional'})
            </span>
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            maxLength={REPORT_DETAILS_MAX}
            required={detailsRequired}
            aria-required={detailsRequired}
            aria-describedby="report-details-hint"
            placeholder={detailsRequired ? 'Tell us what is wrong with this post…' : 'Tell us more about the issue…'}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-brand-500"
          />
          <div id="report-details-hint" className="mt-1 flex items-start justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {detailsRequired ? 'Please describe the problem so a moderator knows what to look at.' : ''}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{details.length}/{REPORT_DETAILS_MAX}</span>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            title={missingDetails ? 'Add details to submit this report' : undefined}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Sending…' : 'Submit report'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
