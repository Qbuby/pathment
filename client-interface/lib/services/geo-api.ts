import { apiClient } from './api-client';

/** Reference geography. Static for everybody, so it caches hard. */
export interface GeoCountry {
  code: string;
  name: string;
  flag?: string;
  phonecode?: string;
  timezones: string[];
}
export interface GeoState { code: string; name: string }
export interface GeoCity { name: string; state: string | null }

export const geoApi = {
  countries: () =>
    apiClient.get<{ data: { countries: GeoCountry[] } }>('/geo/countries'),

  timezones: (countryCode: string) =>
    apiClient.get<{ data: { suggested: string | null; zones: string[]; ambiguous?: boolean } }>(
      `/geo/countries/${countryCode}/timezones`,
    ),

  states: (countryCode: string) =>
    apiClient.get<{ data: { states: GeoState[] } }>(`/geo/countries/${countryCode}/states`),

  cities: (countryCode: string, opts: { state?: string | null; q?: string; limit?: number } = {}) =>
    apiClient.get<{ data: { cities: GeoCity[]; hasMore: boolean } }>(
      `/geo/countries/${countryCode}/cities`,
      { params: Object.fromEntries(Object.entries({
        state: opts.state || undefined,
        q: opts.q || undefined,
        limit: opts.limit,
      }).filter(([, v]) => v !== undefined && v !== null && v !== '')) },
    ),
};
