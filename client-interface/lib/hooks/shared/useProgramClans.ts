'use client';

import { useEffect, useMemo, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';

export interface ProgramClan {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  programStatus: string | null;
}

/**
 * The clans this account can see, and the programmes behind them.
 *
 * One fetch answers both questions, because a clan already carries its
 * programme — so the programme list costs nothing extra, is scoped to what
 * the caller may see, and cannot disagree with the clan list about which
 * programmes exist.
 *
 * `programOf` is the reason this is a hook rather than a component's private
 * state: anything scoped to a CLAN is also scoped to that clan's programme,
 * and screens that filter by programme (announcements, moderation reports)
 * need to resolve one from the other without a second request.
 */
export function useProgramClans() {
  const [clans, setClans] = useState<ProgramClan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    clanApi.list()
      .then((r: unknown) => {
        const body = r as { data?: { clans?: unknown[] } | unknown[] };
        const raw = (Array.isArray(body?.data) ? body.data : body?.data?.clans ?? []) as Record<string, unknown>[];
        if (!live) return;
        setClans(raw.map((c) => {
          const program = c.program as { id?: string; name?: string; status?: string } | undefined;
          return {
            id: String(c.id),
            name: String(c.name ?? 'Clan'),
            programId: (c.programId as string) ?? program?.id ?? null,
            programName: program?.name ?? null,
            programStatus: program?.status ?? null,
          };
        }));
      })
      .catch(() => { if (live) setClans([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  /** Distinct programmes, named with their status so a finished one is obvious. */
  const programs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of clans) {
      if (!c.programId || seen.has(c.programId)) continue;
      const status = c.programStatus === 'completed' ? 'Completed'
        : c.programStatus === 'published' ? 'Live'
          : c.programStatus;
      seen.set(c.programId, `${c.programName || 'Program'}${status ? ` · ${status}` : ''}`);
    }
    return [...seen].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [clans]);

  const byId = useMemo(() => new Map(clans.map((c) => [c.id, c])), [clans]);
  /** The programme a clan belongs to, or null for a clan with none. */
  const programOf = (clanId: string | null | undefined) =>
    (clanId ? byId.get(clanId)?.programId ?? null : null);

  return { clans, programs, programOf, loading };
}
