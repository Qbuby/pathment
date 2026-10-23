'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, MapPin } from 'lucide-react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { geoApi, type GeoCity, type GeoCountry, type GeoState } from '@/lib/services/geo-api';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { useDebounce } from '@/lib/hooks/useDebounce';

/**
 * Where somebody is, and therefore what time it is for them.
 *
 * City and country used to be free-text boxes, so "Lahore", "lahore" and
 * "Lahore, PK" were three different places and none of them could be grouped,
 * filtered or counted. The timezone sat beside them as a list of 400-odd IANA
 * zones with nothing connecting it to either — a person in Pakistan had to
 * already know they wanted `Asia/Karachi`.
 *
 * Picking a country now narrows the regions, which narrow the cities, and the
 * country's timezone is offered the moment it is known. Offered, not imposed:
 * a country spanning several zones says so and leaves the choice open, and an
 * existing value is never overwritten behind the person's back.
 */

export interface LocationValue {
  city: string;
  /** Region / state / province. Optional — plenty of countries have none. */
  region?: string;
  country: string;
  /** ISO-3166 alpha-2. The stable key; the names are for people. */
  countryCode?: string;
  timezone: string;
}

interface Props {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  /** Hide the timezone row where the parent renders its own. */
  showTimezone?: boolean;
}

/** Every IANA zone the runtime knows, for the manual override. */
export function tzList(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (Intl as any).supportedValuesOf?.('timeZone');
    if (Array.isArray(all) && all.length) return all;
  } catch { /* older runtime */ }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London',
    'Europe/Berlin', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
}

const NO_COUNTRIES: GeoCountry[] = [];
const NO_STATES: GeoState[] = [];
const NO_CITIES: GeoCity[] = [];

