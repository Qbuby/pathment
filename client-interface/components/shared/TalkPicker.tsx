/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { Check, Clock, Loader2, Search, Star, Video, X } from 'lucide-react';
import { talksApi, type TalkItem, type TalkCategory, type ResolveUrlResult } from '@/lib/services/talks-api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface TalkPickerProps {
  value?: TalkItem | TalkItem[] | null;
  onChange: (value: any) => void;
  multiple?: boolean;
}

export function TalkPicker({ value, onChange, multiple = false }: TalkPickerProps) {
  const isMulti = multiple || Array.isArray(value);
  const rawList: TalkItem[] = Array.isArray(value) ? value : value ? [value] : [];
  const selectedList = Array.from(new Map(rawList.map((t) => [t.id, t])).values());

  const [search, setSearch] = useState('');
  const [talks, setTalks] = useState<TalkItem[]>([]);
  const [categories, setCategories] = useState<TalkCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [urlResult, setUrlResult] = useState<ResolveUrlResult | null>(null);

  // Quick inline add talk state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSpeaker, setNewSpeaker] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newThumbnail, setNewThumbnail] = useState('');
  const [newCategoryIds, setNewCategoryIds] = useState<string[]>([]);
  const [savingNew, setSavingNew] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  // Load categories once
  useEffect(() => {
    talksApi.listCategories()
      .then((res: any) => setCategories(res.data?.categories || []))
      .catch(() => {});
  }, []);

  // Fetch talks
  useEffect(() => {
    let active = true;
    const isUrl = /^https?:\/\//i.test(debouncedSearch.trim());

    if (isUrl) {
      setResolvingUrl(true);
      talksApi.resolveUrl(debouncedSearch.trim())
        .then((res: any) => {
          if (active) {
            const data: ResolveUrlResult = res.data;
            setUrlResult(data);
          }
        })
        .catch(() => {
          if (active) setUrlResult(null);
        })
        .finally(() => {
          if (active) setResolvingUrl(false);
        });
    } else {
      setUrlResult(null);
    }

    setLoading(true);
    talksApi.list({ search: isUrl ? undefined : debouncedSearch || undefined, limit: 20 })
      .then((res: any) => {
        if (active) setTalks(res.data?.talks || []);
      })
      .catch(() => {
        if (active) setTalks([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [debouncedSearch]);

  const handleSelect = (talk: TalkItem) => {
    const isAlreadySelected = selectedList.some((t) => t.id === talk.id);

    if (isAlreadySelected) {
      const filtered = selectedList.filter((t) => t.id !== talk.id);
      onChange(isMulti ? filtered : null);
    } else {
      const next = isMulti ? [...selectedList, talk] : talk;
      onChange(next);
    }
  };

  const handleRemove = (id: string) => {
    const filtered = selectedList.filter((t) => t.id !== id);
    onChange(isMulti ? filtered : null);
  };

  const handleQuickAdd = async () => {
    if (!newUrl.trim() || !newTitle.trim() || !newCategoryIds.length) {
      toast.error('URL, title, and at least one category are required');
      return;
    }
    setSavingNew(true);
    try {
      const res: any = await talksApi.create({
        url: newUrl.trim(),
        title: newTitle.trim(),
        speaker: newSpeaker.trim() || undefined,
        durationMins: newDuration ? Number(newDuration) : undefined,
        thumbnailUrl: newThumbnail || undefined,
        categoryIds: newCategoryIds,
      });
      const createdTalk: TalkItem = res.data?.talk;
      toast.success('Talk added to library');
      handleSelect(createdTalk);
      setIsAddingNew(false);
      setNewUrl('');
      setNewTitle('');
      setNewSpeaker('');
      setNewDuration('');
      setNewThumbnail('');
      setNewCategoryIds([]);
      setSearch('');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to add talk'));
    } finally {
      setSavingNew(false);
    }
  };

  const startQuickAddFromMetadata = (res: ResolveUrlResult) => {
    setNewUrl(res.url);
    setNewTitle(res.metadata.title || '');
    setNewSpeaker(res.metadata.speaker || '');
    setNewThumbnail(res.metadata.thumbnailUrl || '');
    if (categories.length > 0) {
      setNewCategoryIds([categories[0].id]);
    }
    setIsAddingNew(true);
  };

  return (
    <div className="space-y-3">
      {/* Selected talks pill display */}
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedList.map((talk) => (
            <div
              key={talk.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-white dark:bg-slate-900 shadow-xs text-xs font-medium text-slate-800 dark:text-slate-100"
            >
              {talk.thumbnailUrl ? (
                <img
                  src={talk.thumbnailUrl}
                  alt={talk.title}
                  className="w-5 h-5 rounded-md object-cover shrink-0"
                />
              ) : (
                <Video className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              )}
              <span className="truncate max-w-[180px]">{talk.title}</span>
              {talk.speaker && <span className="text-slate-400">({talk.speaker})</span>}
              <button
                type="button"
                onClick={() => handleRemove(talk.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search talks library or paste YouTube / podcast link..."
          className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        {resolvingUrl && (
          <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-brand-600 animate-spin" />
        )}
      </div>

      {/* Already in library notification banner */}
      {urlResult?.exists && urlResult.existingTalk && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            {urlResult.existingTalk.thumbnailUrl ? (
              <img
                src={urlResult.existingTalk.thumbnailUrl}
                alt=""
                className="w-9 h-7 rounded-md object-cover shrink-0"
              />
            ) : (
              <Video className="w-4 h-4 text-emerald-600" />
            )}
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Here is this podcast/talk already in your library!
              </p>
              <p className="text-emerald-700 dark:text-emerald-300 truncate max-w-sm">
                {urlResult.existingTalk.title} {urlResult.existingTalk.speaker && `• ${urlResult.existingTalk.speaker}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const talk = talks.find((t) => t.id === urlResult.existingTalk!.id) || {
                ...urlResult.existingTalk,
                description: '',
                durationMins: null,
                rating: 0,
                ratingsCount: 0,
                uploadedBy: null,
                uploaderName: null,
                categories: [],
                canManage: false,
                createdAt: new Date().toISOString(),
              } as TalkItem;
              handleSelect(talk);
              setSearch('');
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shrink-0 transition-colors"
          >
            Select Talk
          </button>
        </div>
      )}

      {/* URL resolved but not in library yet */}
      {urlResult && !urlResult.exists && !isAddingNew && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            {urlResult.metadata.thumbnailUrl && (
              <img
                src={urlResult.metadata.thumbnailUrl}
                alt=""
                className="w-9 h-7 rounded-md object-cover shrink-0"
              />
            )}
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-200">
                Add this video to your Talks Library
              </p>
              <p className="text-blue-700 dark:text-blue-300 truncate max-w-sm">
                {urlResult.metadata.title || urlResult.url}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => startQuickAddFromMetadata(urlResult)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shrink-0 transition-colors"
          >
            Add & Select
          </button>
        </div>
      )}

      {/* Inline Quick Add Form */}
      {isAddingNew && (
        <div className="p-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-white dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Add Talk to Library
            </h4>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Title *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Speaker / Host</label>
                <input
                  type="text"
                  value={newSpeaker}
                  onChange={(e) => setNewSpeaker(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Duration (mins)</label>
                <input
                  type="number"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Category *</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const active = newCategoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setNewCategoryIds((prev) =>
                          active ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                        active
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingNew}
              onClick={handleQuickAdd}
              className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-1.5 font-medium disabled:opacity-50"
            >
              {savingNew && <Loader2 className="w-3 h-3 animate-spin" />}
              Save & Select
            </button>
          </div>
        </div>
      )}

      {/* Talks list */}
      <div className="max-h-60 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-1.5">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> Loading talks...
          </div>
        ) : talks.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No talks found. Paste a video link to add one!
          </div>
        ) : (
          talks.map((talk) => {
            const isSelected = selectedList.some((t) => t.id === talk.id);
            return (
              <button
                key={talk.id}
                type="button"
                onClick={() => handleSelect(talk)}
                className={`w-full text-left p-2.5 rounded-lg flex items-start gap-3 transition-colors ${
                  isSelected
                    ? 'bg-brand-50 dark:bg-brand-500/15 border border-brand-200 dark:border-brand-500/30'
                    : 'hover:bg-white dark:hover:bg-slate-800 border border-transparent'
                }`}
              >
                {talk.thumbnailUrl ? (
                  <img
                    src={talk.thumbnailUrl}
                    alt=""
                    className="w-14 h-10 rounded-md object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-14 h-10 rounded-md bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {talk.title}
                    </p>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {talk.speaker && <span className="truncate max-w-[120px]">{talk.speaker}</span>}
                    {talk.durationMins ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3" /> {talk.durationMins}m
                      </span>
                    ) : null}
                    {talk.ratingsCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {talk.rating.toFixed(1)} ({talk.ratingsCount})
                      </span>
                    ) : (
                      <span className="text-slate-400">No ratings yet</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
