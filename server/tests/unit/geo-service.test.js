/**
 * Country → region → city, and the timezone a country implies.
 *
 * City and country were free-text boxes and the timezone was an unrelated list
 * of 400-odd IANA zones. These cover the rules that make the new pickers
 * trustworthy: the suggestion is only made when it cannot be wrong, and a
 * result set is never silently truncated.
 */
const geo = require('../../src/services/geoService');

test('every country is offered, with its timezones', () => {
  const countries = geo.countries();
  expect(countries.length).toBeGreaterThan(190);
  const pk = countries.find((c) => c.code === 'PK');
  expect(pk.name).toBe('Pakistan');
  expect(pk.timezones).toContain('Asia/Karachi');
});

test('a country in one timezone suggests it', () => {
  const { suggested, ambiguous } = geo.timezonesFor('PK');
  expect(suggested).toBe('Asia/Karachi');
  expect(ambiguous).toBe(false);
});

test('a country spanning several is flagged rather than guessed', () => {
  // A wrong timezone is worse than an empty one — deadlines are read in it.
  const us = geo.timezonesFor('US');
  expect(us.zones.length).toBeGreaterThan(1);
  expect(us.ambiguous).toBe(true);
});

test('an unknown country code answers emptily rather than throwing', () => {
  expect(geo.timezonesFor('ZZ')).toEqual({ suggested: null, zones: [] });
  expect(geo.timezonesFor(null)).toEqual({ suggested: null, zones: [] });
  expect(geo.states('')).toEqual([]);
  expect(geo.cities('')).toEqual({ cities: [], hasMore: false });
});

test('a lower-case country code still resolves', () => {
  expect(geo.timezonesFor('pk').suggested).toBe('Asia/Karachi');
  expect(geo.states('pk').length).toBeGreaterThan(0);
});

test('regions come back for a country that has them', () => {
  const states = geo.states('PK');
  expect(states.map((s) => s.name)).toContain('Punjab');
  expect(states.find((s) => s.name === 'Punjab').code).toBeTruthy();
});

test('cities are searchable inside a region', () => {
  const punjab = geo.states('PK').find((s) => s.name === 'Punjab');
  const { cities } = geo.cities('PK', { state: punjab.code, q: 'lah' });
  expect(cities.map((c) => c.name)).toContain('Lahore');
});

test('a big result is capped and says there is more', () => {
  const { cities, hasMore } = geo.cities('US', { limit: 10 });
  expect(cities).toHaveLength(10);
  expect(hasMore).toBe(true);
});

test('the cap cannot be raised past a sane ceiling', () => {
  const { cities } = geo.cities('US', { limit: 100000 });
  expect(cities.length).toBeLessThanOrEqual(100);
});
