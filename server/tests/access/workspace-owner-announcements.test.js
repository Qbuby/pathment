'use strict';

/**
 * The route said yes and the service said no.
 *
 * `POST /api/announcements` is guarded by `requirePermission(ANNOUNCEMENT_POST,
 * scope.announcementBody())` — scoped RBAC, which correctly admits a workspace
 * owner announcing org-wide. `announcementService.create` then re-checked the
 * same question against `user.capabilities`, falling back to `user.role`, and
 * both are legacy: `authzService.getAssignments` states outright that elevated
 * access comes from RoleAssignments and memberships, "NOT the stored
 * `capabilities` array".
 *
 * So the owner of Dev Weekends — whose account signed up as a mentor — passed
 * the real guard and was then refused by the legacy one with "Mentors can only
 * announce to a clan they lead", from the admin portal, with the audience
 * picker in front of them set to All mentors.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const { cleanDb, createAdmin, createMentor, authHeader } = require('../helpers/seed');

describe('who may post an announcement', () => {
  let admin, owner, mentor, organization;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'ann-admin@test.com' });
    owner = await createMentor({ email: 'ann-owner@test.com' });
    mentor = await createMentor({ email: 'ann-mentor@test.com' });
    organization = await models.Organization.findOne({
      where: { slug: process.env.TENANT_SLUG || 'devweekends' },
    });
    // Promote, don't create: everyone is seeded with a `member` membership, and
    // `organizationService.create` promotes whoever makes the workspace to
    // `owner` whatever their account role is.
    await runWithRequestContext({ organizationId: organization.id }, () =>
      models.OrganizationMembership.update(
        { role: 'owner' },
        { where: { organizationId: organization.id, userId: owner.id } },
      ));
  });

  const post = (user, body) => request(app)
    .post('/api/announcements')
    .set('Authorization', authHeader(user))
    .set('x-pathment-workspace', organization.slug)
    .send(body);

  const ALL_MENTORS = { title: 'Mentorship is closed.', body: 'Mentors can ask for a standing clan.', audience: 'mentors' };

  it('lets the workspace owner announce to all mentors', async () => {
    const res = await post(owner, ALL_MENTORS);
    expect(res.status).toBe(201);
  });

  it('lets the workspace owner announce to everyone', async () => {
    const res = await post(owner, { ...ALL_MENTORS, audience: 'all' });
    expect(res.status).toBe(201);
  });

  it('still lets an admin-role account announce to all mentors', async () => {
    const res = await post(admin, ALL_MENTORS);
    expect(res.status).toBe(201);
  });

  /**
   * The restriction itself is not the bug and must survive: an ordinary mentor
   * still cannot broadcast to the whole workspace.
   */
  it('still refuses an ordinary mentor broadcasting to all mentors', async () => {
    const res = await post(mentor, ALL_MENTORS);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
