'use strict';

/**
 * A workspace owner is not always an "admin" account.
 *
 * `GET /api/programs` decided who may see unpublished or private programmes by
 * reading `req.user.role` — the role the ACCOUNT signed up as. Whoever creates a
 * workspace is given an `owner` membership whatever that account is, so on
 * production the owner of Dev Weekends had `users.role = 'mentor'` and was
 * treated as a member of the public by their own admin Programs screen: the
 * query was rewritten to `status = 'published' AND visibility = 'public'`.
 *
 * It looked like nothing until the last programme stopped matching. Marking
 * "Full Stack AI Engineering" completed emptied the page — "No programs yet" on
 * a workspace with two programmes — and changing the status filter did nothing,
 * because that branch overwrites the requested status rather than narrowing it.
 *
 * The route is `optionalAuth`, which did not attach `req.loadWorkspaceRole()` —
 * the resolver the four write endpoints on this controller already used. That
 * asymmetry is the whole bug.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const {
  cleanDb, createAdmin, createMentor, createProgram, authHeader,
} = require('../helpers/seed');

describe('who may list unpublished programmes', () => {
  let admin, owner, organization;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'prog-admin@test.com' });
    // The production shape: account role 'mentor', workspace role 'owner'.
    owner = await createMentor({ email: 'prog-owner@test.com' });
    organization = await models.Organization.findOne({
      where: { slug: process.env.TENANT_SLUG || 'devweekends' },
    });
    // Everyone is seeded with a `member` membership, so promote rather than
    // create — exactly what `organizationService.create` does for whoever makes
    // the workspace, whatever their account role happens to be.
    await runWithRequestContext({ organizationId: organization.id }, () =>
      models.OrganizationMembership.update(
        { role: 'owner' },
        { where: { organizationId: organization.id, userId: owner.id } },
      ));

    // Exactly what the workspace held when the page went blank.
    await createProgram({ createdBy: admin.id, name: 'Full Stack AI Engineering', status: 'completed' });
    const privateProgram = await createProgram({ createdBy: admin.id, name: 'Mobile Product Launch Fellowship', status: 'published' });
    await privateProgram.update({ visibility: 'private' });
  });

  const list = (user, query = '') => request(app)
    .get(`/api/programs${query}`)
    .set('Authorization', authHeader(user))
    .set('x-pathment-workspace', organization.slug);

  const names = (res) => (res.body.data || []).map((p) => p.name).sort();

  it('shows a completed programme to the workspace owner', async () => {
    const res = await list(owner);
    expect(res.status).toBe(200);
    expect(names(res)).toContain('Full Stack AI Engineering');
  });

  it('shows a private programme to the workspace owner', async () => {
    const res = await list(owner);
    expect(names(res)).toContain('Mobile Product Launch Fellowship');
  });

  it('still shows everything to an admin-role account', async () => {
    const res = await list(admin);
    expect(names(res)).toEqual(['Full Stack AI Engineering', 'Mobile Product Launch Fellowship']);
  });

  /**
   * The symptom the user reported second: the filter appeared dead. It was not
   * being ignored — the unprivileged branch was overwriting it.
   */
  it('honours an explicit status filter for the owner', async () => {
    const res = await list(owner, '?status=completed');
    expect(names(res)).toEqual(['Full Stack AI Engineering']);
  });

  it('still hides unpublished and private programmes from everyone else', async () => {
    // Seeded as a plain member, which is what they stay.
    const stranger = await createMentor({ email: 'prog-stranger@test.com' });
    const res = await list(stranger);
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([]);
  });
});
