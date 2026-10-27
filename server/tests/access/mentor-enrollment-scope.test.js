'use strict';

/**
 * An admin bound must not narrow a MENTOR's read.
 *
 * `GET /api/enrollments` scoped its rows with `adminProgramScope`, which
 * answers "which programmes does this person ADMINISTER" and knows nothing
 * about the hat they have on. One account can easily be both: a programme
 * admin of Qantara and the lead mentor of a clan in Full Stack.
 *
 * For that account the admin bound was applied to every read, mentor screens
 * included. Opening one of their own mentees on /mentor/mentees therefore came
 * back with zero enrolments and the page said:
 *
 *   "Mentee not found. This mentee is not in any of your clans."
 *
 * about a mentee who WAS in their clan, and whom `canViewMentee` had
 * authorised two lines earlier in the same request. Nothing was broken in the
 * data and nothing 403'd; the row was simply filtered out by a rule belonging
 * to a different role.
 *
 * This is the same mistake as the certificate-roster leak, running the other
 * way: there a mentor's clan header narrowed an admin screen, here an admin's
 * programme bound narrowed a mentor screen.
 */

const enrollmentController = require('../../src/controllers/enrollmentController');
const authzService = require('../../src/services/authzService');
const clanService = require('../../src/services/clanService');
const { models } = require('../../src/db');
const { runWithRequestContext, getRequestContext } = require('../../src/utils/auditContext');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

describe('a mentor who also administers a different programme', () => {
  let orgAdmin, person, myMentee, theirMentee, mentored, administered, theirClan;

  beforeEach(async () => {
    await cleanDb();
    orgAdmin = await createAdmin({ email: 'org-admin@test.com' });
    // An ordinary member elevated by a RoleAssignment. An `admin` account is a
    // workspace owner and unrestricted by design, so it would test nothing.
    person = await createMentor({ email: 'both-hats@test.com' });
    myMentee = await createMentee({ email: 'in-my-clan@test.com' });
    theirMentee = await createMentee({ email: 'somebody-elses@test.com' });

    mentored = await createProgram({ createdBy: orgAdmin.id, name: 'Full Stack' });
    administered = await createProgram({ createdBy: orgAdmin.id, name: 'Qantara' });

    const myClan = await models.Clan.create({
      programId: mentored.id, name: 'Viral Loop Clan 2026', leadMentorId: person.id, createdBy: orgAdmin.id,
    });
    theirClan = await models.Clan.create({
      programId: administered.id, name: 'Somebody elses clan', createdBy: orgAdmin.id,
    });
    await clanService.addMember(myClan.id, { userId: person.id, role: 'lead_mentor' });
    await clanService.addMember(myClan.id, { userId: myMentee.id, role: 'mentee' });
    await clanService.addMember(theirClan.id, { userId: theirMentee.id, role: 'mentee' });

    await createEnrollment({ menteeId: myMentee.id, programId: mentored.id, status: 'active' });
    await createEnrollment({ menteeId: theirMentee.id, programId: administered.id, status: 'active' });

    // The grant that caused it: admin rights over the OTHER programme.
    await models.RoleAssignment.create({
      userId: person.id, role: 'program_admin', scopeType: 'program', scopeId: administered.id,
    });
  });

  const inPortal = (role, fn) => runWithRequestContext({ ...getRequestContext(), portalRole: role }, fn);

  /** The controller, called the way the route calls it. */
  const list = async (user, query) => {
    let payload = null;
    const req = {
      user,
      query,
      loadAssignments: () => authzService.getAssignments(user),
      loadCapabilities: () => authzService.getCapabilities(user),
    };
    const res = { status: () => res, json: (body) => { payload = body; return res; } };
    await enrollmentController.getEnrollments(req, res, (error) => { throw error; });
    return payload?.data?.enrollments || [];
  };

  it('still finds their own mentee on a mentor screen', async () => {
    const rows = await inPortal('mentor', () => list(person, { menteeId: myMentee.id }));
    expect(rows.map((r) => r.menteeId)).toEqual([myMentee.id]);
  });

  /**
   * The reason the page said "not in any of your clans": the lookup the mentee
   * profile falls back on returned nothing at all.
   */
  it('does not come back empty for a mentee they lead', async () => {
    const rows = await inPortal('mentor', () => list(person, { menteeId: myMentee.id }));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('keeps the admin bound on an admin screen', async () => {
    const rows = await inPortal('admin', () => list(person, {}));
    const programIds = [...new Set(rows.map((r) => r.programId))];
    expect(programIds).toEqual([administered.id]);
  });

  it('leaves an org-tier admin seeing both programmes', async () => {
    const rows = await inPortal('admin', () => list(orgAdmin, {}));
    const programIds = [...new Set(rows.map((r) => r.programId))].sort();
    expect(programIds).toEqual([mentored.id, administered.id].sort());
  });

  /**
   * The fix must not widen anything. With no hat stated the answer is the
   * union of what they hold, which is both programmes and no more - never
   * somebody else's.
   */
  it('never reaches a programme they neither mentor nor administer', async () => {
    const outsider = await createProgram({ createdBy: orgAdmin.id, name: 'Nothing to do with them' });
    const stranger = await createMentee({ email: 'stranger@test.com' });
    await createEnrollment({ menteeId: stranger.id, programId: outsider.id, status: 'active' });

    const rows = await inPortal('mentor', () => list(person, {}));
    expect(rows.map((r) => r.programId)).not.toContain(outsider.id);
  });
});
