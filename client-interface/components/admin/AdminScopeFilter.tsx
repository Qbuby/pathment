'use client';

import { useEffect, useMemo } from 'react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useAdminScope, ALL_PROGRAMS, ALL_CLANS_IN_SCOPE } from '@/lib/context/AdminScopeContext';

/**
 * The programme (and clan) an admin screen is looking at.
 *
 * Every people screen in the admin portal listed the whole workspace and
 * offered a name search, which is the only question a name search can answer.
 * An admin running several programmes could not ask "who is in this one" —
 * the question the page exists for — and with forty-odd clans, "who is in
 * this clan" was worse.
 *
 * The choice is shared and remembered, so moving between Mentees, Mentors,
 * Enrolments and Clan requests does not mean re-picking the programme on each
 * one. It narrows and never widens: a program_admin's own scope still bounds
 * everything, and naming a programme they do not administer returns nothing.
 */
export function AdminScopeFilter({
  showClan = true,
  className = '',
}: {
  /** Some screens are programme-level only (clan requests, enrolments). */
  showClan?: boolean;
  className?: string;
}) {
  const { programId, setProgramId, clanId, setClanId, programs, clans, loading } = useAdminScope();

  const programOptions = useMemo(() => [
    { value: ALL_PROGRAMS, label: 'All programmes' },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ], [programs]);

  /** Clans of the chosen programme — all of them when none is chosen. */
  const clansInScope = useMemo(
    () => (programId === ALL_PROGRAMS ? clans : clans.filter((c) => c.programId === programId)),
    [clans, programId],
  );

  const clanOptions = useMemo(() => [
    { value: ALL_CLANS_IN_SCOPE, label: showClanAllLabel(programId) },
    ...clansInScope.map((c) => ({
      value: c.id,
      label: c.name,
      description: c.kind === 'standing' ? 'Standing' : c.programName,
    })),
  ], [clansInScope, programId]);

  /**
   * A clan that is not in the chosen programme is not a filter, it is a
   * contradiction — drop it rather than return nothing and look broken.
   *
   * `clans.length` guards it. Without that, every page load cleared the
   * remembered clan before the options had arrived: the list was empty, so
   * the stored clan "was not in it", and the scope silently reset to all on
   * every navigation. The choice only survived on the page it was made.
   */
  useEffect(() => {
    if (clanId === ALL_CLANS_IN_SCOPE || !clans.length) return;
    if (!clansInScope.some((c) => c.id === clanId)) setClanId(ALL_CLANS_IN_SCOPE);
  }, [clanId, clans.length, clansInScope, setClanId]);

  if (loading && !programs.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <SelectMenu
        value={programId}
        onChange={setProgramId}
        options={programOptions}
        ariaLabel="Filter by programme"
        searchable={programs.length > 8}
        className="min-w-48"
      />
      {showClan && (
        <SelectMenu
          value={clanId}
          onChange={setClanId}
          options={clanOptions}
          ariaLabel="Filter by clan"
          searchable={clansInScope.length > 8}
          disabled={!clansInScope.length}
          className="min-w-44"
        />
      )}
    </div>
  );
}

const showClanAllLabel = (programId: string) =>
  programId === ALL_PROGRAMS ? 'All clans' : 'All clans in it';

export default AdminScopeFilter;
