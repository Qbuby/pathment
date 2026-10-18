'use client';

import { useEffect, useMemo, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';
import { programsApi } from '@/lib/services/program-api';

export interface ProgramClan {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  programStatus: string | null;
}

/**
 * The clans this account can see, and the programmes they can see.
 *
 * The programme list used to be DERIVED from the clans, which is free and
 * wrong: a programme with no clans in it does not exist as far as any
 * derived list is concerned. A programme admin granted a brand-new draft
 * fellowship therefore found it in no filter on any screen — and could not
 * create its first clan either, because the clan form reads the same list.
 * A programme that has not been set up yet is exactly when somebody needs to
 * find it.
 *
 * So both are fetched. `/programs` is already scoped to what this account may
 * see, and clans still carry their programme for `programOf`.
 *
 * `programOf` is the reason this is a hook rather than a component's private
 * state: anything scoped to a CLAN is also scoped to that clan's programme,
 * and screens that filter by programme (announcements, moderation reports)
 * need to resolve one from the other without a second request.
 */
export function useProgramClans() {
  const [clans, setClans] = useState<ProgramClan[]>([]);
  const [fetched, setFetched] = useState<{ id: string; name: string; status?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    programsApi.getAll()
      .then((r: unknown) => {
        const body = r as { data?: unknown };
        const list = (Array.isArray(body?.data)
          ? body.data
          : (body?.data as { programs?: unknown })?.programs ?? []) as { id: string; name: string; status?: string }[];
        if (live) setFetched(list.map((p) => ({ id: p.id, name: p.name, status: p.status ?? null })));
      })
      .catch(() => { if (live) setFetched([]); });
    return () => { live = false; };
  }, []);

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

  /**
   * Named with their status, so a finished or unpublished one is obvious —
   * "Full Stack 2025" reads identically to the live one without it.
   *
   * Programmes come first, clans fill any gap: if `/programs` is unavailable
   * the derived list is still better than an empty menu.
   */
  const programs = useMemo(() => {
    const label = (name: string | null, status: string | null | undefined) => {
      const word = status === 'completed' ? 'Completed'
        : status === 'published' ? 'Live'
          : status || null;
      return `${name || 'Program'}${word ? ` · ${word}` : ''}`;
    };
    const seen = new Map<string, string>();
    for (const p of fetched) seen.set(p.id, label(p.name, p.status));
    for (const c of clans) {
      if (!c.programId || seen.has(c.programId)) continue;
      seen.set(c.programId, label(c.programName, c.programStatus));
    }
    return [...seen].map(([id, text]) => ({ id, label: text })).sort((a, b) => a.label.localeCompare(b.label));
  }, [fetched, clans]);

  const byId = useMemo(() => new Map(clans.map((c) => [c.id, c])), [clans]);
  /** The programme a clan belongs to, or null for a clan with none. */
  const programOf = (clanId: string | null | undefined) =>
    (clanId ? byId.get(clanId)?.programId ?? null : null);

  return { clans, programs, programOf, loading };
}
