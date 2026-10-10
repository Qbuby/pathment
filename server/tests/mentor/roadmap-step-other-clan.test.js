'use strict';

/**
 * The assign picker says what happened elsewhere — and still lets you assign it.
 *
 * `getMenteeStepStatus` scopes `status` to the active clan on purpose: a
 * completed cohort's assignments must not mark a standing clan's steps as
 * already given. That is right, and it left a mentor choosing the next task
 * with no idea whether they had already covered it somewhere else.
 *
 * `otherClanStatus` is the answer, and it is strictly advisory. These tests
 * exist mostly to pin the thing it must NOT do: change `status`, `activeCount`
 * or `assignedCount`, which are what the drawer locks on.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const linearRoadmapService = require('../../src/services/linearRoadmapService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram, createRoadmap, createRoadmapTask } = require('../helpers/seed');

describe('roadmap steps already done in another clan', () => {
  let admin, mentor, mentee, program, clanA, clanB, roadmap, stepOne, stepTwo;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    program = await createProgram({ createdBy: admin.id });
    roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
    stepOne = await createRoadmapTask({ roadmapId: roadmap.id, title: 'Build the API', taskOrder: 1 });
    stepTwo = await createRoadmapTask({ roadmapId: roadmap.id, title: 'Write the tests', taskOrder: 2 });

    clanA = await models.Clan.create({ programId: program.id, name: 'Cohort 2024', kind: 'cohort', leadMentorId: mentor.id, createdBy: admin.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Core Team', kind: 'standing', leadMentorId: mentor.id, createdBy: admin.id });
    await clanService.addMember(clanA.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: mentor.id, role: 'lead_mentor' });
    // In BOTH clans, so clanScopedWhere uses strict clan equality.
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });
  });

  const assign = (clan, roadmapTask, status) => models.AssignedTask.create({
    organizationId: clan.organizationId,
    clanId: clan.id,
    menteeId: mentee.id,
    mentorId: mentor.id,
    roadmapTaskId: roadmapTask.id,
    status,
    assignedAt: new Date(),
    completedAt: status === 'completed' ? new Date() : null,
  });

  const stepsIn = async (clan) => (await linearRoadmapService.getMenteeStepStatus(roadmap.id, mentee.id, clan.id)).steps;

  describe('the lock is untouched', () => {
    it('leaves status null for a step only ever assigned in the other clan', async () => {
      await assign(clanA, stepOne, 'completed');
      const [first] = await stepsIn(clanB);
      // This is the existing contract and the reason the scoping exists.
      expect(first.status).toBeNull();
    });

    it('keeps activeCount and assignedCount counting only this clan', async () => {
      await assign(clanA, stepOne, 'in_progress');
      await assign(clanA, stepTwo, 'completed');
      const result = await linearRoadmapService.getMenteeStepStatus(roadmap.id, mentee.id, clanB.id);
      expect(result.activeCount).toBe(0);
      expect(result.assignedCount).toBe(0);
      expect(result.otherClanCount).toBe(2);
    });

    it('still reports a step assigned in THIS clan exactly as before', async () => {
      await assign(clanB, stepOne, 'in_progress');
      const result = await linearRoadmapService.getMenteeStepStatus(roadmap.id, mentee.id, clanB.id);
      expect(result.steps[0].status).toBe('in_progress');
      expect(result.activeCount).toBe(1);
    });
  });

  describe('what it tells the mentor', () => {
    it('names the other clan and what happened there', async () => {
      await assign(clanA, stepOne, 'completed');
      const [first] = await stepsIn(clanB);
      expect(first.otherClanStatus).toMatchObject({ status: 'completed', clanName: 'Cohort 2024' });
    });

    it('reports the most advanced status when a step was given twice', async () => {
      await assign(clanA, stepOne, 'in_progress');
      const otherCohort = await models.Clan.create({
        programId: program.id, name: 'Cohort 2023', kind: 'cohort', createdBy: admin.id,
      });
      await clanService.addMember(otherCohort.id, { userId: mentee.id, role: 'mentee' });
      await assign(otherCohort, stepOne, 'completed');

      const [first] = await stepsIn(clanB);
      expect(first.otherClanStatus.status).toBe('completed');
    });

    it('says nothing about a step they have never been given', async () => {
      await assign(clanA, stepOne, 'completed');
      const [, second] = await stepsIn(clanB);
      expect(second.otherClanStatus).toBeNull();
    });

    it('ignores cancelled work elsewhere', async () => {
      await assign(clanA, stepOne, 'cancelled');
      const [first] = await stepsIn(clanB);
      expect(first.otherClanStatus).toBeNull();
    });

    it('is absent entirely when no clan is active', async () => {
      await assign(clanA, stepOne, 'completed');
      const result = await linearRoadmapService.getMenteeStepStatus(roadmap.id, mentee.id, null);
      expect(result.steps[0].otherClanStatus).toBeNull();
      expect(result.otherClanCount).toBe(0);
    });
  });
});
