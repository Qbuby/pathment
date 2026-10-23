'use strict';

/**
 * A standing clan is a cohort carrying on, so the work carries on with it.
 *
 * The people were moved across and their work was not. Every clan-scoped read
 * filters on `assigned_tasks.clan_id` — for a standing clan, exactly, with no
 * fallback — so on production 2,151 of 2,459 tasks vanished the moment their
 * owner joined one, and 103 mentees opened an empty clan. Worse: the cohort
 * clans holding that work are frozen, so 560 live tasks could not be
 * submitted or reviewed by anybody.
 *
 * It COPIES. Re-pointing clan_id would empty the finished programme's record
 * and change what its certificates read, so these lock in that the source is
 * untouched, that the copy keeps the status it had, and that running it twice
 * does not give somebody their work twice.
 */

const { sequelize, models } = require('../../src/db');
const { mirrorPriorWork } = require('../../src/services/standingWorkMirror');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('carrying prior work into a standing clan', () => {
  let mentor, mentee, program, cohort, standing, roadmapTask;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mirror-mentor@test.com' });
    mentee = await createMentee({ email: 'mirror-mentee@test.com' });
    program = await createProgram({ createdBy: mentor.id });

    cohort = await models.Clan.create({
      programId: program.id, name: 'Loop Forge', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: mentor.id,
    });
    standing = await models.Clan.create({
      programId: program.id, name: 'Loop Forge · Standing', kind: 'standing',
      leadMentorId: mentor.id, createdBy: mentor.id,
    });
    await clanService.addMember(standing.id, { userId: mentee.id, role: 'mentee' });

    const roadmap = await models.Roadmap.create({ programId: program.id, name: 'R', createdBy: mentor.id });
    roadmapTask = await models.RoadmapTask.create({
      roadmapId: roadmap.id, title: 'Ship the thing', type: 'assignment', taskOrder: 1,
      description: 'Build it', difficulty: 'medium', deliverable: 'A repo',
    });
  });

  /** One task in the old clan, in whatever state the test needs. */
  const priorTask = (overrides = {}) => models.AssignedTask.create({
    menteeId: mentee.id, mentorId: mentor.id, clanId: cohort.id,
    roadmapTaskId: roadmapTask.id, status: 'completed',
    assignedAt: new Date('2026-05-01'), completedAt: new Date('2026-05-09'),
    finalRating: 4, pointsAwarded: 30, ...overrides,
  }, { validate: false });

  const mirror = () => mirrorPriorWork(sequelize, { clanId: standing.id, menteeId: mentee.id });
  const copies = () => models.AssignedTask.findAll({ where: { clanId: standing.id } });

  it('copies the work into the standing clan', async () => {
    await priorTask();
    await expect(mirror()).resolves.toMatchObject({ tasks: 1 });

    const [copy] = await copies();
    expect(copy).toBeTruthy();
    expect(copy.roadmapTaskId).toBe(roadmapTask.id);
    expect(copy.menteeId).toBe(mentee.id);
  });

  it('keeps the status, rating and points it had', async () => {
    await priorTask({ status: 'revision_needed', finalRating: 3, pointsAwarded: 12 });
    await mirror();

    const [copy] = await copies();
    expect(copy.status).toBe('revision_needed');
    expect(Number(copy.finalRating)).toBe(3);
    expect(copy.pointsAwarded).toBe(12);
  });

  /** The finished programme's record, and the certificates that read it. */
  it('leaves the original exactly where it was', async () => {
    const source = await priorTask();
    await mirror();

    await source.reload();
    expect(source.clanId).toBe(cohort.id);
    expect(source.status).toBe('completed');
    await expect(models.AssignedTask.count({ where: { clanId: cohort.id } })).resolves.toBe(1);
  });

  it('brings the submission and its feedback, remapped onto the copy', async () => {
    const source = await priorTask();
    const submission = await models.TaskSubmission.create({
      assignedTaskId: source.id, version: 1, submissionText: 'Here it is',
      status: 'approved', submittedAt: new Date('2026-05-08'),
    }, { validate: false });
    await models.TaskFeedback.create({
      assignedTaskId: source.id, submissionId: submission.id, mentorId: mentor.id,
      feedbackText: 'Good work', rating: 4, isApproved: true,
    }, { validate: false });

    await expect(mirror()).resolves.toMatchObject({ tasks: 1, submissions: 1, feedback: 1 });

    const [copy] = await copies();
    const copiedSubs = await models.TaskSubmission.findAll({ where: { assignedTaskId: copy.id } });
    expect(copiedSubs).toHaveLength(1);
    expect(copiedSubs[0].submissionText).toBe('Here it is');
    expect(copiedSubs[0].version).toBe(1);

    const copiedFeedback = await models.TaskFeedback.findAll({ where: { assignedTaskId: copy.id } });
    expect(copiedFeedback).toHaveLength(1);
    // Pointing at the COPY's submission, not the original's.
    expect(copiedFeedback[0].submissionId).toBe(copiedSubs[0].id);
    expect(copiedFeedback[0].feedbackText).toBe('Good work');
  });

  it('brings the day-by-day progress log', async () => {
    const source = await priorTask({ status: 'in_progress', completedAt: null });
    await models.TaskProgressEntry.create({
      assignedTaskId: source.id, menteeId: mentee.id, dateKey: '2026-05-04', note: 'read the docs',
    });

    await expect(mirror()).resolves.toMatchObject({ progress: 1 });
    const [copy] = await copies();
    const entries = await models.TaskProgressEntry.findAll({ where: { assignedTaskId: copy.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('read the docs');
  });

  /** Called on every join, so running twice must not double anybody's work. */
  it('is idempotent', async () => {
    await priorTask();
    await mirror();
    await expect(mirror()).resolves.toMatchObject({ tasks: 0 });
    await expect(models.AssignedTask.count({ where: { clanId: standing.id } })).resolves.toBe(1);
  });

  it('records where each copy came from', async () => {
    const source = await priorTask();
    await mirror();
    const [copy] = await copies();
    expect(copy.continuedFromTaskId).toBe(source.id);
  });

  /**
   * Attempt state lives in its own tables, some behind a unique key on the
   * task. A copied attempt is one nobody sat, or a constraint violation.
   */
  it('leaves quiz and interview work where it was taken', async () => {
    await priorTask({ typeOverride: 'interview' });
    await priorTask({ typeOverride: 'quiz' });
    await expect(mirror()).resolves.toMatchObject({ tasks: 0 });
    await expect(models.AssignedTask.count({ where: { clanId: standing.id } })).resolves.toBe(0);
  });

  it('does not reach into another programme', async () => {
    const other = await createProgram({ createdBy: mentor.id, name: 'Different programme' });
    const otherClan = await models.Clan.create({
      programId: other.id, name: 'Elsewhere', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: mentor.id,
    });
    await priorTask({ clanId: otherClan.id });

    await expect(mirror()).resolves.toMatchObject({ tasks: 0 });
  });

  it('ignores work already in the standing clan', async () => {
    await models.AssignedTask.create({
      menteeId: mentee.id, mentorId: mentor.id, clanId: standing.id,
      roadmapTaskId: roadmapTask.id, status: 'assigned', assignedAt: new Date(),
    }, { validate: false });

    await expect(mirror()).resolves.toMatchObject({ tasks: 0 });
    await expect(models.AssignedTask.count({ where: { clanId: standing.id } })).resolves.toBe(1);
  });
});
