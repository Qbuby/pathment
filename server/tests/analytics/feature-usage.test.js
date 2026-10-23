'use strict';

/**
 * "Which screens does anybody actually open?" — and the two ways to get it
 * wrong.
 *
 * One: count URLs instead of screens. `/w/dev-weekends/mentee/step/<uuid>` is
 * one feature however many roadmap steps exist. Counted raw, a screen every
 * mentee uses every day reads as a hundred screens used once each — the exact
 * inverse of the answer. The client folds before it sends; this folds again in
 * SQL so the rows written before any of this existed are folded too, and the
 * cases below are the SAME list the client asserts in
 * client-interface/tests/page-key.test.cjs. If the two drift, the report's
 * join silently drops rows and every number quietly shrinks.
 *
 * Two: count views and call it usage. One person refreshing a tab all day
 * outranks ten people who each opened a screen once. People is the headline
 * number here, and it is a distinct count.
 */

const { models, sequelize } = require('../../src/db');
const featureUsageService = require('../../src/services/featureUsageService');
const { cleanDb, createMentee, createMentor } = require('../helpers/seed');

const view = (userId, page, createdAt = new Date()) => models.AnalyticsEvent.create({
  userId,
  eventType: 'page_view',
  eventCategory: 'navigation',
  eventData: { page },
  createdAt,
});

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

describe('feature usage', () => {
  let organizationId, alice, bob, mentor;

  beforeEach(async () => {
    await cleanDb();
    alice = await createMentee({ email: 'alice@test.com' });
    bob = await createMentee({ email: 'bob@test.com' });
    mentor = await createMentor({ email: 'm@test.com' });
    const membership = await models.OrganizationMembership.findOne({ where: { userId: alice.id } });
    organizationId = membership.organizationId;
  });

  const find = (pages, page) => pages.find((p) => p.page === page);

  it('folds every URL for one screen into one row', async () => {
    await view(alice.id, '/w/dev-weekends/mentee/step/ab22ddfd-bee0-479f-bf7f-b48743c9f0b5');
    await view(bob.id, '/mentee/step/1039f7e2-0970-4749-a0dd-db372aff608e');
    await view(alice.id, '/w/other-org/mentee/step/744918d2-d158-4333-84b8-a5c5e25e3e74');

    const pages = await featureUsageService.pageUsage({ organizationId, days: 30 });
    const step = find(pages, '/mentee/step/:id');

    expect(step).toBeTruthy();
    expect(step.views).toBe(3);
    expect(step.people).toBe(2);
    // The failure this guards: three rows of one each, which reads as three
    // barely-used screens instead of one screen two people use.
    expect(pages.filter((p) => p.page.startsWith('/mentee/step')).length).toBe(1);
  });

  it('keys a URL exactly as the client does', async () => {
    // Keep in step with client-interface/tests/page-key.test.cjs.
    const CASES = [
      ['/mentor/dashboard', '/mentor/dashboard'],
      ['/w/dev-weekends/mentor/dashboard', '/mentor/dashboard'],
      ['/w/dev-weekends/mentee/step/ab22ddfd-bee0-479f-bf7f-b48743c9f0b5', '/mentee/step/:id'],
      ['/admin/cohorts/744918d2-d158-4333-84b8-a5c5e25e3e74', '/admin/cohorts/:id'],
      ['/mentor/review?clanId=399a805a-5f2a-431f-9f69-8bc6601b208f', '/mentor/review'],
      ['/admin/clans/', '/admin/clans'],
    ];

    for (const [input] of CASES) await view(alice.id, input);
    const pages = await featureUsageService.pageUsage({ organizationId, days: 30 });
    const keys = pages.map((p) => p.page).sort();

    expect(keys).toEqual([...new Set(CASES.map(([, expected]) => expected))].sort());
  });

  it('counts people, not visits', async () => {
    // One person refreshing beats nobody; it must not beat four people.
    for (let i = 0; i < 9; i++) await view(alice.id, '/mentee/dashboard');
    await view(alice.id, '/mentee/library');
    await view(bob.id, '/mentee/library');
    await view(mentor.id, '/mentee/library');

    const pages = await featureUsageService.pageUsage({ organizationId, days: 30 });

    expect(find(pages, '/mentee/dashboard').views).toBe(9);
    expect(find(pages, '/mentee/dashboard').people).toBe(1);
    expect(find(pages, '/mentee/library').people).toBe(3);
    // Ordering is the recommendation: library is used by more people.
    expect(pages[0].page).toBe('/mentee/library');
  });

  it('leaves out what happened before the window', async () => {
    await view(alice.id, '/mentee/dashboard', daysAgo(2));
    await view(bob.id, '/mentee/certificates', daysAgo(45));

    const recent = await featureUsageService.pageUsage({ organizationId, days: 7 });
    expect(recent.map((p) => p.page)).toEqual(['/mentee/dashboard']);

    const wider = await featureUsageService.pageUsage({ organizationId, days: 90 });
    expect(wider.map((p) => p.page).sort()).toEqual(['/mentee/certificates', '/mentee/dashboard']);
  });

  it('gives the denominator as well as the count', async () => {
    await view(alice.id, '/mentee/dashboard');

    const { activeByRole, eligibleByRole } = await featureUsageService.overview({ organizationId, days: 30 });

    // One of two mentees was seen; without the second number "1" says nothing.
    expect(activeByRole.mentee).toBe(1);
    expect(eligibleByRole.mentee).toBe(2);
    expect(activeByRole.mentor).toBeUndefined();
    expect(eligibleByRole.mentor).toBe(1);
  });

  it('says how far back the record goes, so the report cannot overclaim', async () => {
    await view(alice.id, '/mentee/dashboard', daysAgo(3));

    const { trackingSince } = await featureUsageService.overview({ organizationId, days: 90 });

    expect(trackingSince).toBeTruthy();
    const age = (Date.now() - new Date(trackingSince).getTime()) / 86400000;
    expect(age).toBeGreaterThan(2.5);
    expect(age).toBeLessThan(3.5);
  });

  it('admits when the window reaches back further than the record does', async () => {
    await view(alice.id, '/mentee/dashboard', daysAgo(3));

    // Three days of record cannot answer a thirty-day question honestly.
    const short = await featureUsageService.overview({ organizationId, days: 90 });
    expect(short.coversFullWindow).toBe(false);

    const covered = await featureUsageService.overview({ organizationId, days: 2 });
    expect(covered.coversFullWindow).toBe(true);
  });

  it('is empty, not broken, when nothing has been recorded', async () => {
    const data = await featureUsageService.overview({ organizationId, days: 30 });

    expect(data.pages).toEqual([]);
    expect(data.daily).toEqual([]);
    expect(data.trackingSince).toBeNull();
    expect(data.coversFullWindow).toBe(false);
    expect(data.eligibleByRole.mentee).toBe(2);
  });

  afterAll(async () => { await sequelize.close(); });
});
