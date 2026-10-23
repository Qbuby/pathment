'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { ClanAvatar } from './ClanAvatar';
import { ImageCropUploader } from './ImageCropUploader';
import { apiClient } from '@/lib/services/api-client';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useInvalidate } from '@/lib/query';
import type { QueryKey } from '@tanstack/react-query';

/** Group photos are capped at 1 MB (cropper + backend agree on this). */
const AVATAR_MAX_BYTES = 1 * 1024 * 1024;

/**
 * A photo for a thing people belong to — a clan, a selection pool.
 *
 * One editor rather than one per entity. The flow is the server's: crop here,
 * upload the file, then save the returned URL, which is the same two-step
 * contract `clanAvatarService` and `poolAvatarService` both expose. Anything
 * with those two endpoints can use this by naming its base path.
 */
export function EntityAvatarEditor({
  basePath,
  name,
  avatarUrl,
  label,
  fileName = 'avatar.jpg',
  invalidateKeys = [],
  onChanged,
}: {
  /** The resource, e.g. `/clans/<id>` or `/pools/<id>`. */
  basePath: string;
  name: string;
  avatarUrl?: string | null;
  /** What this photo is called in the UI, e.g. "Clan photo". */
  label: string;
  fileName?: string;
  invalidateKeys?: QueryKey[];
  onChanged: (avatarUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const invalidate = useInvalidate();

  const refresh = () => invalidateKeys.forEach((key) => void invalidate(key));

  async function remove() {
    setBusy(true);
    try {
      await apiClient.delete(`${basePath}/avatar`);
      onChanged(null);
      refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not remove photo'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-card p-4">
      <ClanAvatar name={name} src={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          {label} <span className="font-normal text-slate-500">· optional</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          PNG or JPG · up to 1 MB. Crop and zoom so it fills the circle.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setCropOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            {busy ? 'Updating…' : avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <ImageCropUploader
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        shape="circle"
        maxBytes={AVATAR_MAX_BYTES}
        title={label}
        description="PNG or JPG, up to 1 MB. Drag to reposition, slide to zoom."
        successMessage={`${label} updated`}
        upload={async (blob) => {
          // 1) Upload the file — the response carries the hosted URL.
          const body = new FormData();
          body.append('file', blob, fileName);
          const uploaded = await apiClient.post<{
            data: { url: string; fileName?: string; fileSizeBytes?: number };
          }>(`${basePath}/avatar/upload`, body);
          const url = uploaded?.data?.url;
          if (!url) throw new Error(`Could not upload ${label.toLowerCase()}`);

          // 2) Save it on the row (the same call adds and changes).
          const saved = await apiClient.put<{ data: { avatarUrl: string } }>(
            `${basePath}/avatar`,
            { avatarUrl: url }
          );
          return saved?.data?.avatarUrl || url;
        }}
        onUploaded={(url) => {
          if (!url) return;
          onChanged(url);
          refresh();
        }}
      />
    </div>
  );
}
