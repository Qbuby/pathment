'use strict';

/**
 * A mentee moved between clans keeps their work.
 *
 * `reassignMentee` kept the enrolment on a same-programme move, and kept the
 * tasks with it, which reads like the work moves too. It did not. Every
 * clan-scoped query filters `assigned_tasks.clan_id`, and that still named the
 * clan they had just left — so the mentee arrived in an empty clan, the new
 * mentor had nothing to review, and the history was reachable from neither
 * side. Silent, and the kind of silent that looks like the mentee never did
 * anything.
 *
 * Standing clans already had this problem and already solved it, by COPYING
 * the work rather than re-pointing it. Copying is the part that matters: the
 * old programme's record has certificates issued against it, and emptying it
 * would change what they say.
 */

const { models, sequelize } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
  createRoadmap, createRoadmapTask, createAssignedTask,
} = require('../helpers/seed');

describe('reassigning a mentee between clans', () => {
  let admin, mentorA, mentorB, program, clanA, clanB, mentee, enrollment, task;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `rk-admin-${Date.now()}@test.com` });
    mentorA = await createMentor({ email: `rk-a-${Date.now()}@test.com` });
    mentorB = await createMentor({ email: `rk-b-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });

    clanA = await models.Clan.create({
      programId: program.id, name: 'Clan A', leadMentorId: mentorA.id, createdBy: admin.id,
    });
    clanB = await models.Clan.create({
      programId: program.id, name: 'Clan B', leadMentorId: mentorB.id, createdBy: admin.id,
    });
    await clanService.addMember(clanA.id, { userId: mentorA.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: mentorB.id, role: 'lead_mentor' });

    mentee = await createMentee({ email: `rk-mentee-${Date.now()}@test.com` });
    enrollment = await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });

    const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
    const rt = await createRoadmapTask({ roadmapId: roadmap.id });
    task = await createAssignedTask({
      menteeId: mentee.id, mentorId: mentorA.id, roadmapTaskId: rt.id,
      enrollmentId: enrollment.id, status: 'completed',
    });
    await task.update({ clanId: clanA.id });
  });

  it('carries the work into the new clan', async () => {
    const result = await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    expect(result.carried?.tasks).toBe(1);
    const copy = await models.AssignedTask.findOne({
      where: { clanId: clanB.id, menteeId: mentee.id, continuedFromTaskId: task.id },
    });
    expect(copy).toBeTruthy();
    // The status, not just the row: a finished task must still read finished.
    expect(copy.status).toBe('completed');
    // And it has to hang off an enrolment, or enrolment-filtered reads miss it.
    expect(copy.enrollmentId).toBeTruthy();
  });

  it('leaves the old clan\'s record exactly as it was', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    await task.reload();
    expect(task.clanId).toBe(clanA.id);
    expect(task.status).toBe('completed');
  });

  it('does not copy anything twice when they are moved back', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);
    await clanService.reassignMentee(mentee.id, clanA.id, admin.id);
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    const inB = await models.AssignedTask.count({
      where: { clanId: clanB.id, menteeId: mentee.id, continuedFromTaskId: task.id },
    });
    expect(inB).toBe(1);
  });

  /**
   * Across programmes the old enrolment and its tasks are wiped on purpose —
   * a different roadmap's work would mean nothing here — so there is nothing
   * to carry and nothing should be invented.
   */
  it('carries nothing across programmes, where the old work does not apply', async () => {
    const other = await createProgram({ createdBy: admin.id, name: 'Data' });
    const elsewhere = await models.Clan.create({
      programId: other.id, name: 'Elsewhere', leadMentorId: mentorB.id, createdBy: admin.id,
    });
    await clanService.addMember(elsewhere.id, { userId: mentorB.id, role: 'lead_mentor' });

    const result = await clanService.reassignMentee(mentee.id, elsewhere.id, admin.id);

    expect(result.carried).toBeNull();
    expect(result.wipedEnrollments).toContain(enrollment.id);
    const copies = await models.AssignedTask.count({ where: { clanId: elsewhere.id, menteeId: mentee.id } });
    expect(copies).toBe(0);
  });

  it('takes them off the old clan\'s roster', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    const [left, joined] = await Promise.all([
      models.ClanMembership.findOne({ where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' } }),
      models.ClanMembership.findOne({ where: { clanId: clanB.id, userId: mentee.id, role: 'mentee' } }),
    ]);
    expect(left.status).toBe('removed');
    expect(joined.status).toBe('active');
  });

  afterAll(async () => { await sequelize.close().catch(() => {}); });
});
