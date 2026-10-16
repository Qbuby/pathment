'use strict';

/**
 * A PAUSED mentee must stay reachable by their mentor.
 *
 * Pausing sets clan_memberships.status = 'paused' (mentorshipPauseService), but
 * the authz layer used to admit only status:'active' — while the My Mentees page
 * links straight to the detail route for paused mentees. The result was a link
 * the product hands you that is guaranteed to 403, rendered in the UI as the
 * misleading "Mentee not found".
 *
 * These lock down the four surfaces that screen touches (profile, tasks,
 * enrollments, activity summary) plus the scope resolvers behind them, and pin
 * the statuses that must STILL be denied.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const authzService = require('../../src/services/authzService');
const mentorshipPauseService = require('../../src/services/mentorshipPauseService');
const {
  cleanDb, createMentor, createMentee, createProgram, createEnrollment, createMatch, authHeader,
} = require('../helpers/seed');

const setStatus = (userId, clanId, status) =>
  models.ClanMembership.update({ status }, { where: { userId, clanId } });

describe('paused mentee remains visible to their mentor', () => {
  let lead, outsider, mentee, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    outsider = await createMentor({ email: 'outsider@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: lead.id,
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
  });

  describe('canViewMentee', () => {
    it('allows the lead mentor while the mentee is active', async () => {
      expect(await authzService.canViewMentee(lead, mentee.id)).toBe(true);
    });

    it('STILL allows the lead mentor once the mentee is paused', async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');
      expect(await authzService.canViewMentee(lead, mentee.id)).toBe(true);
    });

    it('denies a mentor from another clan either way', async () => {
      expect(await authzService.canViewMentee(outsider, mentee.id)).toBe(false);
      await setStatus(mentee.id, clan.id, 'paused');
      expect(await authzService.canViewMentee(outsider, mentee.id)).toBe(false);
    });

    it('denies invited and removed — only active/paused count', async () => {
      await setStatus(mentee.id, clan.id, 'invited');
      expect(await authzService.canViewMentee(lead, mentee.id)).toBe(false);

      await setStatus(mentee.id, clan.id, 'removed');
      expect(await authzService.canViewMentee(lead, mentee.id)).toBe(false);
    });
  });

  describe('scope resolvers keep the clan on a paused mentee', () => {
    it('scopeOfMentee still resolves clanId + programId', async () => {
      await setStatus(mentee.id, clan.id, 'paused');
      const resource = await authzService.scopeOfMentee(mentee.id);
      expect(resource.clanId).toBe(clan.id);
      expect(resource.programId).toBeTruthy();
    });

    it('names NO clan when the mentee holds two and the caller named none', async () => {
      /**
       * This used to assert that an active placement was preferred over a
       * paused one. `scopeOfMentee` deliberately stopped choosing: picking for
       * the caller means authorising against a clan they did not ask about,
       * and a standing clan and a cohort clan grant different things. The same
       * rule `resolveMenteeClanId` follows — refuse rather than guess — and
       * `preferredClanId` is how a caller who knows says so.
       *
       * clanService.addMember refuses a second mentee placement (one clan at a
       * time), so this row is written directly — which is how it occurs in
       * practice: legacy data and migrations, not the happy path.
       */
      const program = await createProgram({ createdBy: lead.id });
      const second = await models.Clan.create({
        programId: program.id, name: 'Second', leadMentorId: lead.id, createdBy: lead.id,
      });
      await models.ClanMembership.create({
        clanId: second.id, userId: mentee.id, role: 'mentee', status: 'active',
      });
      await setStatus(mentee.id, clan.id, 'paused');

      expect((await authzService.scopeOfMentee(mentee.id)).clanId).toBeUndefined();
      // Naming one resolves it, paused or not.
      expect((await authzService.scopeOfMentee(mentee.id, second.id)).clanId).toBe(second.id);
      expect((await authzService.scopeOfMentee(mentee.id, clan.id)).clanId).toBe(clan.id);
    });

    it('drops the clan for invited/removed', async () => {
      await setStatus(mentee.id, clan.id, 'removed');
      const resource = await authzService.scopeOfMentee(mentee.id);
      expect(resource.clanId).toBeUndefined();
    });
  });

  describe('the four HTTP calls the mentee-detail screen fires', () => {
    beforeEach(async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');
    });

    it('GET /api/mentor/mentee/:id does not 403', async () => {
      const res = await request(app)
        .get(`/api/mentor/mentee/${mentee.id}`)
        .set('Authorization', authHeader(lead));
      expect(res.status).not.toBe(403);
    });

    it('GET /api/tasks/mentee/:id does not 403', async () => {
      const res = await request(app)
        .get(`/api/tasks/mentee/${mentee.id}`)
        .set('Authorization', authHeader(lead));
      expect(res.status).not.toBe(403);
    });

    it('GET /api/enrollments?menteeId= does not 403', async () => {
      const res = await request(app)
        .get(`/api/enrollments?menteeId=${mentee.id}`)
        .set('Authorization', authHeader(lead));
      expect(res.status).not.toBe(403);
    });

    it('GET /api/activity/mentee/:id/summary does not 403', async () => {
      const res = await request(app)
        .get(`/api/activity/mentee/${mentee.id}/summary?days=7`)
        .set('Authorization', authHeader(lead));
      expect(res.status).not.toBe(403);
    });

    it('still 403s for a mentor from another clan', async () => {
      const res = await request(app)
        .get(`/api/mentor/mentee/${mentee.id}`)
        .set('Authorization', authHeader(outsider));
      expect(res.status).toBe(403);
    });
  });

  describe('the cohort LIST agrees with what the detail page allows', () => {
    // The list is built from cohortService.resolveMenteeIds and the detail page
    // from canViewMentee. When the list skipped the permission check, it could
    // hand a mentor rows that every detail call then 403'd on.
    const cohortService = require('../../src/services/cohortService');

    it('lists the lead mentor\'s active mentee', async () => {
      const ids = await cohortService.resolveMenteeIds(lead.id);
      expect(ids).toContain(mentee.id);
    });

    it('does not list another clan\'s mentee', async () => {
      const ids = await cohortService.resolveMenteeIds(outsider.id);
      expect(ids).not.toContain(mentee.id);
    });

    it('every listed mentee passes canViewMentee', async () => {
      const ids = await cohortService.resolveMenteeIds(lead.id);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        expect(await authzService.canViewMentee(lead, id)).toBe(true);
      }
    });

    it('keeps paused mentees OUT of the main cohort list', async () => {
      // They belong to the separate paused panel, not the working cohort — but
      // they must still be openable, which the HTTP block above covers.
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');
      const ids = await cohortService.resolveMenteeIds(lead.id);
      expect(ids).not.toContain(mentee.id);
      expect(await authzService.canViewMentee(lead, mentee.id)).toBe(true);
    });
  });

  describe('a paused mentee keeps the ways back in', () => {
    // The pause notification tells them: "Message your mentor and ask them to
    // unpause you." Every one of these was blocked by the same active-only
    // filter that hid the profile page.
    const schedulingService = require('../../src/services/schedulingService');
    const messagingService = require('../../src/services/messagingService');

    beforeEach(async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');
    });

    it('still resolves their mentors', async () => {
      const ids = await schedulingService.getMenteeMentorIds(mentee.id);
      expect(ids).toContain(lead.id);
    });

    it('may still message their mentor', async () => {
      const allowed = await messagingService.getAllowedRecipientIds(mentee.id);
      expect(allowed).toContain(lead.id);
    });

    it('can still be transferred to another clan', async () => {
      const program = await createProgram({ createdBy: lead.id });
      const target = await models.Clan.create({
        programId: program.id, name: 'Target', leadMentorId: lead.id, createdBy: lead.id,
      });
      await clanService.addMember(target.id, { userId: lead.id, role: 'lead_mentor' });

      await clanService.reassignMentee(mentee.id, target.id);

      // The point of the fix: they leave the old clan instead of ending up in both.
      const rows = await models.ClanMembership.findAll({
        where: { userId: mentee.id, role: 'mentee' }, raw: true,
      });
      const live = rows.filter((r) => ['active', 'paused'].includes(r.status));
      expect(live).toHaveLength(1);
      expect(live[0].clanId).toBe(target.id);
    });
  });

  describe('activity summary honours a 1:1 match with no clan placement', () => {
    // The summary used to route through scope.mentee(), which resolves only the
    // mentee's CLAN — so a purely matched mentee resolved to a bare { userId }
    // and 403'd even though their profile page loaded fine.
    it('allows the matched mentor for a mentee in no clan', async () => {
      const solo = await createMentee({ email: 'solo@test.com' });
      const program = await createProgram({ createdBy: lead.id });
      const enrollment = await createEnrollment({ menteeId: solo.id, programId: program.id });
      await createMatch({
        mentorId: lead.id, menteeId: solo.id, enrollmentId: enrollment.id, matchedBy: lead.id,
      });

      expect(await authzService.canViewMentee(lead, solo.id)).toBe(true);

      const res = await request(app)
        .get(`/api/activity/mentee/${solo.id}/summary?days=7`)
        .set('Authorization', authHeader(lead));
      expect(res.status).not.toBe(403);
    });
  });

  describe('a paused mentee is reachable from clan review', () => {
    const cohortService = require('../../src/services/cohortService');

    /**
     * Pausing takes somebody out of the numbers, which is its job. It also
     * took them off clan review — the one screen where a mentor goes through
     * their people one at a time and would notice someone had stopped turning
     * up. They were simply gone, with no trace and no way back.
     */
    it('is left out of the roster by default', async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');

      const { cohort, totals } = await cohortService.getCohort(lead.id, { clanId: clan.id });

      expect(cohort.map((r) => r.id)).not.toContain(mentee.id);
      expect(totals.mentees).toBe(0);
    });

    it('comes back tagged when asked for, and counts toward nothing', async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');

      const { cohort, totals } = await cohortService.getCohort(lead.id, {
        clanId: clan.id, includePaused: true,
      });

      const row = cohort.find((r) => r.id === mentee.id);
      expect(row).toBeDefined();
      expect(row.paused).toBe(true);
      // Still attributed to the clan: an unattributed row shows in every clan.
      expect((row.clans || []).map((c) => c.id)).toContain(clan.id);
      // Out of every headline number — that is what pausing is for.
      expect(totals.mentees).toBe(0);
      expect(totals.paused).toBe(1);
    });

    it('is not duplicated when they are active in another clan', async () => {
      const program = await createProgram({ createdBy: lead.id });
      const second = await models.Clan.create({
        programId: program.id, name: 'Second', leadMentorId: lead.id, createdBy: lead.id,
      });
      await clanService.addMember(second.id, { userId: lead.id, role: 'lead_mentor' });
      await clanService.addMember(second.id, { userId: mentee.id, role: 'mentee' });
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');

      const { cohort } = await cohortService.getCohort(lead.id, { includePaused: true });

      expect(cohort.filter((r) => r.id === mentee.id)).toHaveLength(1);
      // Active somewhere is active: a greyed-out second copy would be a lie.
      expect(cohort.find((r) => r.id === mentee.id).paused).toBe(false);
    });
  });

  describe('pause reads on a clan whose programme has finished', () => {
    /**
     * Authority and applicability are different questions, and conflating them
     * told a mentor "You do not oversee this clan" about a clan they lead, for
     * the sole reason that it had finished. Clan review asks for suggestions on
     * every load, so the page logged a 403 each time it opened.
     */
    const freeze = () => models.Clan.update({ frozenAt: new Date() }, { where: { id: clan.id } });

    it('returns no suggestions rather than refusing the read', async () => {
      await freeze();
      await expect(mentorshipPauseService.listSuggestions(lead, clan.id)).resolves.toEqual([]);
    });

    it('still refuses a clan the mentor does not run', async () => {
      const program = await createProgram({ createdBy: outsider.id });
      const theirs = await models.Clan.create({
        programId: program.id, name: 'Not mine', leadMentorId: outsider.id, createdBy: outsider.id,
      });
      await clanService.addMember(theirs.id, { userId: outsider.id, role: 'lead_mentor' });

      await expect(mentorshipPauseService.listSuggestions(lead, theirs.id)).rejects.toThrow(/oversee/i);
    });

    it('still shows who is paused there — they are still paused', async () => {
      await mentorshipPauseService.pause(lead, mentee.id, clan.id, 'exams', 'mentor');
      await freeze();

      const paused = await mentorshipPauseService.listPaused(lead, clan.id);

      expect(paused.map((p) => p.menteeId)).toEqual([mentee.id]);
    });
  });
});
