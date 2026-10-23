'use strict';

/**
 * A mentee's period report.
 *
 * The thing that makes this a service rather than a query is the period. A
 * report for September has to keep reading the way September did: if it is
 * recalculated against today's data every time it is opened, two people
 * looking at "the September report" a month apart see different numbers and
 * neither can tell which is wrong.
 *
 * So the state of things is taken AS AT the end of the window, and the
 * activity section counts only what moved INSIDE it. A lifetime total reads
 * identically in March and in September, which is exactly what a monthly
 * report must not do.
 */

const { models } = require('../../src/db');
const service = require('../../src/services/menteeReportService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
  createRoadmap, createRoadmapTask, createAssignedTask,
} = require('../helpers/seed');

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

describe('mentee period report', () => {
  let admin, mentor, mentee, program, clan, roadmap;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `rep-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `rep-mentor-${Date.now()}@test.com` });
    mentee = await createMentee({ email: `rep-mentee-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });
    clan = await models.Clan.create({
      programId: program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    roadmap = await createRoadmap({ programId: program.id, name: 'Core' });
  });

  /** Two steps finished in August, one in September. */
  const seedWork = async () => {
    const steps = [];
    for (let i = 0; i < 4; i += 1) {
      steps.push(await createRoadmapTask({ roadmapId: roadmap.id, title: `Step ${i + 1}`, taskOrder: i + 1 }));
    }
    const done = async (step, completedAt, rating, points) => {
      // The seed helper takes no clanId, so it is set here: without one the
      // task belongs to no clan and a clan-scoped read cannot see it.
      const task = await createAssignedTask({
        menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: step.id,
      });
      await task.update({
        clanId: clan.id,
        status: 'completed',
        assignedAt: new Date(completedAt.getTime() - 5 * 86400000),
        submittedAt: new Date(completedAt.getTime() - 86400000),
        completedAt,
        finalRating: rating,
        pointsAwarded: points,
      });
      return task;
    };
    await done(steps[0], iso(2026, 8, 10), 4, 10);
    await done(steps[1], iso(2026, 8, 20), 5, 10);
    await done(steps[2], iso(2026, 9, 12), 3, 10);
    return steps;
  };

  it('counts only the work that moved inside the window', async () => {
    await seedWork();
    const august = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 8, 1), to: iso(2026, 8, 31),
    });
    expect(august.activity.completed).toBe(2);

    const september = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 9, 1), to: iso(2026, 9, 30),
    });
    expect(september.activity.completed).toBe(1);
  });

  it('names the work, because a count tells a mentee nothing', async () => {
    await seedWork();
    const report = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 8, 1), to: iso(2026, 8, 31),
    });
    expect(report.activity.completedTasks.map((t) => t.title).sort()).toEqual(['Step 1', 'Step 2']);
    expect(report.activity.pointsEarned).toBe(20);
    expect(report.activity.averageRating).toBe(4.5);
  });

  /** The boundary a reader assumes: "to the 31st" includes the 31st. */
  it('includes work finished on the closing day itself', async () => {
    const steps = await seedWork();
    const task = await createAssignedTask({
      menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: steps[3].id,
    });
    await task.update({
      clanId: clan.id, status: 'completed',
      assignedAt: iso(2026, 8, 25), completedAt: iso(2026, 8, 31), pointsAwarded: 5,
    });

    const report = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 8, 1), to: iso(2026, 8, 31),
    });
    expect(report.activity.completed).toBe(3);
  });

  it('defaults to the current month rather than demanding two dates', async () => {
    const report = await service.build({ menteeId: mentee.id, clanId: clan.id });
    const from = new Date(report.period.from);
    expect(from.getUTCDate()).toBe(1);
    expect(from.getUTCMonth()).toBe(new Date().getUTCMonth());
  });

  it('says where they are up to on each roadmap, against the whole roadmap', async () => {
    await seedWork();
    const report = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 8, 1), to: iso(2026, 9, 30),
    });
    const core = report.roadmaps.find((r) => r.name === 'Core');
    expect(core.steps).toBe(4);
    expect(core.completed).toBe(3);
    // Three of the roadmap's four steps, not three of three assigned.
    expect(core.percentOfRoadmap).toBe(75);
  });

  it('places them in their clan using the shared leaderboard', async () => {
    await seedWork();
    const report = await service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 8, 1), to: iso(2026, 9, 30),
    });
    expect(report.standing.inClan).not.toBeNull();
    // Either a rank or an honest reason for not having one - never a made-up
    // position.
    const place = report.standing.inClan;
    expect(place.rank !== null || typeof place.notRankedBecause === 'string').toBe(true);
  });

  it('carries the context a reader needs to interpret any of it', async () => {
    const report = await service.build({ menteeId: mentee.id, clanId: clan.id });
    expect(report.mentee.name).toBeTruthy();
    expect(report.context.clan.name).toBe('Clan A');
    expect(report.context.program.name).toBe('Full Stack');
    expect(report.progress).toHaveProperty('absolute');
    expect(report.progress).toHaveProperty('risk');
  });

  it('refuses a backwards window instead of returning nonsense', async () => {
    await expect(service.build({
      menteeId: mentee.id, clanId: clan.id, from: iso(2026, 9, 30), to: iso(2026, 9, 1),
    })).rejects.toThrow(/after the end date/i);
  });

  it('returns null for somebody who does not exist', async () => {
    const report = await service.build({ menteeId: '00000000-0000-0000-0000-000000000000' });
    expect(report).toBeNull();
  });
});
