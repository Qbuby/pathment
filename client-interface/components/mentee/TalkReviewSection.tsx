/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Play, Star, Video, MessageSquare } from 'lucide-react';
import { talksApi } from '@/lib/services/talks-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toExternalHref } from '@/lib/utils/url';
import { toast } from 'sonner';

export interface TalkReviewSectionProps {
  talks: Array<{
    id: string;
    title: string;
    speaker?: string | null;
    description?: string | null;
    url: string;
    thumbnailUrl?: string | null;
    durationMins?: number | null;
    rating?: number;
    ratingsCount?: number;
  }>;
}

export function TalkReviewSection({ talks }: TalkReviewSectionProps) {
  if (!talks || talks.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-brand-200">
        <Video className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        Assigned Talk{talks.length > 1 ? 's' : ''} &amp; Video{talks.length > 1 ? 's' : ''}
      </div>

      <div className="grid gap-4">
        {talks.map((talk) => (
          <SingleTalkCard key={talk.id} talk={talk} />
        ))}
      </div>
    </div>
  );
}

function SingleTalkCard({
  talk,
}: {
  talk: {
    id: string;
    title: string;
    speaker?: string | null;
    description?: string | null;
    url: string;
    thumbnailUrl?: string | null;
    durationMins?: number | null;
    rating?: number;
    ratingsCount?: number;
  };
}) {
  const [userRating, setUserRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentRating, setCurrentRating] = useState<number>(Number(talk.rating) || 0);
  const [currentCount, setCurrentCount] = useState<number>(Number(talk.ratingsCount) || 0);

  const handleSubmitReview = async () => {
    if (!userRating) {
      toast.error('Please select a star rating between 1 and 5');
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await talksApi.addReview(talk.id, {
        rating: userRating,
        feedback: feedback.trim() || undefined,
      });
      toast.success('Thank you for rating this talk!');
      setSubmitted(true);
      if (res.data?.talk) {
        setCurrentRating(Number(res.data.talk.rating) || userRating);
        setCurrentCount(Number(res.data.talk.ratingsCount) || currentCount + 1);
      }
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to submit rating'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand-200 dark:border-brand-500/20 bg-card overflow-hidden shadow-xs">
      <div className="grid md:grid-cols-5 gap-4 p-5">
        {/* Cover / Thumbnail */}
        <div className="md:col-span-2 relative aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
          {talk.thumbnailUrl ? (
            <img
              src={talk.thumbnailUrl}
              alt={talk.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
              <Video className="w-12 h-12" />
            </div>
          )}
          <a
            href={toExternalHref(talk.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 bg-black/15 hover:bg-black/30 transition-colors flex items-center justify-center group"
            title="Watch talk"
          >
            <span className="w-11 h-11 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
            </span>
          </a>
          {talk.durationMins && (
            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-semibold">
              {talk.durationMins}m
            </span>
          )}
        </div>

        {/* Talk Details */}
        <div className="md:col-span-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <a
                href={toExternalHref(talk.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold text-foreground hover:text-brand-600 transition-colors flex items-center gap-1.5"
              >
                <span>{talk.title}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </a>
            </div>

            {talk.speaker && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                Speaker / Host: <span className="text-slate-700 dark:text-slate-300">{talk.speaker}</span>
              </p>
            )}

            {talk.description && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                {talk.description}
              </p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">
                {currentCount > 0 ? currentRating.toFixed(1) : 'No ratings yet'}
              </span>
              {currentCount > 0 && (
                <span className="text-slate-400">({currentCount} mentee review{currentCount > 1 ? 's' : ''})</span>
              )}
            </div>

            <a
              href={toExternalHref(talk.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition-colors shadow-xs"
            >
              <Play className="w-3 h-3 fill-white" /> Watch Talk
            </a>
          </div>
        </div>
      </div>

      {/* Mentee Rating & Feedback Box */}
      <div className="bg-slate-50/70 dark:bg-slate-900/40 p-4 border-t border-brand-200/60 dark:border-brand-500/10 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-brand-600" />
            {submitted ? 'Your Feedback is Saved!' : 'Rate this talk & share reflection for mentors/admin'}
          </span>
          {/* Star selector */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= (hoverRating || userRating);
              return (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setUserRating(star)}
                  className="p-0.5 text-slate-300 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-4 h-4 ${
                      active ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {!submitted ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What was your main takeaway from this talk? (optional)"
              className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              disabled={submitting || !userRating}
              onClick={handleSubmitReview}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors shrink-0"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              Submit Rating
            </button>
          </div>
        ) : (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ You rated this talk {userRating} star{userRating > 1 ? 's' : ''}. Mentors and administrators appreciate your feedback!
          </p>
        )}
      </div>
    </div>
  );
}
