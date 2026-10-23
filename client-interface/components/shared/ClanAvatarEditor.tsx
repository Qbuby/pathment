'use client';

import { EntityAvatarEditor } from './EntityAvatarEditor';
import { qk } from '@/lib/query';

/**
 * Clan photo field + crop modal.
 *
 * The flow itself lives in `EntityAvatarEditor`, which a selection pool uses
 * too — both expose the same upload-then-save endpoints, so there is no reason
 * for two copies of it.
 */
export function ClanAvatarEditor({
  clanId,
  name,
  avatarUrl,
  onChanged,
}: {
  clanId: string;
  name: string;
  avatarUrl?: string | null;
  onChanged: (avatarUrl: string | null) => void;
}) {
  return (
    <EntityAvatarEditor
      basePath={`/clans/${clanId}`}
      name={name}
      avatarUrl={avatarUrl}
      label="Clan photo"
      fileName="clan-avatar.jpg"
      invalidateKeys={[qk.clan.all]}
      onChanged={onChanged}
    />
  );
}
