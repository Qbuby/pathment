const { Country, State, City } = require('country-state-city');

/**
 * Countries, their regions and their cities — and the timezone that follows
 * from picking one.
 *
 * City and country were free-text boxes, so "Lahore", "lahore", "Lahore, PK"
 * and "Lahote" were four different places, and the timezone was a separate
 * list of 400-odd IANA zones with nothing connecting it to the country the
 * person had just typed. Somebody in Pakistan had to know they wanted
 * `Asia/Karachi`.
 *
 * The dataset lives here rather than in the browser on purpose: the full set
 * is roughly 150,000 cities, which is a fine thing to query and a terrible
 * thing to ship in a page. The client asks for the list it needs.
 */

const LIMIT = 50;

const shapeCountry = (c) => ({
  code: c.isoCode,
  name: c.name,
  flag: c.flag,
  phonecode: c.phonecode,
  /** First zone is the one offered; the rest let a big country pick another. */
  timezones: (c.timezones || []).map((t) => t.zoneName).filter(Boolean),
});

const matches = (name, term) => !term || name.toLowerCase().includes(term);

class GeoService {
  /** Every country, alphabetical. Small enough to send whole and cache hard. */
  countries() {
    return Country.getAllCountries().map(shapeCountry);
  }

  /**
   * The timezone to offer for a country.
   *
   * One zone means no ambiguity. Several means the country spans them, and
   * guessing is worse than offering the list — so the first is a suggestion
   * the person can change, never a silent decision.
   */
  timezonesFor(countryCode) {
    const country = Country.getCountryByCode(String(countryCode || '').toUpperCase());
    if (!country) return { suggested: null, zones: [] };
    const zones = (country.timezones || []).map((t) => t.zoneName).filter(Boolean);
    return { suggested: zones[0] || null, zones, ambiguous: zones.length > 1 };
  }

  /** States / provinces / regions of a country. Empty for the ones with none. */
  states(countryCode, { q = '' } = {}) {
    const code = String(countryCode || '').toUpperCase();
    if (!code) return [];
    const term = String(q || '').trim().toLowerCase();
    return State.getStatesOfCountry(code)
      .filter((s) => matches(s.name, term))
      .map((s) => ({ code: s.isoCode, name: s.name }));
  }

  /**
   * Cities, narrowed as far as the caller can narrow them.
   *
   * A country alone can mean tens of thousands of cities, so a result is
   * always capped and a search term is always applied first. `hasMore` tells
   * the client to say "keep typing" rather than imply the list is complete.
   */
  cities(countryCode, { state = null, q = '', limit = LIMIT } = {}) {
    const code = String(countryCode || '').toUpperCase();
    if (!code) return { cities: [], hasMore: false };
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || LIMIT, 1), 100);
    const term = String(q || '').trim().toLowerCase();

    const all = state
      ? City.getCitiesOfState(code, String(state).toUpperCase())
      : City.getCitiesOfCountry(code) || [];

    const hits = [];
    for (const city of all) {
      if (!matches(city.name, term)) continue;
      hits.push({ name: city.name, state: city.stateCode || null });
      // One past the cap, so `hasMore` is known without counting the rest.
      if (hits.length > safeLimit) break;
    }
    const hasMore = hits.length > safeLimit;
    if (hasMore) hits.pop();
    return { cities: hits, hasMore };
  }
}

module.exports = new GeoService();
