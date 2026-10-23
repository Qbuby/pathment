'use strict';

/**
 * One answer to "which programmes may this person see?", asked by every
 * scoped read.
 *
 * Every scope leak this codebase has had was the same mistake made in a
 * different file: a service asking "is this person an admin?" and never "an
 * admin of WHAT?". Certificates, community spaces, announcements, the chat
 * directory, review records and the programmes list each derived the answer
 * themselves, slightly differently, so fixing one left the others leaking and
 * they leaked one at a time for weeks.
 *
 * `authzService.programScopeFor` is now the single resolver. These tests lock
 * its contract, because the surfaces above are only as correct as it is.
 */

const authzService = require('../../src/services/authzService');
const clanService = require('../../src/services/clanService');
const { models } = require('../../src/db');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

describe('programScopeFor', () => {
  let orgAdmin, scopedAdmin, mentor, mentee, mine, theirs, myClan, siblingClan, theirClan;

  beforeEach(async () => {
    await cleanDb();
    orgAdmin = await createAdmin({ email: 'org-admin@test.com' });
    // Deliberately not an `admin` account: an account whose own role is admin
    // is a workspace owner and unrestricted by design, so it would test nothing.
    scopedAdmin = await createMentor({ email: 'scoped-admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    mine = await createProgram({ createdBy: orgAdmin.id, name: 'Fellowship 2026' });
    theirs = await createProgram({ createdBy: orgAdmin.id, name: 'Accelerator 2026' });

    myClan = await models.Clan.create({
      programId: mine.id, name: 'Mine', leadMentorId: mentor.id, createdBy: orgAdmin.id,
    });
    siblingClan = await models.Clan.create({
      programId: mine.id, name: 'Sibling', leadMentorId: orgAdmin.id, createdBy: orgAdmin.id,
    });
    theirClan = await models.Clan.create({
      programId: theirs.id, name: 'Theirs', leadMentorId: orgAdmin.id, createdBy: orgAdmin.id,
    });

    await clanService.addMember(myClan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(myClan.id, { userId: mentee.id, role: 'mentee' });

    await models.RoleAssignment.create({
      userId: scopedAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: mine.id,
    });
  });

  it('leaves an org-tier admin unrestricted', async () => {
    const scope = await authzService.programScopeFor(orgAdmin, 'admin');
    expect(scope.unrestricted).toBe(true);
  });

  it('bounds a programme admin to their programme and all of its clans', async () => {
    // An admin OF a programme oversees every clan in it, including the ones
    // they have no membership of.
    const scope = await authzService.programScopeFor(scopedAdmin, 'admin');
    expect(scope.unrestricted).toBe(false);
    expect(scope.programIds).toEqual([mine.id]);
    expect(scope.clanIds.sort()).toEqual([myClan.id, siblingClan.id].sort());
    expect(scope.clanIds).not.toContain(theirClan.id);
  });

  it('gives a mentor the clans they mentor, and those clans programmes', async () => {
    const scope = await authzService.programScopeFor(mentor, 'mentor');
    expect(scope.clanIds).toEqual([myClan.id]);
    expect(scope.programIds).toEqual([mine.id]);
  });

  /**
   * The reason clanIds is not "the clans of programIds" for everybody.
   *
   * A mentee enrolled in a programme is not an overseer of it. Expanding their
   * programme back into clans would hand them every sibling clan's
   * clan-targeted announcements, community spaces and chat directory.
   */
  it('does not expand a mentee programme back into its sibling clans', async () => {
    const scope = await authzService.programScopeFor(mentee, 'mentee');
    expect(scope.clanIds).toEqual([myClan.id]);
    expect(scope.clanIds).not.toContain(siblingClan.id);
    expect(scope.programIds).toEqual([mine.id]);
  });

  it('counts a live enrolment even with no clan behind it', async () => {
    const loner = await createMentee({ email: 'loner@test.com' });
    await createEnrollment({ menteeId: loner.id, programId: theirs.id, status: 'active' });

    const scope = await authzService.programScopeFor(loner, 'mentee');
    expect(scope.programIds).toEqual([theirs.id]);
    expect(scope.clanIds).toEqual([]);
  });

  it('stops counting an enrolment that has been dropped', async () => {
    const gone = await createMentee({ email: 'gone@test.com' });
    await createEnrollment({ menteeId: gone.id, programId: theirs.id, status: 'dropped' });

    const scope = await authzService.programScopeFor(gone, 'mentee');
    expect(scope.programIds).toEqual([]);
  });

  /**
   * The hat narrows the answer, and that is the whole point: somebody who
   * administers one programme, mentors a clan and learns in another gets a
   * different bound on each screen, and all three are true at once.
   */
  it('answers differently per hat for the same person', async () => {
    await clanService.addMember(theirClan.id, { userId: scopedAdmin.id, role: 'mentee' });

    const asAdmin = await authzService.programScopeFor(scopedAdmin, 'admin');
    const asMentee = await authzService.programScopeFor(scopedAdmin, 'mentee');
    expect(asAdmin.programIds).toEqual([mine.id]);
    expect(asMentee.programIds).toEqual([theirs.id]);
  });

  it('unions every hat when none is stated', async () => {
    await clanService.addMember(theirClan.id, { userId: scopedAdmin.id, role: 'mentee' });

    const scope = await authzService.programScopeFor(scopedAdmin, null);
    expect(scope.programIds.sort()).toEqual([mine.id, theirs.id].sort());
  });

  it('gives somebody with no programme at all an empty bound, never unrestricted', async () => {
    const nobody = await createMentee({ email: 'nobody@test.com' });
    const scope = await authzService.programScopeFor(nobody, 'mentee');
    expect(scope).toMatchObject({ unrestricted: false, programIds: [], clanIds: [] });
  });
});

describe('adminUserIdsFor', () => {
  let orgAdmin, mineAdmin, theirsAdmin, mine, theirs;

  beforeEach(async () => {
    await cleanDb();
    orgAdmin = await createMentor({ email: 'org-admin@test.com' });
    mineAdmin = await createMentor({ email: 'mine-admin@test.com' });
    theirsAdmin = await createMentor({ email: 'theirs-admin@test.com' });
    mine = await createProgram({ createdBy: orgAdmin.id, name: 'Mine' });
    theirs = await createProgram({ createdBy: orgAdmin.id, name: 'Theirs' });

    await models.RoleAssignment.create({ userId: orgAdmin.id, role: 'super_admin', scopeType: 'org' });
    await models.RoleAssignment.create({
      userId: mineAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: mine.id,
    });
    await models.RoleAssignment.create({
      userId: theirsAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: theirs.id,
    });
  });

  /**
   * Org admins are reachable from every scope deliberately: being limited to
   * one programme is a reason to NEED an org admin, not a reason to be cut off
   * from one. What must not come with them is the admins of other programmes,
   * which is what put the people running unrelated fellowships in a mentee's
   * chat directory.
   */
  it('returns org admins plus the admins of the named programmes only', async () => {
    const ids = await authzService.adminUserIdsFor([mine.id]);
    expect(ids.sort()).toEqual([orgAdmin.id, mineAdmin.id].sort());
    expect(ids).not.toContain(theirsAdmin.id);
  });

  it('returns only org admins when no programme is named', async () => {
    await expect(authzService.adminUserIdsFor([])).resolves.toEqual([orgAdmin.id]);
  });
});
