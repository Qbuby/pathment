/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/shared/Drawer';
import { Star, MessageSquare, Loader2, Play } from 'lucide-react';
import { talksApi, type TalkItem, type TalkReview } from '@/lib/services/talks-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface TalkReviewsDrawerProps {
  talk: TalkItem | null;
  onClose: () => void;
  onPlay?: (talk: TalkItem) => void;
  onTalkUpdated?: (updated: { id: string; rating: number; ratingsCount: number }) => void;
}

export function TalkReviewsDrawer({ talk, onClose, onPlay, onTalkUpdated }: TalkReviewsDrawerProps) {
  const [reviews, setReviews] = useState<TalkReview[]>([]);
  const [loading, setLoading] = useState(false);

  // Review submission state
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const talkId = talk?.id;

  useEffect(() => {
    if (!talkId) return;
    setLoading(true);
    talksApi.getReviews(talkId)
      .then((res) => {
        setReviews(res.reviews || []);
      })
      .catch((err) => {
        toast.error(extractApiErrorMessage(err, 'Could not load talk reviews'));
      })
      .finally(() => setLoading(false));
  }, [talkId]);

  if (!talk) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      toast.error('Please select a star rating between 1 and 5');
      return;
    }
    setSubmitting(true);
    try {
      const res = await talksApi.addReview(talk.id, {
        rating,
        feedback: feedback.trim() || undefined,
      });
      toast.success('Your feedback and rating have been recorded!');
      if (res?.talk && onTalkUpdated) {
        onTalkUpdated(res.talk);
      }
      // Re-fetch reviews to show the updated list
      const updated = await talksApi.getReviews(talk.id);
      setReviews(updated.reviews || []);
      setFeedback('');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to submit feedback'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={Boolean(talk)}
      onClose={onClose}
      title="Talk Ratings & Feedback"
      footer={(dismiss) => (
        <button
          type="button"
          onClick={dismiss}
          className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Close
        </button>
      )}
    >
      <div className="space-y-6">
        {/* Talk summary card */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-3.5 items-start">
          {talk.thumbnailUrl ? (
            <div className="relative aspect-video w-28 rounded-lg overflow-hidden shrink-0 bg-slate-200 border border-slate-200 dark:border-slate-800 group">
              <img src={talk.thumbnailUrl} alt={talk.title} className="w-full h-full object-cover" />
              {onPlay && (
                <button
                  type="button"
                  onClick={() => onPlay(talk)}
                  className="absolute inset-0 bg-black/40 hover:bg-black/60 transition-colors flex items-center justify-center text-white"
                  title="Play video"
                >
                  <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                </button>
              )}
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{talk.title}</h3>
            {talk.speaker && <p className="text-xs text-slate-500 truncate">{talk.speaker}</p>}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center text-amber-500">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold ml-1 text-slate-900 dark:text-slate-100">
                  {talk.rating ? Number(talk.rating).toFixed(1) : 'No ratings yet'}
                </span>
              </div>
              <span>·</span>
              <span>{talk.ratingsCount || 0} review{talk.ratingsCount === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>

        {/* Leave rating & note form */}
        <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-brand-200 dark:border-brand-500/20 bg-brand-50/40 dark:bg-brand-500/5 space-y-3.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Rate this talk &amp; leave a note
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 text-slate-300 dark:text-slate-600 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-5 h-5 ${
                      star <= (hoverRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : ''
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 ml-1.5 min-w-[32px]">
                {hoverRating || rating} / 5
              </span>
            </div>
          </div>

          <div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Write a quick review, takeaway, or note for other mentors and mentees…"
              rows={3}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-xs"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
              <span>Submit Review</span>
            </button>
          </div>
        </form>

        {/* Existing reviews list */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Community Feedback ({reviews.length})
          </h4>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-brand-600" />
              <span className="text-xs">Loading feedback…</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No feedback has been submitted for this talk yet. Be the first to rate it above!
            </div>
          ) : (
            <div className="space-y-2.5">
              {reviews.map((r) => {
                const authorName = r.user?.name || [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || 'Member';
                return (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{authorName}</span>
                      <div className="flex items-center gap-0.5 text-amber-500">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {r.feedback && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {r.feedback}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
