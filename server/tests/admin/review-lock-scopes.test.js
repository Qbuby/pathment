'use strict';

/**
 * The cohort-review deletion lock has a scope.
 *
 * It was one boolean for the whole organisation, so an admin protecting the
 * records of a programme that had just closed had to freeze deletion for
 * every mentor in every clan, including the ones mid-cohort. Deletion is now
 * locked for a session when the org flag is on, OR its clan is locked, OR its
 * clan's programme is locked — and a grant lifts it only where the grant
 * applies.
 *
 * The org-wide flag is deliberately untouched by all of this: it still lives
 * in `system_settings` and still means what it meant, so every workspace
 * keeps the lock it had.
 */

const { models, sequelize } = require('../../src/db');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const lock = require('../../src/services/cohortReviewLockService');
const clans = require('../../src/services/clanService');
const { cleanDb, createAdmin, createMentor, createProgram } = require('../helpers/seed');

describe('scoped review locks', () => {
  let organization, admin, mentor, alpha, beta, alphaClan, betaClan;
  const within = (fn) => runWithRequestContext({ organizationId: organization.id, workspaceJob: true }, fn);

  beforeEach(async () => {
    await cleanDb();
    organization = await models.Organization.findOne({
      where: { slug: process.env.TENANT_SLUG || 'devweekends' },
    });
    await within(async () => {
      admin = await createAdmin({ email: 'admin-locks@test.com' });
      mentor = await createMentor({ email: 'mentor-locks@test.com' });
      alpha = await createProgram({ createdBy: admin.id, name: 'Alpha' });
      beta = await createProgram({ createdBy: admin.id, name: 'Beta' });
      alphaClan = await clans.createClan({ programId: alpha.id, name: 'Alpha clan', leadMentorId: mentor.id }, admin.id);
      betaClan = await clans.createClan({ programId: beta.id, name: 'Beta clan', leadMentorId: mentor.id }, admin.id);
      await lock.setDeleteLock(false, admin.id);
    });
  });
  afterAll(() => sequelize.close());

  describe('resolving a lock', () => {
    it('locks nothing when nothing is locked', () => within(async () => {
      await expect(lock.isDeleteLockedFor(alphaClan.id)).resolves.toMatchObject({ locked: false });
      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).resolves.toBeUndefined();
    }));

    it('locks one clan without touching the clan next door', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: true }, admin.id);

      expect(await lock.isDeleteLockedFor(alphaClan.id)).toMatchObject({ locked: true, by: 'clan' });
      expect(await lock.isDeleteLockedFor(betaClan.id)).toMatchObject({ locked: false });
      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).rejects.toThrow(/locked for this clan/i);
      await expect(lock.assertCanDelete(mentor.id, betaClan.id)).resolves.toBeUndefined();
    }));

    it('locks every clan of a locked programme', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'program', scopeId: alpha.id, locked: true }, admin.id);

      expect(await lock.isDeleteLockedFor(alphaClan.id)).toMatchObject({ locked: true, by: 'program' });
      expect(await lock.isDeleteLockedFor(betaClan.id)).toMatchObject({ locked: false });
    }));

    it('still answers for the whole organisation, as it always did', () => within(async () => {
      await lock.setDeleteLock(true, admin.id);

      expect(await lock.isDeleteLockedFor(alphaClan.id)).toMatchObject({ locked: true, by: 'organization' });
      expect(await lock.isDeleteLockedFor(betaClan.id)).toMatchObject({ locked: true, by: 'organization' });
      // And with no clan named at all — the question callers asked before scopes.
      expect(await lock.isDeleteLockedFor(null)).toMatchObject({ locked: true });
    }));

    it('treats locking the same scope twice as the same state', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: true }, admin.id);
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: true }, admin.id);

      expect(await models.CohortReviewLock.count()).toBe(1);
    }));

    it('unlocks by removing the row', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: true }, admin.id);
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: false }, admin.id);

      expect(await models.CohortReviewLock.count()).toBe(0);
      expect(await lock.isDeleteLockedFor(alphaClan.id)).toMatchObject({ locked: false });
    }));

    it('refuses a scope that is neither a programme nor a clan', () => within(async () => {
      await expect(lock.setScopeLock({ scopeType: 'everything', scopeId: alpha.id, locked: true }, admin.id))
        .rejects.toThrow(/programme or a clan/i);
      await expect(lock.setScopeLock({ scopeType: 'clan', scopeId: null, locked: true }, admin.id))
        .rejects.toThrow(/Choose which/i);
    }));
  });

  describe('a grant lifts the lock only where it applies', () => {
    const grantFor = (scopeType, scopeId) => models.CohortReviewUnlockGrant.create({
      mentorId: mentor.id, grantedBy: admin.id, scopeType, scopeId,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    it('a clan grant covers that clan and no other', () => within(async () => {
      await lock.setDeleteLock(true, admin.id);
      await grantFor('clan', alphaClan.id);

      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).resolves.toBeUndefined();
      await expect(lock.assertCanDelete(mentor.id, betaClan.id)).rejects.toThrow(/locked/i);
    }));

    it('a programme grant covers the clans inside it', () => within(async () => {
      await lock.setDeleteLock(true, admin.id);
      await grantFor('program', alpha.id);

      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).resolves.toBeUndefined();
      await expect(lock.assertCanDelete(mentor.id, betaClan.id)).rejects.toThrow(/locked/i);
    }));

    /**
     * Every grant written before scopes existed has `scope_type` NULL, and
     * that is exactly what org-wide meant. None of them changed meaning.
     */
    it('a grant with no scope is org-wide, as it always was', () => within(async () => {
      await lock.setDeleteLock(true, admin.id);
      await grantFor(null, null);

      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).resolves.toBeUndefined();
      await expect(lock.assertCanDelete(mentor.id, betaClan.id)).resolves.toBeUndefined();
      await expect(lock.assertCanDelete(mentor.id, null)).resolves.toBeUndefined();
    }));

    it('an expired or revoked grant lifts nothing', () => within(async () => {
      await lock.setDeleteLock(true, admin.id);
      const expired = await models.CohortReviewUnlockGrant.create({
        mentorId: mentor.id, grantedBy: admin.id, expiresAt: new Date(Date.now() - 1000),
      });
      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).rejects.toThrow(/locked/i);
      await expired.destroy();

      const revoked = await grantFor(null, null);
      await revoked.update({ revokedAt: new Date() });
      await expect(lock.assertCanDelete(mentor.id, alphaClan.id)).rejects.toThrow(/locked/i);
    }));
  });

  describe('what the admin screen reads', () => {
    it('lists the locked scopes with their names, and what could be locked', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'clan', scopeId: alphaClan.id, locked: true }, admin.id);
      await lock.setScopeLock({ scopeType: 'program', scopeId: beta.id, locked: true }, admin.id);

      const overview = await lock.lockOverview();

      expect(overview.locked).toBe(false);
      expect(overview.scopes.map((s) => `${s.scopeType}:${s.name}`).sort())
        .toEqual(['clan:Alpha clan', 'program:Beta']);
      expect(overview.choices.programs.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);
      expect(overview.choices.clans.map((c) => c.name).sort()).toEqual(['Alpha clan', 'Beta clan']);
    }));

    it('tells a mentor why their clan is locked', () => within(async () => {
      await lock.setScopeLock({ scopeType: 'program', scopeId: alpha.id, locked: true }, admin.id);

      const state = await lock.getLockStateForMentor(mentor.id, alphaClan.id);

      expect(state).toMatchObject({ locked: true, lockedBy: 'program', hasActiveGrant: false });
      expect(await lock.getLockStateForMentor(mentor.id, betaClan.id)).toMatchObject({ locked: false });
    }));
  });
});
