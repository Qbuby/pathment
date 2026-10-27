'use strict';

/**
 * One rule, every admin surface: you see the programmes you administer.
 *
 * The permission layer had this right from the start. What kept leaking was
 * the reads, and each leaked the same way — an `actsAsAdmin` check with no
 * follow-up question. "Is this an admin?" returns true for somebody granted
 * one fellowship, and the branch behind it then returned the whole
 * workspace: every certificate template, every clan broadcast, every review
 * session, everyone in the directory.
 *
 * These lock the bound at each read a programme admin actually opens. The
 * fixture is the real one from production: a draft programme with nothing in
 * it, granted to an account whose own role is `mentor`, who is separately a
 * member of clans in a programme they do NOT administer. That second part is
 * the trap — they have legitimate memberships elsewhere, and the admin
 * surface must not show them.
 */

const { models } = require('../../src/db');
const authzService = require('../../src/services/authzService');
const announcementService = require('../../src/services/announcementService');
const certificateService = require('../../src/services/certificateService');
const reviewRecordsService = require('../../src/services/reviewRecordsService');
const clanService = require('../../src/services/clanService');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

describe('what a programme-scoped admin can read', () => {
  let orgAdmin, scoped, mentee, mine, theirs, myClan, theirClan;

  beforeEach(async () => {
    await cleanDb();
    orgAdmin = await createAdmin({ email: 'org@test.com' });
    scoped = await createMentor({ email: 'scoped@test.com' });
    mentee = await createMentee({ email: 'learner@test.com' });

    mine = await createProgram({ createdBy: orgAdmin.id, name: 'Qantara' });
    theirs = await createProgram({ createdBy: orgAdmin.id, name: 'Full Stack' });

    myClan = await models.Clan.create({
      programId: mine.id, name: 'Mine', leadMentorId: scoped.id, createdBy: orgAdmin.id,
    });
    theirClan = await models.Clan.create({
      programId: theirs.id, name: 'Theirs', leadMentorId: orgAdmin.id, createdBy: orgAdmin.id,
    });
    // The trap: a real membership in the programme they do NOT administer.
    await clanService.addMember(theirClan.id, { userId: scoped.id, role: 'lead_mentor' });
    await clanService.addMember(theirClan.id, { userId: mentee.id, role: 'mentee' });

    await models.RoleAssignment.create({
      userId: scoped.id, role: 'program_admin', scopeType: 'program', scopeId: mine.id,
    });
  });

  const asScoped = (fn) => runWithRequestContext(
    { organizationId: myClan.organizationId, userId: scoped.id, portalRole: 'admin' }, fn,
  );

  it('resolves the grant to exactly one programme', async () => {
    await expect(authzService.adminProgramScope(scoped)).resolves.toEqual([mine.id]);
  });

  describe('certificate templates', () => {
    beforeEach(async () => {
      for (const [program, name] of [[mine, 'Qantara cert'], [theirs, 'Full Stack cert']]) {
        await models.CertificateTemplate.create({
          programId: program.id, name, status: 'active', createdBy: orgAdmin.id,
          config: {}, organizationId: myClan.organizationId,
        }, { validate: false });
      }
    });

    it('shows only the programme they administer', () => asScoped(async () => {
      const rows = await certificateService.listTemplates(null, scoped);
      expect(rows.map((r) => r.name)).toEqual(['Qantara cert']);
    }));

    it('still shows an org admin both', () => runWithRequestContext(
      { organizationId: myClan.organizationId, userId: orgAdmin.id, portalRole: 'admin' },
      async () => {
        const rows = await certificateService.listTemplates(null, orgAdmin);
        expect(rows).toHaveLength(2);
      },
    ));
  });

  describe('announcements', () => {
    beforeEach(async () => {
      await models.Announcement.create({
        title: 'Theirs', body: 'x', audience: 'clan', audienceId: theirClan.id, authorId: orgAdmin.id,
      }, { validate: false });
      await models.Announcement.create({
        title: 'Mine', body: 'x', audience: 'clan', audienceId: myClan.id, authorId: orgAdmin.id,
      }, { validate: false });
      await models.Announcement.create({
        title: 'Everyone', body: 'x', audience: 'all', audienceId: null, authorId: orgAdmin.id,
      }, { validate: false });
    });

    /**
     * Org-wide stays. "Everyone" reached this programme's people too, so
     * hiding it would misreport what their own members have been told.
     */
    it('hides another programme’s clan broadcast, keeps the org-wide one', () => asScoped(async () => {
      const { items } = await announcementService.list(scoped, { portalRole: 'admin' });
      const titles = items.map((a) => a.title);
      expect(titles).toContain('Mine');
      expect(titles).toContain('Everyone');
      expect(titles).not.toContain('Theirs');
    }));
  });

  describe('review records', () => {
    beforeEach(async () => {
      for (const clan of [myClan, theirClan]) {
        await models.CohortReviewSession.create({
          clanId: clan.id, mentorId: orgAdmin.id, sessionDate: '2026-10-01',
        }, { validate: false });
      }
    });

    it('counts only their own programme’s sessions', () => asScoped(async () => {
      const data = await reviewRecordsService.orgReviewRecords({ programScope: [mine.id] });
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].clanId).toBe(myClan.id);
    }));

    it('cannot widen itself by asking for another programme', () => asScoped(async () => {
      const data = await reviewRecordsService.orgReviewRecords({
        programId: theirs.id, programScope: [mine.id],
      });
      expect(data.sessions).toHaveLength(0);
    }));

    it('leaves an org admin unbounded', () => asScoped(async () => {
      const data = await reviewRecordsService.orgReviewRecords({ programScope: null });
      expect(data.sessions).toHaveLength(2);
    }));
  });

  describe('community spaces', () => {
    const spaceService = require('../../src/services/communitySpaceService');

    it('shows only what they administer in the ADMIN portal', () => asScoped(async () => {
      const spaces = await spaceService.listSpaces(scoped, { portalRole: 'admin' });
      const clanSpaces = spaces.filter((s) => s.type === 'clan').map((s) => s.id);
      expect(clanSpaces).toContain(myClan.id);
      expect(clanSpaces).not.toContain(theirClan.id);
    }));

    /** The same memberships are still theirs under the hat they belong to. */
    it('still shows their own clan in the MENTOR portal', () => asScoped(async () => {
      const spaces = await spaceService.listSpaces(scoped, { portalRole: 'mentor' });
      expect(spaces.filter((s) => s.type === 'clan').map((s) => s.id)).toContain(theirClan.id);
    }));
  });

  describe('who they can start a chat with', () => {
    const messagingService = require('../../src/services/messagingService');

    it('offers their programme’s people, not the whole workspace', () => asScoped(async () => {
      const allowed = await messagingService.getAllowedRecipientIds(scoped.id);
      expect(Array.isArray(allowed)).toBe(true);
      // The mentee is only in the other programme's clan.
      expect(allowed).not.toContain(mentee.id);
      // An org admin stays reachable — scope is a reason to need one.
      expect(allowed).toContain(orgAdmin.id);
    }));
  });
});