export function LocationPicker({ value, onChange, showTimezone = true }: Props) {
  const [citySearch, setCitySearch] = useState('');
  const debouncedCity = useDebounce(citySearch, 250);

  const { data: countries = NO_COUNTRIES } = useApiQuery<GeoCountry[]>({
    queryKey: qk.geo.countries,
    queryFn: async () => (await geoApi.countries())?.data?.countries ?? [],
    staleTime: STALE.long,
    errorMessage: 'Could not load the country list',
  });

  /**
   * Resolve the stored country NAME back to a code once the list arrives.
   *
   * Profiles saved before this existed hold a name and no code, and a person
   * editing an unrelated field must not have their country silently cleared.
   */
  const selectedCountry = useMemo(() => {
    if (value.countryCode) return countries.find((c) => c.code === value.countryCode) ?? null;
    if (!value.country) return null;
    const name = value.country.trim().toLowerCase();
    return countries.find((c) => c.name.toLowerCase() === name) ?? null;
  }, [countries, value.country, value.countryCode]);

  const countryCode = selectedCountry?.code ?? '';

  const { data: states = NO_STATES } = useApiQuery<GeoState[]>({
    queryKey: qk.geo.states(countryCode),
    queryFn: async () => (await geoApi.states(countryCode))?.data?.states ?? [],
    enabled: !!countryCode,
    staleTime: STALE.long,
  });

  const regionCode = useMemo(
    () => states.find((s) => s.name === value.region)?.code ?? '',
    [states, value.region],
  );

  const { data: cityPage } = useApiQuery<{ cities: GeoCity[]; hasMore: boolean }>({
    queryKey: qk.geo.cities(countryCode, regionCode, debouncedCity),
    queryFn: async () => {
      const r = await geoApi.cities(countryCode, { state: regionCode || null, q: debouncedCity });
      return { cities: r?.data?.cities ?? [], hasMore: Boolean(r?.data?.hasMore) };
    },
    enabled: !!countryCode,
    staleTime: STALE.long,
  });
  const cities = cityPage?.cities ?? NO_CITIES;

  /**
   * Offer the country's timezone when there is nothing to lose by it.
   *
   * Only when the field is empty, and only when the country has exactly one
   * zone. A country spanning several gets the list and no guess — a wrong
   * timezone is worse than an empty one, because deadlines are read in it.
   */
  useEffect(() => {
    if (!selectedCountry || value.timezone) return;
    const zones = selectedCountry.timezones ?? [];
    if (zones.length === 1) onChange({ timezone: zones[0] });
  }, [selectedCountry, value.timezone, onChange]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({
      value: c.code,
      label: `${c.flag ? `${c.flag} ` : ''}${c.name}`,
      description: c.timezones.length === 1 ? c.timezones[0].replace(/_/g, ' ') : undefined,
    })),
    [countries],
  );

  // A city already saved but absent from the current page must stay selectable.
  const cityOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = cities.map((c) => ({ value: c.name, label: c.name }))
      .filter((o) => !seen.has(o.value) && seen.add(o.value));
    if (value.city && !seen.has(value.city)) options.unshift({ value: value.city, label: value.city });
    return options;
  }, [cities, value.city]);

  const zoneOptions = useMemo(() => {
    const suggested = selectedCountry?.timezones ?? [];
    const rest = tzList().filter((z) => !suggested.includes(z));
    return [
      ...suggested.map((z) => ({
        value: z,
        label: z.replace(/_/g, ' '),
        group: selectedCountry ? `In ${selectedCountry.name}` : undefined,
      })),
      ...rest.map((z) => ({ value: z, label: z.replace(/_/g, ' '), group: suggested.length ? 'Everywhere else' : undefined })),
    ];
  }, [selectedCountry]);

  const pickCountry = (code: string) => {
    const country = countries.find((c) => c.code === code);
    if (!country) return;
    const zones = country.timezones ?? [];
    setCitySearch('');
    onChange({
      countryCode: country.code,
      country: country.name,
      // The old region and city belong to the old country.
      region: '',
      city: '',
      // Unambiguous country → set it; ambiguous → clear it so the person picks.
      timezone: zones.length === 1 ? zones[0] : '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-900">Location &amp; details</h3>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
          <SelectMenu
            value={countryCode}
            onChange={pickCountry}
            options={countryOptions}
            placeholder="Select a country…"
            ariaLabel="Country"
            searchable
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Region <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <SelectMenu
            value={value.region || ''}
            onChange={(region) => { setCitySearch(''); onChange({ region, city: '' }); }}
            options={states.map((s) => ({ value: s.name, label: s.name }))}
            placeholder={
              !countryCode ? 'Pick a country first'
                : states.length ? 'State / province / region…'
                  : 'This country has no regions'
            }
            ariaLabel="Region"
            searchable
            disabled={!countryCode || states.length === 0}
            className="w-full"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">City</label>
        <SelectMenu
          value={value.city || ''}
          onChange={(city) => onChange({ city })}
          options={cityOptions}
          placeholder={countryCode ? 'Search for your city…' : 'Pick a country first'}
          ariaLabel="City"
          searchable
          disabled={!countryCode}
          className="w-full"
          onSearch={setCitySearch}
        />
        {cityPage?.hasMore && (
          <p className="mt-1 text-xs text-slate-400">
            Showing the first matches — keep typing to narrow it down.
          </p>
        )}
      </div>

      {showTimezone && (
        <div>
          <label className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Globe className="h-3.5 w-3.5 text-slate-400" />
            Timezone
          </label>
          <SelectMenu
            value={value.timezone}
            onChange={(timezone) => onChange({ timezone })}
            options={zoneOptions}
            placeholder="e.g. Asia/Karachi"
            ariaLabel="Timezone"
            searchable
            className="w-full"
          />
          {selectedCountry && (selectedCountry.timezones?.length ?? 0) > 1 && !value.timezone && (
            <p className="mt-1 text-xs text-slate-500">
              {selectedCountry.name} spans {selectedCountry.timezones.length} timezones — pick the one you are in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default LocationPicker;
