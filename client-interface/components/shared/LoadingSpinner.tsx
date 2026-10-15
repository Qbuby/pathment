'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';

/**
 * The loading indicator. One of them.
 *
 * Screens had drifted into five different ways of saying "wait": the Loader2
 * icon in a dozen sizes and colours, three hand-rolled CSS rings with
 * different stroke widths, and — on two screens — a Clock or a RotateCw icon
 * spun on its axis, which reads as "retrying" or "time is passing" rather than
 * "loading". Moving between screens, the thing that means *the app is busy*
 * kept changing shape.
 *
 * `Spinner` is that one shape. `LoadingSpinner` wraps it in the two layouts
 * worth sharing: a block that owns the page, and a row that sits inside a card.
 * Anything smaller (a button) uses `Spinner` directly at `size="xs"`.
 */

const SIZES = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
} as const;

export type SpinnerSize = keyof typeof SIZES;

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Override the colour only where the surface demands it (e.g. on a filled button). */
  className?: string;
  /** Screen-reader label. Omit inside an element that already announces itself. */
  label?: string;
}

/** The indicator itself — use this inside buttons, rows and custom layouts. */
export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        className={cn('animate-spin text-brand-600 dark:text-brand-400', SIZES[size], className)}
      />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

interface LoadingSpinnerProps {
  /** Message under / beside the spinner. Pass `null` for the spinner alone. */
  message?: string | null;
  /** `page` owns the viewport area; `inline` sits inside a card or section. */
  variant?: 'page' | 'inline';
  size?: SpinnerSize;
  className?: string;
}

export function LoadingSpinner({
  message = 'Loading...',
  variant = 'inline',
  size = variant === 'page' ? 'lg' : 'md',
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        variant === 'page'
          ? 'flex flex-col items-center justify-center gap-4 py-20'
          : 'flex items-center justify-center gap-3 p-8',
        className,
      )}
    >
      <Spinner size={size} />
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
      {!message && <span className="sr-only">Loading</span>}
    </div>
  );
}

/** Minimal inline loading indicator for buttons, rows, etc. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current animation-delay-200" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current animation-delay-400" />
    </span>
  );
}
