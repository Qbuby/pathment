'use strict';

/**
 * The platform console - operator identity, provisioning, overrides, billing
 * and lifecycle, end to end over HTTP.
 *
 * The console is the one surface that crosses the tenant boundary on purpose,
 * so the suite runs with MULTI_TENANT_WORKSPACES_ENABLED=true: any query that
 * forgot its explicit scope handling would throw, not silently widen.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { createAdmin, createMentee, cleanDb } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');

beforeAll(() => { process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true'; });
afterAll(() => { delete process.env.MULTI_TENANT_WORKSPACES_ENABLED; });

const tokenFor = (user) => generateAccessToken({ id: user.id, email: user.email, role: user.role });
const authed = (token) => ({ Authorization: `Bearer ${token}` });

describe('platform console', () => {
  let operator;      // platform owner via DB grant
  let billingOnly;   // platform billing tier
  let readonly;      // platform readonly tier
  let tenantAdmin;   // workspace super_admin, NOT a platform admin
  let tokens;

  beforeEach(async () => {
    await cleanDb();
    delete process.env.PLATFORM_ADMIN_EMAILS;
    operator = await createAdmin({ email: `operator-${Date.now()}@pathment-test.com` });
    billingOnly = await createAdmin({ email: `billing-${Date.now()}@pathment-test.com` });
    readonly = await createAdmin({ email: `readonly-${Date.now()}@pathment-test.com` });
    tenantAdmin = await createAdmin({ email: `tenant-${Date.now()}@pathment-test.com` });
    await models.PlatformAdmin.bulkCreate([
      { userId: operator.id, role: 'owner' },
      { userId: billingOnly.id, role: 'billing' },
      { userId: readonly.id, role: 'readonly' },
    ]);
    tokens = {
      operator: tokenFor(operator),
      billing: tokenFor(billingOnly),
      readonly: tokenFor(readonly),
      tenant: tokenFor(tenantAdmin),
    };
  });

  describe('gating', () => {
    it('denies every workspace role, however powerful, and reports /me honestly', async () => {
      const denied = await request(app).get('/api/platform/organizations').set(authed(tokens.tenant));
      expect(denied.status).toBe(403);

      const me = await request(app).get('/api/platform/me').set(authed(tokens.tenant));
      expect(me.status).toBe(200);
      expect(me.body.data.isPlatformAdmin).toBe(false);

      const operatorMe = await request(app).get('/api/platform/me').set(authed(tokens.operator));
      expect(operatorMe.body.data).toMatchObject({ isPlatformAdmin: true, role: 'owner', via: 'grant' });
      expect(operatorMe.body.data.gates).toEqual(expect.arrayContaining(['read', 'billing', 'lifecycle', 'owner']));
    });

    it('honours PLATFORM_ADMIN_EMAILS as a bootstrap owner list', async () => {
      process.env.PLATFORM_ADMIN_EMAILS = tenantAdmin.email;
      const response = await request(app).get('/api/platform/me').set(authed(tokens.tenant));
      expect(response.body.data).toMatchObject({ isPlatformAdmin: true, role: 'owner', via: 'env' });
      delete process.env.PLATFORM_ADMIN_EMAILS;
    });

    it('readonly reads the directory but cannot provision; billing can', async () => {
      const read = await request(app).get('/api/platform/organizations').set(authed(tokens.readonly));
      expect(read.status).toBe(200);

      const payload = {
        name: 'Gated Org', slug: `gated-${Date.now()}`, timezone: 'UTC', planKey: 'starter',
        owner: { email: `gated-owner-${Date.now()}@test.com`, firstName: 'Gate', lastName: 'Keeper' },
      };
      const refused = await request(app).post('/api/platform/organizations').set(authed(tokens.readonly)).send(payload);
      expect(refused.status).toBe(403);

      const allowed = await request(app).post('/api/platform/organizations').set(authed(tokens.billing)).send(payload);
      expect(allowed.status).toBe(201);
    });
  });

  describe('provisioning and owner activation', () => {
    const provision = (overrides = {}) => request(app)
      .post('/api/platform/organizations')
      .set(authed(tokens.operator))
      .send({
        name: 'Acme Fellowship', slug: `acme-${Date.now()}`, timezone: 'Asia/Karachi',
        planKey: 'growth', billingInterval: 'annual', trialDays: 14,
        owner: { email: `founder-${Date.now()}@acme-test.com`, firstName: 'Fou', lastName: 'Nder' },
        reason: 'test deal',
        ...overrides,
      });

    it('creates the workspace with the CHOSEN plan, a trialing subscription and an invited owner', async () => {
      const response = await provision();
      expect(response.status).toBe(201);
      const { organization, owner, activation } = response.body.data;
      expect(activation).toBe('email_sent');
      expect(owner.account).toBe('created');
      expect(organization.status).toBe('trial');

      const subscription = await models.OrganizationSubscription.findOne({
        where: { organizationId: organization.id }, skipOrganizationScope: true,
        include: [{ model: models.Plan, as: 'plan' }],
      });
      expect(subscription.plan.key).toBe('growth');
      expect(subscription.billingInterval).toBe('annual');
      expect(subscription.status).toBe('trialing');
      expect(subscription.trialEndsAt).toBeTruthy();

      const membership = await models.OrganizationMembership.findOne({
        where: { organizationId: organization.id, userId: owner.id }, skipOrganizationScope: true,
      });
      expect(membership.role).toBe('owner');
      expect(membership.status).toBe('invited');

      const invite = await models.WorkspaceOwnerInvite.findOne({
        where: { organizationId: organization.id }, skipOrganizationScope: true,
      });
      expect(invite).toBeTruthy();

      const audit = await models.PlatformAuditLog.findOne({ where: { action: 'PLATFORM_WORKSPACE_PROVISIONED' } });
      expect(audit.targetOrganizationId).toBe(organization.id);
      expect(audit.actorId).toBe(operator.id);

      // The owner cannot sign in before activation: email unverified, password unknown.
      const ownerRow = await models.User.findOne({ where: { id: owner.id }, skipOrganizationScope: true });
      expect(ownerRow.emailVerified).toBe(false);
    });

    it('refuses a taken slug and a retired plan key', async () => {
      const first = await provision({ slug: 'collide-slug' });
      expect(first.status).toBe(201);
      const second = await provision({ slug: 'collide-slug' });
      expect(second.status).toBe(409);
      const badPlan = await provision({ planKey: 'does-not-exist' });
      expect(badPlan.status).toBe(404);
    });

    it('attaches an existing account as owner without any activation link', async () => {
      const existing = await createMentee({ email: `existing-${Date.now()}@acme-test.com` });
      const response = await provision({ owner: { email: existing.email, firstName: 'Ex', lastName: 'Isting' } });
      expect(response.status).toBe(201);
      expect(response.body.data.owner.account).toBe('existing');
      expect(response.body.data.activation).toBe('not_needed');
      const invite = await models.WorkspaceOwnerInvite.findOne({
        where: { organizationId: response.body.data.organization.id }, skipOrganizationScope: true,
      });
      expect(invite).toBeNull();
    });

    it('activation link is single-use: sets the password, verifies the inbox, then dies', async () => {
      const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
      notificationOrchestrator.sendWorkspaceOwnerActivationEmail.mockClear();
      const response = await provision();
      const [, , token] = notificationOrchestrator.sendWorkspaceOwnerActivationEmail.mock.calls[0];

      const valid = await request(app).post('/api/platform/activation/validate').send({ token });
      expect(valid.status).toBe(200);
      expect(valid.body.data.organization.slug).toBe(response.body.data.organization.slug);

      const consume = await request(app).post('/api/platform/activation/consume')
        .send({ token, password: 'owner-password-123' });
      expect(consume.status).toBe(200);

      const owner = await models.User.findOne({
        where: { id: response.body.data.owner.id }, skipOrganizationScope: true,
      });
      expect(owner.emailVerified).toBe(true);
      expect(await bcrypt.compare('owner-password-123', owner.passwordHash)).toBe(true);

      const membership = await models.OrganizationMembership.findOne({
        where: { organizationId: response.body.data.organization.id, userId: owner.id }, skipOrganizationScope: true,
      });
      expect(membership.status).toBe('active');

      const again = await request(app).post('/api/platform/activation/consume')
        .send({ token, password: 'second-try-456' });
      expect(again.status).toBe(400);
    });

    it('resending spends the outstanding link and issues exactly one live replacement', async () => {
      const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
      notificationOrchestrator.sendWorkspaceOwnerActivationEmail.mockClear();
      const response = await provision();
      const organizationId = response.body.data.organization.id;
      const [, , firstToken] = notificationOrchestrator.sendWorkspaceOwnerActivationEmail.mock.calls[0];

      const resend = await request(app)
        .post(`/api/platform/organizations/${organizationId}/activation/resend`)
        .set(authed(tokens.operator));
      expect(resend.status).toBe(200);

      const dead = await request(app).post('/api/platform/activation/validate').send({ token: firstToken });
      expect(dead.status).toBe(400);

      const live = await models.WorkspaceOwnerInvite.count({
        where: { organizationId, usedAt: null, revokedAt: null }, skipOrganizationScope: true,
      });
      expect(live).toBe(1);
    });

    it('members list keeps a soft-deleted user visible instead of returning user:null', async () => {
      const response = await provision();
      const { organization, owner } = response.body.data;

      // Soft-delete the owner's account; the membership row remains.
      const user = await models.User.findByPk(owner.id);
      await user.destroy();

      const members = await request(app)
        .get(`/api/platform/organizations/${organization.id}/members`)
        .set(authed(tokens.operator));
      expect(members.status).toBe(200);
      const row = members.body.data.members.find((m) => m.user && m.user.id === owner.id);
      expect(row).toBeTruthy();
      expect(row.user.deletedAt).toBeTruthy();
    });
  });

  describe('overrides', () => {
    let organizationId;

    beforeEach(async () => {
      const response = await request(app).post('/api/platform/organizations').set(authed(tokens.operator)).send({
        name: 'Override Org', slug: `override-${Date.now()}`, timezone: 'UTC', planKey: 'starter',
        owner: { email: `override-${Date.now()}@test.com`, firstName: 'Over', lastName: 'Ride' },
      });
      organizationId = response.body.data.organization.id;
    });

    it('sets a custom limit, prunes redundant values, and reports the arrangement', async () => {
      const response = await request(app)
        .put(`/api/platform/organizations/${organizationId}/overrides`)
        .set(authed(tokens.billing))
        .send({
          limits: { members: 3000, programs: 2 }, // programs: 2 = what starter publishes → pruned
          features: { advancedAnalytics: true },
          reason: 'enterprise side letter',
        });
      expect(response.status).toBe(200);
      const { subscription } = response.body.data;
      expect(subscription.plan.limits.members).toBe(3000);
      expect(subscription.overriddenLimits).toEqual(['members']);
      expect(subscription.overrides.limits).toEqual({ members: 3000 });
      expect(subscription.plan.features.advancedAnalytics).toBe(true);

      const report = await request(app).get('/api/platform/overrides').set(authed(tokens.readonly));
      const row = report.body.data.workspaces.find((entry) => entry.organization.id === organizationId);
      expect(row.limits).toEqual([{ key: 'members', value: 3000, planValue: 100 }]);
      expect(row.meta.reason).toBe('enterprise side letter');
    });

    it('rejects a limit key no plan publishes', async () => {
      const response = await request(app)
        .put(`/api/platform/organizations/${organizationId}/overrides`)
        .set(authed(tokens.billing))
        .send({ limits: { member: 10 }, features: {}, reason: 'typo attempt' });
      expect(response.status).toBe(400);
    });
  });

  describe('operator plan assignment', () => {
    let organizationId;

    beforeEach(async () => {
      const response = await request(app).post('/api/platform/organizations').set(authed(tokens.operator)).send({
        name: 'Assign Org', slug: `assign-${Date.now()}`, timezone: 'UTC', planKey: 'growth',
        owner: { email: `assign-${Date.now()}@test.com`, firstName: 'Ass', lastName: 'Ign' },
      });
      organizationId = response.body.data.organization.id;
    });

    it('moves the plan without any tenant request, clearing a pending one', async () => {
      const subscription = await models.OrganizationSubscription.findOne({
        where: { organizationId }, skipOrganizationScope: true,
      });
      const scale = await models.Plan.findOne({ where: { key: 'scale' } });
      await subscription.update({ requestedPlanId: scale.id, requestedAt: new Date() }, { skipOrganizationScope: true });

      const response = await request(app)
        .post(`/api/platform/organizations/${organizationId}/plan`)
        .set(authed(tokens.billing))
        .send({ planKey: 'starter', reason: 'downgrade agreed on renewal call' });
      expect(response.status).toBe(200);
      expect(response.body.data.assigned).toBe('starter');
      expect(response.body.data.subscription.requestedPlanId).toBeNull();
      expect(response.body.data.subscription.provider).toBe('platform_operator');

      const audit = await models.PlatformAuditLog.findOne({ where: { action: 'PLATFORM_PLAN_ASSIGNED' } });
      expect(audit.reason).toBe('downgrade agreed on renewal call');
    });

    it('pre-flights a downgrade below current usage and requires acknowledgement', async () => {
      // Give the workspace an ACTIVE member so usage is nonzero (the invited
      // owner does not count until activation).
      await models.OrganizationMembership.update(
        { status: 'active', joinedAt: new Date() },
        { where: { organizationId }, skipOrganizationScope: true },
      );
      // A plan that allows zero members, while the workspace already has its owner.
      await models.Plan.create({
        key: `tiny-${Date.now()}`, name: 'Tiny', monthlyPriceCents: 0, annualPriceCents: 0,
        limits: { members: 0, programs: 0, clans: 0 }, features: {}, active: true, sortOrder: 99,
      });
      const tinyKey = (await models.Plan.findOne({ order: [['createdAt', 'DESC']] })).key;

      const refused = await request(app)
        .post(`/api/platform/organizations/${organizationId}/plan`)
        .set(authed(tokens.billing))
        .send({ planKey: tinyKey, reason: 'should warn' });
      expect(refused.status).toBe(409);

      const acknowledged = await request(app)
        .post(`/api/platform/organizations/${organizationId}/plan`)
        .set(authed(tokens.billing))
        .send({ planKey: tinyKey, reason: 'accepted the squeeze', acknowledgeOverLimit: true });
      expect(acknowledged.status).toBe(200);
      expect(acknowledged.body.data.overages.length).toBeGreaterThan(0);
    });

    it('invoice activation still refuses a plan nobody requested', async () => {
      const response = await request(app)
        .post('/api/platform/billing/requests/activate')
        .set(authed(tokens.billing))
        .send({
          organizationId, planKey: 'scale', invoiceReference: 'INV-TEST-1',
          periodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      expect(response.status).toBe(409);
    });
  });

  describe('lifecycle', () => {
    it('owner suspends a workspace with a reason; billing tier cannot', async () => {
      const provisioned = await request(app).post('/api/platform/organizations').set(authed(tokens.operator)).send({
        name: 'Suspend Org', slug: `suspend-${Date.now()}`, timezone: 'UTC', planKey: 'starter',
        owner: { email: `suspend-${Date.now()}@test.com`, firstName: 'Sus', lastName: 'Pend' },
      });
      const organizationId = provisioned.body.data.organization.id;

      const refused = await request(app)
        .post(`/api/platform/organizations/${organizationId}/status`)
        .set(authed(tokens.billing))
        .send({ status: 'suspended', reason: 'not my gate' });
      expect(refused.status).toBe(403);

      const suspended = await request(app)
        .post(`/api/platform/organizations/${organizationId}/status`)
        .set(authed(tokens.operator))
        .send({ status: 'suspended', reason: 'invoice 60 days overdue' });
      expect(suspended.status).toBe(200);

      const organization = await models.Organization.findByPk(organizationId, { skipOrganizationScope: true });
      expect(organization.status).toBe('suspended');
      const audit = await models.PlatformAuditLog.findOne({ where: { action: 'PLATFORM_WORKSPACE_STATUS_CHANGED' } });
      expect(audit.reason).toBe('invoice 60 days overdue');
    });
  });

  describe('platform admin management', () => {
    it('owner grants, updates and revokes; nobody edits themselves', async () => {
      const target = await createMentee({ email: `grantee-${Date.now()}@test.com` });
      const granted = await request(app).post('/api/platform/admins').set(authed(tokens.operator))
        .send({ email: target.email, role: 'support' });
      expect(granted.status).toBe(201);
      const adminId = granted.body.data.admin.id;

      const updated = await request(app).patch(`/api/platform/admins/${adminId}`).set(authed(tokens.operator))
        .send({ role: 'billing' });
      expect(updated.body.data.admin.role).toBe('billing');

      const selfRow = await models.PlatformAdmin.findOne({ where: { userId: operator.id } });
      const selfEdit = await request(app).delete(`/api/platform/admins/${selfRow.id}`).set(authed(tokens.operator));
      expect(selfEdit.status).toBe(400);

      const revoked = await request(app).delete(`/api/platform/admins/${adminId}`).set(authed(tokens.operator));
      expect(revoked.status).toBe(200);

      const gone = await request(app).get('/api/platform/organizations')
        .set(authed(generateAccessToken({ id: target.id, email: target.email, role: target.role })));
      expect(gone.status).toBe(403);
    });
  });

  describe('app catalog', () => {
    it('owner runs full CRUD with audit; readonly can list but not write', async () => {
      const name = `Buildment-${Date.now()}`;
      const created = await request(app).post('/api/platform/apps').set(authed(tokens.operator))
        .send({ name, type: 'developer', description: 'Project delivery', integrationKey: 'buildment' });
      expect(created.status).toBe(201);
      const appId = created.body.data.app.id;
      expect(created.body.data.app.connections).toBe(0);

      // One integration key, one app.
      const duplicate = await request(app).post('/api/platform/apps').set(authed(tokens.operator))
        .send({ name: `Other-${Date.now()}`, type: 'developer', integrationKey: 'buildment' });
      expect(duplicate.status).toBe(409);

      const listed = await request(app).get('/api/platform/apps').set(authed(tokens.readonly));
      expect(listed.status).toBe(200);
      const row = listed.body.data.apps.find((item) => item.id === appId);
      expect(row).toMatchObject({ name, integrationKey: 'buildment', isActive: true, connections: 0 });
      expect(listed.body.data.integrations.find((i) => i.key === 'buildment').usedBy).toBe(name);

      const refusedWrite = await request(app).post('/api/platform/apps').set(authed(tokens.readonly))
        .send({ name: `Nope-${Date.now()}`, type: 'other' });
      expect(refusedWrite.status).toBe(403);

      const deactivated = await request(app).patch(`/api/platform/apps/${appId}`).set(authed(tokens.operator))
        .send({ isActive: false });
      expect(deactivated.body.data.app.isActive).toBe(false);

      const removed = await request(app).delete(`/api/platform/apps/${appId}`).set(authed(tokens.operator));
      expect(removed.status).toBe(200);

      const audited = await models.PlatformAuditLog.findAll({
        where: { targetType: 'ExternalApp' }, skipOrganizationScope: true, order: [['createdAt', 'ASC']],
      });
      expect(audited.map((entry) => entry.action)).toEqual(
        expect.arrayContaining(['PLATFORM_APP_CREATED', 'PLATFORM_APP_UPDATED', 'PLATFORM_APP_DELETED']),
      );
    });
  });

  describe('leads', () => {
    it('accepts a public lead, drops honeypots silently, and tracks the pipeline', async () => {
      const accepted = await request(app).post('/api/platform/leads').send({
        email: 'buyer@corp-test.com', fullName: 'Big Buyer', organizationName: 'Corp Co',
        planInterest: 'Growth', startedAt: Date.now() - 10_000,
      });
      expect(accepted.status).toBe(202);

      const bot = await request(app).post('/api/platform/leads').send({
        email: 'bot@spam-test.com', fullName: 'Spam Bot', organizationName: 'Spam Inc',
        website: 'http://spam.example',
      });
      expect(bot.status).toBe(202);

      expect(await models.BuyerLead.count()).toBe(1);

      const list = await request(app).get('/api/platform/leads').set(authed(tokens.readonly));
      expect(list.body.data.leads).toHaveLength(1);

      const lead = list.body.data.leads[0];
      const updated = await request(app).patch(`/api/platform/leads/${lead.id}`).set(authed(tokens.operator))
        .send({ status: 'contacted', notes: 'emailed back' });
      expect(updated.body.data.lead.status).toBe('contacted');
    });
  });

  describe('account support', () => {
    it('force sign-out revokes refresh tokens; account suspension refuses platform admins', async () => {
      const victim = await createMentee({ email: `victim-${Date.now()}@test.com` });
      await models.RefreshToken.create({
        userId: victim.id, token: `tok-${Date.now()}`, expiresAt: new Date(Date.now() + 86400000),
      });

      const signedOut = await request(app)
        .post(`/api/platform/users/${victim.id}/sign-out`)
        .set(authed(tokens.operator))
        .send({ reason: 'support ticket 42' });
      expect(signedOut.status).toBe(200);
      expect(signedOut.body.data.revokedTokens).toBe(1);

      const protectedAdmin = await request(app)
        .post(`/api/platform/users/${billingOnly.id}/status`)
        .set(authed(tokens.operator))
        .send({ status: 'suspended', reason: 'should refuse' });
      expect(protectedAdmin.status).toBe(400);

      const suspended = await request(app)
        .post(`/api/platform/users/${victim.id}/status`)
        .set(authed(tokens.operator))
        .send({ status: 'suspended', reason: 'abuse report upheld' });
      expect(suspended.status).toBe(200);
      const row = await models.User.findByPk(victim.id, { skipOrganizationScope: true });
      expect(row.status).toBe('suspended');
    });
  });
});
