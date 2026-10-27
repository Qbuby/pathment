/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Video,
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  Loader2,
  Pencil,
  Tag,
  FolderPlus,
  User,
  Check,
  Star,
  Play,
  AlertCircle,
  X,
  MessageSquare,
} from 'lucide-react';
import { useTalks, type TalkItem, type TalkCategory } from '@/lib/hooks/mentor/useTalks';
import { talksApi } from '@/lib/services/talks-api';
import { Drawer } from '@/components/shared/Drawer';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { toExternalHref } from '@/lib/utils/url';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { VideoPlayerModal } from '@/components/shared/VideoPlayerModal';
import { TalkReviewsDrawer } from '@/components/shared/talks/TalkReviewsDrawer';

export default function TalksView() {
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canManageCategories = can('system.settings');

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounce(rawSearch, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const {
    talks,
    categories,
    loading,
    error,
    refetch,
    refetchCategories,
  } = useTalks({
    search,
    categoryId: selectedCategory === 'all' ? '' : selectedCategory,
  });

  const [editingTalk, setEditingTalk] = useState<TalkItem | 'new' | null>(null);
  const [categoriesDrawerOpen, setCategoriesDrawerOpen] = useState(false);
  const [playingTalk, setPlayingTalk] = useState<TalkItem | null>(null);
  const [reviewingTalk, setReviewingTalk] = useState<TalkItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const handleDeleteTalk = async (talk: TalkItem) => {
    if (
      await confirm({
        title: 'Delete this talk?',
        description: `"${talk.title}" will be permanently removed from the library.`,
        variant: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      try {
        setBusy(talk.id);
        await talksApi.remove(talk.id);
        toast.success('Talk removed');
        await refetch();
        await refetchCategories();
      } catch (e) {
        toast.error(extractApiErrorMessage(e, 'Could not delete talk'));
      } finally {
        setBusy(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Talks Library</h1>
          <p className="text-slate-600 dark:text-slate-400">
            A centralized library of talks and workshops shared by mentors and admins across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageCategories && (
            <button
              onClick={() => setCategoriesDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted shrink-0 transition-colors"
            >
              <FolderPlus className="w-4 h-4 text-slate-500" /> Manage categories
            </button>
          )}
          <button
            onClick={() => setEditingTalk('new')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Add talk
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            aria-label="Search talks"
            placeholder="Search talks by title, speaker, or keywords…"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-xl">
          <button
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-card text-brand-700 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              aria-pressed={selectedCategory === c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                selectedCategory === c.id
                  ? 'bg-card text-brand-700 dark:text-brand-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>{c.name}</span>
              {typeof c.talkCount === 'number' && c.talkCount > 0 && (
                <span className="text-xs px-1.5 py-0.2 bg-slate-200/60 dark:bg-slate-700/60 rounded-full">
                  {c.talkCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 py-16 text-center text-slate-600 dark:text-slate-400">
          {error}
        </div>
      ) : talks.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 text-center">
          <Video className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400">
            {rawSearch || selectedCategory !== 'all' ? 'No talks match your search or filter.' : 'No talks added yet.'}
          </p>
          <button
            onClick={() => setEditingTalk('new')}
            className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Add the first talk →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {talks.map((t) => (
            <TalkCard
              key={t.id}
              talk={t}
              busy={busy === t.id}
              onEdit={() => setEditingTalk(t)}
              onDelete={() => handleDeleteTalk(t)}
              onPlay={() => setPlayingTalk(t)}
              onOpenReviews={() => setReviewingTalk(t)}
            />
          ))}
        </div>
      )}

      {editingTalk && (
        <TalkEditorDrawer
          talk={editingTalk === 'new' ? null : editingTalk}
          categories={categories}
          onClose={() => setEditingTalk(null)}
          onSaved={() => {
            setEditingTalk(null);
            refetch();
            refetchCategories();
          }}
        />
      )}

      {categoriesDrawerOpen && (
        <CategoriesManagerDrawer
          categories={categories}
          onClose={() => setCategoriesDrawerOpen(false)}
          onChanged={() => {
            refetchCategories();
            refetch();
          }}
        />
      )}

      {playingTalk && (
        <VideoPlayerModal
          open={Boolean(playingTalk)}
          onClose={() => setPlayingTalk(null)}
          title={playingTalk.title}
          speaker={playingTalk.speaker}
          url={playingTalk.url}
        />
      )}

      {reviewingTalk && (
        <TalkReviewsDrawer
          talk={reviewingTalk}
          onClose={() => setReviewingTalk(null)}
          onPlay={(t) => setPlayingTalk(t)}
          onTalkUpdated={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}

function TalkCard({
  talk,
  busy,
  onEdit,
  onDelete,
  onPlay,
  onOpenReviews,
}: {
  talk: TalkItem;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPlay: () => void;
  onOpenReviews: () => void;
}) {
  return (
    <div className="group relative bg-card rounded-3xl border border-border overflow-hidden flex flex-col transition-all hover:shadow-md hover:border-brand-300 dark:hover:border-brand-600">
      {/* Video cover thumbnail */}
      <div className="relative aspect-video w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {talk.thumbnailUrl ? (
          <img
            src={talk.thumbnailUrl}
            alt={talk.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
            <Video className="w-12 h-12" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/25 transition-colors flex items-center justify-center">
          <button
            type="button"
            onClick={onPlay}
            className="w-11 h-11 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg opacity-85 group-hover:opacity-100 group-hover:scale-110 transition-all cursor-pointer"
            title="Play video in Pathment"
          >
            <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
          </button>
        </div>
        {talk.durationMins ? (
          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-semibold backdrop-blur-xs flex items-center gap-1">
            <Clock className="w-3 h-3" /> {talk.durationMins}m
          </span>
        ) : null}
        {talk.canManage && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-xs rounded-xl p-1 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              disabled={busy}
              title="Edit talk"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              title="Delete talk"
              className="p-1.5 rounded-lg text-white/80 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {/* Rating and categories */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {talk.categories.map((c) => (
              <span
                key={c.id}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 border border-brand-200/50 dark:border-brand-500/20"
              >
                {c.name}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenReviews}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline shrink-0 transition-colors"
            title="View or leave feedback & rating"
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{talk.ratingsCount > 0 ? talk.rating.toFixed(1) : 'Rate'}</span>
            <span className="text-slate-400 text-[11px] font-normal">({talk.ratingsCount || 0})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onPlay}
          className="block text-left group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors w-full cursor-pointer"
        >
          <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2">
            {talk.title}
          </h3>
        </button>

        {talk.speaker && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
            <User className="w-3.5 h-3.5" /> {talk.speaker}
          </p>
        )}

        {talk.description && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">
            {talk.description}
          </p>
        )}

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-slate-400">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Play</span>
          </button>
          <button
            type="button"
            onClick={onOpenReviews}
            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Feedback</span>
          </button>
          <a
            href={toExternalHref(talk.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function TalkEditorDrawer({
  talk,
  categories,
  onClose,
  onSaved,
}: {
  talk: TalkItem | null;
  categories: TalkCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(talk?.title || '');
  const [speaker, setSpeaker] = useState(talk?.speaker || '');
  const [url, setUrl] = useState(talk?.url || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(talk?.thumbnailUrl || '');
  const [durationMins, setDurationMins] = useState(talk?.durationMins ? String(talk.durationMins) : '');
  const [description, setDescription] = useState(talk?.description || '');
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(
    talk ? talk.categories.map((c) => c.id) : categories[0] ? [categories[0].id] : []
  );
  const [saving, setSaving] = useState(false);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [conflictTalk, setConflictTalk] = useState<{ id: string; title: string; url: string } | null>(null);

  /**
   * Looking a url up, once, in order.
   *
   * Every one of these used to be fire-and-forget. The url field resolved on
   * change, on paste AND on blur, so a single paste launched three overlapping
   * lookups - and typing a url by hand launched one per character. They
   * returned in whatever order they finished, each one writing to the same
   * state and each one clearing the spinner in its own `finally`, so the
   * spinner stopped on the FIRST reply while two were still in flight. That is
   * why the duration sometimes appeared, sometimes did not, and why the same
   * url could behave differently twice in a row.
   *
   * Now: one lookup per url, the newest wins, and anything older is discarded
   * when it lands rather than allowed to overwrite a fresher answer.
   */
  const resolveSeq = useRef(0);
  const resolvedUrlRef = useRef<string | null>(null);
  const editedRef = useRef<Record<string, boolean>>({});

  const resolveVideoUrl = useCallback(async (inputUrl: string, { force = false } = {}) => {
    const trimmed = inputUrl.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) return;
    // The same url twice in a row is the same answer; asking again is how a
    // paste turned into three downloads of the same page.
    if (!force && resolvedUrlRef.current === trimmed) return;
    resolvedUrlRef.current = trimmed;

    const seq = ++resolveSeq.current;
    setResolvingUrl(true);
    setConflictTalk(null);
    try {
      const data = await talksApi.resolveUrl(trimmed);
      if (seq !== resolveSeq.current) return; // superseded while in flight
      if (data?.exists && data?.existingTalk && data.existingTalk.id !== talk?.id) {
        setConflictTalk(data.existingTalk);
      }
      if (data?.metadata) {
        /*
         * A field the fetch owns is refilled for a NEW url unless the person
         * has typed in it themselves. The old rule was "only if empty", which
         * meant a url that failed the first time could never be corrected by
         * a later successful lookup, and editing a talk never picked anything
         * up at all.
         */
        const fill = (key: string, current: string, value: string | null | undefined, set: (v: string) => void) => {
          if (!value) return;
          if (editedRef.current[key] && current.trim()) return;
          set(String(value));
        };
        fill('title', title, data.metadata.title, setTitle);
        fill('speaker', speaker, data.metadata.speaker, setSpeaker);
        fill('description', description, data.metadata.description, setDescription);
        fill('duration', durationMins, data.metadata.durationMins ? String(data.metadata.durationMins) : null, setDurationMins);
        if (!thumbnailUrl && data.metadata.thumbnailUrl) setThumbnailUrl(data.metadata.thumbnailUrl);
      }
    } catch {
      // A failed lookup must not be remembered as done, or retyping the same
      // url would never try again.
      if (seq === resolveSeq.current) resolvedUrlRef.current = null;
    } finally {
      if (seq === resolveSeq.current) setResolvingUrl(false);
    }
  }, [talk?.id, title, speaker, description, durationMins, thumbnailUrl]);

  // Typing a url should not fire a lookup per character.
  useEffect(() => {
    const trimmed = url.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) return;
    const timer = setTimeout(() => resolveVideoUrl(trimmed), 450);
    return () => clearTimeout(timer);
  }, [url, resolveVideoUrl]);

  const toggleCategory = (id: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error('A title is required');
      return;
    }
    if (!url.trim()) {
      toast.error('A talk resource link is required');
      return;
    }
    if (!selectedCatIds.length) {
      toast.error('Please select at least one category');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        speaker: speaker.trim() || undefined,
        url: url.trim(),
        thumbnailUrl: thumbnailUrl.trim() || undefined,
        durationMins: durationMins ? Number(durationMins) : null,
        description: description.trim() || undefined,
        categoryIds: selectedCatIds,
      };

      if (talk) {
        await talksApi.update(talk.id, payload);
        toast.success('Talk updated');
      } else {
        await talksApi.create(payload);
        toast.success('Talk added to library');
      }
      onSaved();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save talk'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={talk ? 'Edit talk' : 'Add new talk'}
      subtitle="Share an inspiring or technical talk with mentors and admins"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            // A duplicate url cannot be saved - the workspace has a unique
            // index on it - so the button stops rather than letting the submit
            // travel to the server and come back as a red error on a form the
            // user cannot fix without changing the url anyway.
            disabled={saving || Boolean(conflictTalk)}
            title={conflictTalk ? 'This talk is already in the library' : undefined}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 shadow-sm transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {conflictTalk ? 'Already added' : talk ? 'Save changes' : 'Add talk'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Talk Title <span className="text-rose-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => { editedRef.current.title = true; setTitle(e.target.value); }}
            placeholder="e.g. How great leaders inspire action"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Speaker / Presenter
            </label>
            <input
              value={speaker}
              onChange={(e) => { editedRef.current.speaker = true; setSpeaker(e.target.value); }}
              placeholder={resolvingUrl ? 'Reading the video…' : 'e.g. Simon Sinek'}
              className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={durationMins}
              onChange={(e) => { editedRef.current.duration = true; setDurationMins(e.target.value); }}
              placeholder={resolvingUrl ? 'Reading the video…' : 'e.g. 18'}
              className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Resource URL <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setConflictTalk(null);
              }}
              onBlur={() => resolveVideoUrl(url)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
            />
            {resolvingUrl && (
              <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-brand-600 animate-spin" />
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            {resolvingUrl ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                <span className="text-brand-600">Reading the video for its title, speaker, description, duration and cover…</span>
              </>
            ) : (
              'Paste a YouTube or video link to automatically fetch title, speaker, description, duration & cover.'
            )}
          </p>

          {/*
            * Finding the talk already there is a useful answer, not a warning:
            * the library did its job and saved somebody a duplicate. So it
            * reads as an ordinary panel like everything else in admin, rather
            * than a yellow alert shouting about a non-problem. Adding is
            * blocked while it stands, so the message no longer has to carry
            * that weight on its own.
            */}
          {conflictTalk && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 p-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex min-w-0 items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">Already in the library:</strong>{' '}
                  &ldquo;{conflictTalk.title}&rdquo;
                </span>
              </div>
              <a
                href={toExternalHref(conflictTalk.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 shrink-0 font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
              >
                Open talk
              </a>
            </div>
          )}
        </div>

        {thumbnailUrl && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cover Image Preview
            </label>
            <div className="relative aspect-video w-48 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100">
              <img src={thumbnailUrl} alt="Cover preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setThumbnailUrl('')}
                className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white hover:bg-black/80 text-xs"
                title="Remove cover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Categories <span className="text-rose-500">*</span>{' '}
            <span className="text-slate-400 font-normal">(select one or more)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedCatIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description & Key Takeaways
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => { editedRef.current.description = true; setDescription(e.target.value); }}
            placeholder="Summarize the core message or why mentors should share this with their mentees…"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>
      </div>
    </Drawer>
  );
}

function CategoriesManagerDrawer({
  categories,
  onClose,
  onChanged,
}: {
  categories: TalkCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [newCatName, setNewCatName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    setCreating(true);
    try {
      await talksApi.createCategory(newCatName.trim());
      toast.success('Category added');
      setNewCatName('');
      onChanged();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create category'));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await talksApi.updateCategory(id, editName.trim());
      toast.success('Category renamed');
      setEditingId(null);
      onChanged();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update category'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cat: TalkCategory) => {
    if (
      await confirm({
        title: `Delete category "${cat.name}"?`,
        description: 'Categories with existing talks cannot be deleted until the talks are moved.',
        variant: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      setBusy(true);
      try {
        await talksApi.removeCategory(cat.id);
        toast.success('Category removed');
        onChanged();
      } catch (e) {
        toast.error(extractApiErrorMessage(e, 'Could not remove category'));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Manage Talk Categories"
      subtitle="Organize talks by topic, discipline, or focus area"
      width="md"
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Create new category
          </label>
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. System Design, Public Speaking"
              className="flex-1 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newCatName.trim()}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Existing Categories ({categories.length})
          </h3>
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {editingId === c.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-brand-500 rounded px-2 py-1 text-sm bg-card text-foreground"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdate(c.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded bg-brand-600 text-white text-xs font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 rounded border text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 truncate">
                      <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                      {typeof c.talkCount === 'number' && (
                        <span className="text-xs text-slate-400">({c.talkCount} talks)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
