'use strict';

/**
 * A mentee's record follows the mentee, not the clan.
 *
 * When a mentee MOVES, their old `ClanMembership` flips to 'removed' — a status
 * nothing else in the codebase reads — so the previous mentor lost them and the
 * receiving mentor never had the earlier work. A mentor deciding what to assign
 * next was blind to everything before this clan.
 *
 * The record is additive: per-clan isolation of tasks and stats
 * (tests/mentor/mentee-multi-clan.test.js) is untouched. What this adds is a
 * separate read with three tiers:
 *
 *   summary    — every clan: counts, and task titles + status
 *   full       — clans the viewer mentors
 *   full, mine — a task the viewer ASSIGNED, wherever the mentee went since
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const menteeRecordService = require('../../src/services/menteeRecordService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram, createRoadmap, createRoadmapTask } = require('../helpers/seed');

describe('cross-clan mentee record', () => {
  let admin, mentorA, mentorB, mentee, program, clanA, clanB, roadmap;
  let order = 0;

  const task = async ({ clan, mentor, status = 'assigned', title }) => {
    order += 1;
    const roadmapTask = await createRoadmapTask({ roadmapId: roadmap.id, title: title || `Task ${order}`, taskOrder: order });
    return models.AssignedTask.create({
      organizationId: clan.organizationId,
      clanId: clan.id,
      menteeId: mentee.id,
      mentorId: mentor.id,
      roadmapTaskId: roadmapTask.id,
      titleOverride: title || `Task ${order}`,
      status,
      assignedAt: new Date(),
      completedAt: status === 'completed' ? new Date() : null,
    });
  };

  beforeEach(async () => {
    await cleanDb();
    order = 0;

    admin = await createAdmin({ email: 'admin@test.com' });
    mentorA = await createMentor({ email: 'mentor-a@test.com' });
    mentorB = await createMentor({ email: 'mentor-b@test.com' });
    mentee = await createMentee({ email: 'mover@test.com' });

    program = await createProgram({ createdBy: admin.id });
    roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });

    clanA = await models.Clan.create({ programId: program.id, name: 'Clan A', kind: 'cohort', leadMentorId: mentorA.id, createdBy: admin.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Clan B', kind: 'cohort', leadMentorId: mentorB.id, createdBy: admin.id });
    await clanService.addMember(clanA.id, { userId: mentorA.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: mentorB.id, role: 'lead_mentor' });

    // The mentee's time in Clan A, then they move to Clan B.
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    await task({ clan: clanA, mentor: mentorA, status: 'completed', title: 'Finished in A' });
    await task({ clan: clanA, mentor: mentorA, status: 'in_progress', title: 'Left open in A' });
  });

  /** Move them to B, leaving a 'removed' membership on A — the history case. */
  const moveToB = async () => {
    await models.ClanMembership.update(
      { status: 'removed', leftAt: new Date() },
      { where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' } },
    );
    await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });
  };

  describe('the clan they left', () => {
    it('appears in the record — the whole point', async () => {
      await moveToB();
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);

      expect(record.clans.map((c) => c.clanName).sort()).toEqual(['Clan A', 'Clan B']);
      const left = record.clans.find((c) => c.clanName === 'Clan A');
      expect(left).toMatchObject({ membershipStatus: 'removed', current: false });
      expect(left.metrics).toMatchObject({ tasksAssigned: 2, tasksCompleted: 1, tasksUnfinished: 1 });
    });

    it('is absent for somebody who was only ever invited', async () => {
      const invited = await createMentee({ email: 'invited@test.com' });
      await models.ClanMembership.create({
        organizationId: clanA.organizationId, clanId: clanA.id, userId: invited.id,
        role: 'mentee', status: 'invited',
      });
      const record = await menteeRecordService.getMenteeRecord(invited.id, mentorA);
      expect(record.clans).toEqual([]);
    });

    it('appears even when the membership row is gone entirely', async () => {
      await moveToB();
      // Deleted rather than flipped — the tasks are the only remaining trace.
      await models.ClanMembership.destroy({ where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' } });

      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      const left = record.clans.find((c) => c.clanName === 'Clan A');
      expect(left).toBeTruthy();
      expect(left.membershipStatus).toBeNull();
      expect(left.metrics.tasksAssigned).toBe(2);
    });
  });

  describe('tier 1 — summary for a clan the viewer does not mentor', () => {
    it('gives titles and status but withholds submissions', async () => {
      await moveToB();
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      const left = record.clans.find((c) => c.clanName === 'Clan A');

      expect(left.visibility).toBe('summary');
      expect(left.tasks.map((t) => t.title).sort()).toEqual(['Finished in A', 'Left open in A']);
      for (const t of left.tasks) {
        expect(t.detail).toBe('titleOnly');
        // ABSENT, not null — an absent key cannot be rendered by accident.
        expect(t).not.toHaveProperty('submissions');
        expect(t).not.toHaveProperty('finalRating');
      }
    });

    it('gives full detail for the clan the viewer does mentor', async () => {
      await moveToB();
      await task({ clan: clanB, mentor: mentorB, title: 'Set in B' });
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      const here = record.clans.find((c) => c.clanName === 'Clan B');

      expect(here.visibility).toBe('full');
      expect(here.tasks[0]).toHaveProperty('submissions');
      expect(here.tasks[0].detail).toBe('full');
    });
  });

  describe('tier 3 — work you assigned follows you', () => {
    it('shows a task in full to the mentor who set it, in a clan they do not mentor', async () => {
      // mentorB sets work while the mentee is still in Clan A, then they move.
      await task({ clan: clanA, mentor: mentorB, title: 'Set by B inside A' });
      await moveToB();

      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      const left = record.clans.find((c) => c.clanName === 'Clan A');
      expect(left.visibility).toBe('summary');

      const theirs = left.tasks.find((t) => t.title === 'Set by B inside A');
      expect(theirs).toMatchObject({ assignedByViewer: true, detail: 'full' });
      expect(theirs).toHaveProperty('submissions');
    });

    it('is per task, not per clan — a sibling task stays title-only', async () => {
      await task({ clan: clanA, mentor: mentorB, title: 'Set by B inside A' });
      await moveToB();

      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      const left = record.clans.find((c) => c.clanName === 'Clan A');
      const someoneElses = left.tasks.find((t) => t.title === 'Finished in A');
      expect(someoneElses).toMatchObject({ assignedByViewer: false, detail: 'titleOnly' });
      expect(someoneElses).not.toHaveProperty('submissions');
    });
  });

  describe('who may read it', () => {
    it('gives an admin every clan in full', async () => {
      await moveToB();
      const record = await menteeRecordService.getMenteeRecord(mentee.id, admin);
      expect(record.viewer.isAdmin).toBe(true);
      for (const clan of record.clans) expect(clan.visibility).toBe('full');
    });

    /**
     * Tiering is a property of the VIEWER, computed here. Whether they may
     * reach the record at all is a separate question answered upstream by
     * `canViewMentee`, whose fallback loop considers only the clans the mentee
     * is CURRENTLY in — so a mentor of only the clan they left is refused at
     * the route, and never gets this far. That boundary is covered over HTTP in
     * mentee-record-clan-header.test.js; this asserts the tiering alone.
     */
    it('tiers by what the viewer mentors, for whoever reaches the service', async () => {
      await moveToB();
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorA);
      expect(record.clans.find((c) => c.clanName === 'Clan A').visibility).toBe('full');
      expect(record.clans.find((c) => c.clanName === 'Clan B').visibility).toBe('summary');
    });
  });

  describe('totals and the compact read', () => {
    it('adds up across clans', async () => {
      await moveToB();
      await task({ clan: clanB, mentor: mentorB, status: 'completed', title: 'Finished in B' });
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB);
      expect(record.totals).toMatchObject({ clans: 2, programmes: 1, tasksAssigned: 3, tasksCompleted: 2 });
    });

    it('omits tasks when compact, keeping the metrics', async () => {
      await moveToB();
      const record = await menteeRecordService.getMenteeRecord(mentee.id, mentorB, { includeTasks: false });
      for (const clan of record.clans) {
        expect(clan).not.toHaveProperty('tasks');
        expect(clan.metrics).toBeTruthy();
      }
    });
  });

  describe('open work elsewhere — what clan review needs', () => {
    it('lists open work from other clans and excludes the one being reviewed', async () => {
      await moveToB();
      await task({ clan: clanB, mentor: mentorB, title: 'Open in B' });

      const elsewhere = await menteeRecordService.openWorkElsewhere(mentee.id, mentorB, { excludeClanId: clanB.id });
      expect(elsewhere.map((t) => t.title)).toEqual(['Left open in A']);
      expect(elsewhere[0].clanName).toBe('Clan A');
    });

    it('never lists finished or cancelled work', async () => {
      await moveToB();
      const elsewhere = await menteeRecordService.openWorkElsewhere(mentee.id, mentorB, { excludeClanId: clanB.id });
      expect(elsewhere.map((t) => t.title)).not.toContain('Finished in A');
    });

    it('returns nothing when the mentee has only the clan under review', async () => {
      const soloMentee = await createMentee({ email: 'solo@test.com' });
      await clanService.addMember(clanB.id, { userId: soloMentee.id, role: 'mentee' });
      const elsewhere = await menteeRecordService.openWorkElsewhere(soloMentee.id, mentorB, { excludeClanId: clanB.id });
      expect(elsewhere).toEqual([]);
    });
  });
});
