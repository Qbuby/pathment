'use client';

import { useMemo } from 'react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useProgramClans } from '@/lib/hooks/shared/useProgramClans';

export interface ProgramClanValue {
  /** '' = every programme this admin may see. */
  programId: string;
  /** '' = every clan within the chosen programme. */
  clanId: string;
}

/**
 * Programme, then clan — the pair every admin list filters by.
 *
 * Four screens grew their own version of this and no two agreed. Review
 * records put the programme last, on the right, after the clan it governs,
 * so you picked a clan and then watched it clear itself. Follow-ups had a
 * clan menu with programme-grouped options and no way to select the
 * programme itself. Activity and nominations had neither. Same question,
 * four answers.
 *
 * One component, one order: the wide scope first, the narrow one derived
 * from it. Both come out of a single clan fetch — a clan already carries its
 * programme, so the programme list is free and is automatically limited to
 * what this admin may see, with no second request and no chance of the two
 * menus disagreeing about which programmes exist.
 */
export function ProgramClanFilter({
  value,
  onChange,
  showClan = true,
  labels = true,
  className = '',
  clanWidth = 'w-44',
  programWidth = 'w-56',
}: {
  value: ProgramClanValue;
  onChange: (next: ProgramClanValue) => void;
  /** Programme only — for a screen that has nothing clan-shaped to narrow. */
  showClan?: boolean;
  labels?: boolean;
  className?: string;
  clanWidth?: string;
  programWidth?: string;
}) {
  const { clans, programs } = useProgramClans();

  const programOptions = useMemo(
    () => [{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.label }))],
    [programs],
  );

  const clanOptions = useMemo(() => [
    { value: '', label: value.programId ? 'All clans in this program' : 'All clans' },
    ...clans
      .filter((c) => !value.programId || c.programId === value.programId)
      .map((c) => ({ value: c.id, label: c.name })),
  ], [clans, value.programId]);

  /** A clan chosen under another programme cannot survive the programme changing. */
  const changeProgram = (programId: string) => {
    const keepClan = !programId
      || !value.clanId
      || clans.find((c) => c.id === value.clanId)?.programId === programId;
    onChange({ programId, clanId: keepClan ? value.clanId : '' });
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      <div className={`${programWidth} max-w-full`}>
        {labels && <label className="block text-xs font-medium text-slate-600 mb-1">Program</label>}
        <SelectMenu
          value={value.programId}
          onChange={changeProgram}
          options={programOptions}
          ariaLabel="Filter by program"
        />
      </div>
      {showClan && (
        <div className={`${clanWidth} max-w-full`}>
          {labels && <label className="block text-xs font-medium text-slate-600 mb-1">Clan</label>}
          <SelectMenu
            value={value.clanId}
            onChange={(clanId) => onChange({ ...value, clanId })}
            options={clanOptions}
            ariaLabel="Filter by clan"
          />
        </div>
      )}
    </div>
  );
}

export default ProgramClanFilter;
