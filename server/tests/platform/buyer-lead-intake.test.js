'use strict';

/**
 * The marketing site's "tell us about your program" form, end to end into the
 * operator inbox.
 *
 * A submission said "Your request reached the Pathment team." and no lead
 * appeared in the platform console. Everything between the form and the
 * database is a chain of accept-and-drop branches designed to waste a bot's
 * time, and every one of them answers a real person with a success screen too:
 *
 *   - the marketing route returns `{ ok: true }` when the honeypot is filled;
 *   - this endpoint returns 202 when the honeypot is filled;
 *   - this endpoint returns 202 when the form was submitted within 2 seconds
 *     of being rendered.
 *
 * None of them left a trace anywhere, so a lost customer and a blocked bot
 * looked identical from both ends. These pin the happy path - the exact
 * payload `pathment-marketing/app/api/buyer-interest/route.ts` forwards - and
 * then pin each drop, so the silence is at least deliberate and recorded.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createAdmin } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');

const tokenFor = (user) => generateAccessToken({ id: user.id, email: user.email, role: user.role });

/**
 * Exactly what the marketing route sends.
 *
 * It spreads the validated lead and then overrides `website` and `startedAt`
 * with `undefined`, which JSON.stringify drops - so neither key is on the
 * wire. It also adds `id`, `type` and `createdAt`, which the Joi schema does
 * not declare: they are stripped rather than rejected (`stripUnknown: true`),
 * and if that ever changed the webhook would start failing with a 400 that
 * only the marketing logs would show.
 */
const marketingPayload = (overrides = {}) => ({
  id: '0f0b6a18-6a1a-4e5c-9e4c-9a1f9a5b1c2d',
  type: 'buyer_interest',
  createdAt: new Date().toISOString(),
  email: 'ops@acme-fellowship.com',
  fullName: 'Dana Ops',
  organizationName: 'Acme Fellowship',
  organizationSize: '11-50',
  participants: '40',
  programType: 'Fellowship',
  launchTimeframe: 'This quarter',
  planInterest: 'Growth',
  message: 'We run two cohorts a year and need proof of outcomes.',
  ...overrides,
});

const post = (body) => request(app).post('/api/platform/leads').send(body);

describe('buyer lead intake', () => {
  beforeEach(async () => {
    await cleanDb();
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it('stores the exact payload the marketing site forwards', async () => {
    const res = await post(marketingPayload());
    expect(res.status).toBe(202);

    const leads = await models.BuyerLead.findAll({ skipOrganizationScope: true });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      email: 'ops@acme-fellowship.com',
      fullName: 'Dana Ops',
      organizationName: 'Acme Fellowship',
      status: 'new',
      source: 'marketing',
    });
  });

  it('keeps the detail an operator needs to answer the enquiry', async () => {
    await post(marketingPayload());
    const lead = await models.BuyerLead.findOne({ skipOrganizationScope: true });
    expect(lead).toMatchObject({
      organizationSize: '11-50',
      participants: '40',
      programType: 'Fellowship',
      launchTimeframe: 'This quarter',
      planInterest: 'Growth',
    });
  });

  /**
   * The keys the marketing route adds are not in the schema. They are dropped,
   * not refused - if that ever flipped, every submission would 400 and the
   * only sign would be a 503 on the marketing side.
   */
  it('ignores the envelope fields rather than refusing the whole request', async () => {
    const res = await post(marketingPayload({ id: 'not-a-uuid', type: 'something-else' }));
    expect(res.status).toBe(202);
    expect(await models.BuyerLead.count({ skipOrganizationScope: true })).toBe(1);
  });

  it('shows the lead to a platform admin', async () => {
    await post(marketingPayload());

    const operator = await createAdmin({ email: `operator-${Date.now()}@pathment-test.com` });
    await models.PlatformAdmin.create({ userId: operator.id, role: 'owner' });

    const res = await request(app)
      .get('/api/platform/leads')
      .set('Authorization', `Bearer ${tokenFor(operator)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.leads[0].organizationName).toBe('Acme Fellowship');
    // The console's pipeline chips read this; an empty map reads as zero.
    expect(res.body.data.countsByStatus).toMatchObject({ new: 1 });
  });

  it('keeps the inbox out of reach of anybody who is not a platform admin', async () => {
    const workspaceAdmin = await createAdmin({ email: `ws-${Date.now()}@test.com` });
    const res = await request(app)
      .get('/api/platform/leads')
      .set('Authorization', `Bearer ${tokenFor(workspaceAdmin)}`);
    expect(res.status).toBe(403);
  });

  // ── the accept-and-drop branches ─────────────────────────────────────────

  /**
   * A filled honeypot is dropped, and the caller is told it worked. That is
   * the point: a bot that is told it failed tries something else. The cost is
   * that a browser autofilling a hidden field named "website" makes a real
   * person's enquiry vanish behind a success screen, so the drop is logged.
   */
  it('drops a honeypot submission without saying so', async () => {
    const res = await post(marketingPayload({ website: 'http://spam.example' }));
    expect(res.status).toBe(202);
    expect(await models.BuyerLead.count({ skipOrganizationScope: true })).toBe(0);
  });

  it('drops a submission made within two seconds of the form rendering', async () => {
    const res = await post(marketingPayload({ startedAt: Date.now() }));
    expect(res.status).toBe(202);
    expect(await models.BuyerLead.count({ skipOrganizationScope: true })).toBe(0);
  });

  it('keeps a submission from somebody who took their time', async () => {
    const res = await post(marketingPayload({ startedAt: Date.now() - 30_000 }));
    expect(res.status).toBe(202);
    expect(await models.BuyerLead.count({ skipOrganizationScope: true })).toBe(1);
  });

  it('still refuses a request with nothing to answer', async () => {
    const res = await post({ email: 'nobody@acme-fellowship.com' });
    expect(res.status).toBe(400);
    expect(await models.BuyerLead.count({ skipOrganizationScope: true })).toBe(0);
  });
});
