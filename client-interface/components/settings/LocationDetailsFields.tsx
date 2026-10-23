'use client';

import { useState, type KeyboardEvent } from 'react';
import { Languages as LanguagesIcon, X } from 'lucide-react';
import { LocationPicker, tzList } from '@/components/shared/LocationPicker';

/** Re-exported: callers that only need the IANA zone list import it from here. */
export { tzList };

export interface LocationDetails {
  city: string;
  country: string;
  /** ISO-3166 alpha-2, set by the picker. */
  countryCode?: string;
  /** State / province / region, where the country has them. */
  region?: string;
  languages: string[];
  timezone: string;
}

interface Props {
  value: LocationDetails;
  onChange: (patch: Partial<LocationDetails>) => void;
}

/**
 * The "Location & details" block on every role's Settings → Profile tab.
 *
 * The location half is `LocationPicker` — a real country/region/city dataset
 * that also answers the timezone, instead of the three free-text boxes this
 * used to be. The languages half stays here: it is a free-text chip list on
 * purpose, because the set of languages people actually speak is not a closed
 * list worth policing.
 */
export function LocationDetailsFields({ value, onChange }: Props) {
  const [langDraft, setLangDraft] = useState('');

  const addLanguage = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (value.languages.some((l) => l.toLowerCase() === v.toLowerCase())) { setLangDraft(''); return; }
    onChange({ languages: [...value.languages, v] });
    setLangDraft('');
  };

  const onLangKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLanguage(langDraft); }
    else if (e.key === 'Backspace' && !langDraft && value.languages.length) {
      onChange({ languages: value.languages.slice(0, -1) });
    }
  };

  return (
    <div className="space-y-6">
      <LocationPicker
        value={{
          city: value.city,
          region: value.region,
          country: value.country,
          countryCode: value.countryCode,
          timezone: value.timezone,
        }}
        onChange={onChange}
      />

      <div>
        <label className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <LanguagesIcon className="h-3.5 w-3.5 text-slate-400" />Languages
        </label>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500">
          {value.languages.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
              {l}
              <button
                type="button"
                onClick={() => onChange({ languages: value.languages.filter((x) => x !== l) })}
                aria-label={`Remove ${l}`}
                className="hover:text-brand-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={langDraft}
            onChange={(e) => setLangDraft(e.target.value)}
            onKeyDown={onLangKey}
            onBlur={() => addLanguage(langDraft)}
            placeholder={value.languages.length ? 'Add another…' : 'e.g. English, Urdu'}
            className="min-w-[8rem] flex-1 py-1 text-sm focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">Press Enter or comma to add each language.</p>
      </div>
    </div>
  );
}

export default LocationDetailsFields;
