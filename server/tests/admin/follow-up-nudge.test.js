jest.mock('../../src/db', () => ({ models: { ClanMembership: { findAll: jest.fn() }, DelayEvent: { findAll: jest.fn() } } }));
jest.mock('../../src/services/clanService', () => ({ listClans: jest.fn() }));
jest.mock('../../src/services/cohortService', () => ({ preloadMenteeData: jest.fn(), buildMenteeRow: jest.fn() }));

/**
 * "Nudge everyone" has to mean everyone the FILTERS match.
 *
 * The follow-ups queue was a table an admin could read and nothing else — it
 * named the people who needed chasing and offered no way to chase one. The
 * obvious way to add the button is to post the ids the browser is showing,
 * and that is the wrong way twice over: it only reaches the twenty rows on
 * the current page, and it lets the client decide who gets messaged, which
 * turns "nudge this queue" into "message anyone".
 *
 * So the server re-runs the query. These pin the two things that makes
 * non-obvious: it must page past the first fifty, and it must stop at the cap
 * rather than quietly notifying an entire organization.
 */
const { models } = require('../../src/db');
const clans = require('../../src/services/clanService');
const cohort = require('../../src/services/cohortService');
const health = require('../../src/services/clanHealthService');
const { setDefaultRequestContext } = require('../../src/utils/auditContext');

beforeAll(() => setDefaultRequestContext({ organizationId: 'nudge-org' }));

/**
 * One clan, `count` at-risk mentees in it.
 *
 * Returns a FRESH program-scope key each time: `loadSnapshot` caches per scope
 * for 30 seconds, so reusing one would hand the next case the previous case's
 * mentees.
 */
let scopeSeq = 0;
function seed(count) {
  clans.listClans.mockResolvedValue([
    { id: 'c0', name: 'Clan 0', programId: 'p', program: { id: 'p', name: 'Program' }, leadMentor: null },
  ]);
  models.ClanMembership.findAll.mockResolvedValue(
    Array.from({ length: count }, (_, i) => ({ clanId: 'c0', userId: `u${i}`, role: 'mentee' })),
  );
  cohort.preloadMenteeData.mockResolvedValue({});
  cohort.buildMenteeRow.mockImplementation(async (id) => ({
    id, name: id, email: `${id}@example.test`, risk: 'high', riskReason: 'Needs support',
    absoluteProgress: 10, relativeProgress: 10, onTimeRate: 50, pendingApprovals: 0, openBlockers: 1,
  }));
  return [`p${scopeSeq += 1}`];
}

test('reaches past the first page rather than only the rows on screen', async () => {
  const scope = seed(120);
  const { ids, total, capped } = await health.followUpRecipients({}, scope);
  expect(total).toBe(120);
  // The queue pages at 50; a naive implementation would stop there.
  expect(ids).toHaveLength(120);
  expect(new Set(ids).size).toBe(120);
  expect(capped).toBe(false);
});

test('stops at the cap and says so, rather than notifying a whole org', async () => {
  const scope = seed(640);
  const { ids, total, capped } = await health.followUpRecipients({}, scope);
  expect(total).toBe(640);
  expect(ids).toHaveLength(200);
  expect(capped).toBe(true);
});

test('honours the filters the admin is actually looking at', async () => {
  const scope = seed(10);
  const { ids } = await health.followUpRecipients({ search: 'u7' }, scope);
  expect(ids).toEqual(['u7']);
});

test('returns nobody when the queue is empty, so the caller can refuse to send', async () => {
  const scope = seed(0);
  const { ids, total } = await health.followUpRecipients({}, scope);
  expect(ids).toEqual([]);
  expect(total).toBe(0);
});
