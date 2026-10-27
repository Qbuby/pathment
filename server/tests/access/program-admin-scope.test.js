'use strict';

/**
 * An admin of one programme is an admin of one programme.
 *
 * Admin rights can be granted at programme scope — `program_admin` bound to
 * Fellowship 2026 and nothing else. The permission checks honoured that from
 * the start: the person could not edit another programme's clans or approve
 * another programme's intake. What they COULD do was read.
 *
 * Several list endpoints asked "is this an admin?" and stopped there, which is
 * the wrong question once the answer can be "of what?". `GET /api/programs`
 * handed back the entire catalogue, private drafts included; `GET /api/mentors`
 * took the programme filter from the caller, so omitting the parameter listed
 * every mentor in the workspace with their email addresses. Neither needed a
 * guessed id or a crafted request — just the normal screen.
 *
 * These lock the boundary at the read, not only at the write.
 */

const programService = require('../../src/services/programService');
const authzService = require('../../src/services/authzService');
const { models } = require('../../src/db');
const { cleanDb, createAdmin, createMentor, createProgram } = require('../helpers/seed');
const clanService = require('../../src/services/clanService');

describe('an admin scoped to one programme', () => {
  let orgAdmin, scopedAdmin, mine, theirs, myMentor, theirMentor;

  beforeEach(async () => {
    await cleanDb();
    orgAdmin = await createAdmin({ email: 'org-admin@test.com' });
    /**
     * Deliberately NOT an `admin` account. A programme admin is an ordinary
     * member elevated by a RoleAssignment — an account whose own role is
     * `admin` is a workspace owner and is unrestricted by design, so seeding
     * one here would test nothing.
     */
    scopedAdmin = await createMentor({ email: 'scoped-admin@test.com' });
    myMentor = await createMentor({ email: 'my-mentor@test.com' });
    theirMentor = await createMentor({ email: 'their-mentor@test.com' });

    mine = await createProgram({ createdBy: orgAdmin.id, name: 'Fellowship 2026' });
    theirs = await createProgram({ createdBy: orgAdmin.id, name: 'Accelerator 2026' });
    // Private, so it is exactly the kind of row that must not leak.
    await theirs.update({ status: 'draft', visibility: 'private' });

    const myClan = await models.Clan.create({
      programId: mine.id, name: 'Mine', leadMentorId: myMentor.id, createdBy: orgAdmin.id,
    });
    const theirClan = await models.Clan.create({
      programId: theirs.id, name: 'Theirs', leadMentorId: theirMentor.id, createdBy: orgAdmin.id,
    });
    await clanService.addMember(myClan.id, { userId: myMentor.id, role: 'lead_mentor' });
    await clanService.addMember(theirClan.id, { userId: theirMentor.id, role: 'lead_mentor' });

    // The grant under test: admin rights over ONE programme.
    await models.RoleAssignment.create({
      userId: scopedAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: mine.id,
    });
  });

  it('reports exactly the programme they administer', async () => {
    await expect(authzService.adminProgramScope(scopedAdmin)).resolves.toEqual([mine.id]);
  });

  it('leaves an org-tier admin unrestricted', async () => {
    await expect(authzService.adminProgramScope(orgAdmin)).resolves.toBeNull();
  });

  describe('the programmes list', () => {
    const list = (user, scope) => programService.getPrograms({ limit: 50 }, user.id, 'admin', scope);

    it('shows an org admin everything', async () => {
      const scope = await authzService.adminProgramScope(orgAdmin);
      const { programs } = await list(orgAdmin, scope);
      expect(programs.map((p) => p.id).sort()).toEqual([mine.id, theirs.id].sort());
    });

    it('shows a scoped admin only their own', async () => {
      const scope = await authzService.adminProgramScope(scopedAdmin);
      const { programs } = await list(scopedAdmin, scope);
      expect(programs.map((p) => p.id)).toEqual([mine.id]);
    });

    it('shows nothing to an admin scoped to no programme at all', async () => {
      const { programs } = await programService.getPrograms({ limit: 50 }, scopedAdmin.id, 'admin', []);
      expect(programs).toEqual([]);
    });
  });

  /**
   * The state a programme admin is actually granted in.
   *
   * Somebody is given a brand-new fellowship to set up: draft, private, no
   * clans, no enrolments. `loadWorkspaceRole` returns 'admin' only for an
   * org-wide super admin — correctly, a programme role is not workspace
   * administration — so this person was treated as the public and served the
   * published-and-public view, which a draft programme is not in. They opened
   * Programs to an empty list, and could not create the programme's first
   * clan either, because that form reads the same list. Nothing they
   * administered existed anywhere in the product.
   */
  describe('an admin of a draft programme with nothing in it yet', () => {
    let draft;

    beforeEach(async () => {
      draft = await createProgram({ createdBy: orgAdmin.id, name: 'Qantara Fellowship' });
      await draft.update({ status: 'draft', visibility: 'private' });
      await models.RoleAssignment.create({
        userId: scopedAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: draft.id,
      });
    });

    it('lists it, even though it is a draft and they are not an org admin', async () => {
      const scope = await authzService.adminProgramScope(scopedAdmin);
      expect(scope).toEqual(expect.arrayContaining([draft.id]));
      // The role the server actually resolves for them — never 'admin'.
      const { programs } = await programService.getPrograms({ limit: 50 }, scopedAdmin.id, 'mentor', scope);
      expect(programs.map((p) => p.id)).toEqual(expect.arrayContaining([draft.id]));
    });

    it('opens it by id', async () => {
      const scope = await authzService.adminProgramScope(scopedAdmin);
      const program = await programService.getProgramById(draft.id, scopedAdmin.id, 'mentor', scope);
      expect(program.id).toBe(draft.id);
    });

    /** The grant is still a boundary, not a key to the catalogue. */
    it('still cannot see a draft programme it was not granted', async () => {
      const otherDraft = await createProgram({ createdBy: orgAdmin.id, name: 'Not theirs' });
      await otherDraft.update({ status: 'draft', visibility: 'private' });
      const scope = await authzService.adminProgramScope(scopedAdmin);

      const { programs } = await programService.getPrograms({ limit: 50 }, scopedAdmin.id, 'mentor', scope);
      expect(programs.map((p) => p.id)).not.toContain(otherDraft.id);
      await expect(programService.getProgramById(otherDraft.id, scopedAdmin.id, 'mentor', scope))
        .rejects.toThrow();
    });

    /** And an ordinary member is still the public. */
    it('shows a plain member nothing but published, public programmes', async () => {
      const { programs } = await programService.getPrograms({ limit: 50 }, myMentor.id, 'mentor', []);
      expect(programs.map((p) => p.id)).not.toContain(draft.id);
    });
  });

  describe('a programme fetched directly by id', () => {
    it('opens the one they administer', async () => {
      const program = await programService.getProgramById(mine.id, scopedAdmin.id, 'admin', [mine.id]);
      expect(program.id).toBe(mine.id);
    });

    /**
     * Hiding a row from the list and then serving it on a guessed id would be
     * no privacy at all. Out of scope, an admin is just a signed-in person —
     * and this programme is private, so that means refused.
     */
    it('refuses one outside their scope, even though they are an admin', async () => {
      await expect(programService.getProgramById(theirs.id, scopedAdmin.id, 'admin', [mine.id]))
        .rejects.toThrow();
    });

    it('still opens for an org admin', async () => {
      const program = await programService.getProgramById(theirs.id, orgAdmin.id, 'admin', null);
      expect(program.id).toBe(theirs.id);
    });
  });

  /**
   * The counters above the enrolments table. The list itself has been scoped
   * for a while; the six totals over it were counted across the workspace, so
   * they were the one thing on the screen that was nobody's business but the
   * org's.
   */
  describe('the enrolment counters', () => {
    const enrollmentService = require('../../src/services/enrollmentService');

    beforeEach(async () => {
      // The mentors seeded above are perfectly good distinct users to hang an
      // enrolment off; this case is counting rows, not modelling a cohort.
      await models.Enrollment.create({ menteeId: myMentor.id, programId: mine.id, status: 'active' });
      await models.Enrollment.create({ menteeId: theirMentor.id, programId: theirs.id, status: 'active' });
    });

    it('counts the whole workspace for an org admin', async () => {
      const stats = await enrollmentService.getEnrollmentStats(null);
      expect(stats.total).toBe(2);
    });

    it('counts only their own programme for a scoped admin', async () => {
      const stats = await enrollmentService.getEnrollmentStats([mine.id]);
      expect(stats.total).toBe(1);
      expect(stats.active).toBe(1);
    });
  });
});
