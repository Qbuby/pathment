'use strict';

/**
 * The System Pool, end to end, at the service boundary.
 *
 * Each block below is one acceptance criterion from the spec. The ones that
 * matter most are the FENCE tests: pool work must never surface in a clan —
 * not before placement, and above all not after it, when every clan-scoped
 * query would otherwise start matching the candidate's qualifying work.
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const authzService = require('../../src/services/authzService');
const poolService = require('../../src/services/poolService');
const poolMemberService = require('../../src/services/poolMemberService');
const poolTaskService = require('../../src/services/poolTaskService');
const poolReviewService = require('../../src/services/poolReviewService');
const poolScoringService = require('../../src/services/poolScoringService');
const poolPlacementService = require('../../src/services/poolPlacementService');
const poolReminderService = require('../../src/services/poolReminderService');
const poolCandidateService = require('../../src/services/poolCandidateService');
const submissionService = require('../../src/services/submissionService');
const taskService = require('../../src/services/taskService');
const { PERMISSIONS: P } = require('../../src/config/permissions');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');

/** The invitation link is only ever in the email; read the token back out of it. */
function lastInviteToken(email) {
  const calls = emailService.enqueue.mock.calls.filter(([msg]) => msg.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let ctx;

async function world() {
  await seed.cleanDb();
  emailService.enqueue.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const otherProgram = await seed.createProgram({ createdBy: admin.id, name: 'Accelerator' });
  const lead = await seed.createMentor({ email: 'lead@test.com', firstName: 'Lena' });
  const clan = await seed.createClan({ programId: program.id, createdBy: admin.id, leadMentor: lead, name: 'Alpha' });

  // A pool reviewer for THIS programme, and one for another programme.
  const reviewer = await seed.createMentor({ email: 'reviewer@test.com' });
  await models.RoleAssignment.create({ userId: reviewer.id, role: 'pool_reviewer', scopeType: 'program', scopeId: program.id });
  const outsider = await seed.createMentor({ email: 'outsider@test.com' });
  await models.RoleAssignment.create({ userId: outsider.id, role: 'pool_reviewer', scopeType: 'program', scopeId: otherProgram.id });

  const pool = await poolService.createPool({
    programId: program.id,
    name: 'Spring pool',
    selectionQuota: 1,
    // A piece of work is worth its difficulty's points; the curve is the policy.
    scoringPolicy: { difficultyPoints: { easy: 5, medium: 10, hard: 20, expert: 40 } },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  return { admin, program, otherProgram, lead, clan, reviewer, outsider, pool };
}

/** A brand-new candidate, through the real invitation + registration flow. */
async function registerCandidate(email, firstName = 'Cand') {
  await poolMemberService.importMembers(ctx.pool.id, [{ email, firstName, lastName: 'Idate' }], ctx.admin);
  const inviteToken = lastInviteToken(email);
  expect(inviteToken).toBeTruthy();
  const { user } = await authService.register({ firstName, lastName: 'Idate', email, password: 'Test@12345', inviteToken });
  const member = await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email } });
  return { user: await models.User.findByPk(user.id), member };
}

async function projectWork(assignTo = 'all') {
  return poolTaskService.createAssignment(ctx.pool.id, {
    kind: 'task', title: 'Build an API', description: 'A small REST API', deliverable: 'Repo link',
    acceptanceCriteria: ['Has tests'], difficulty: 'hard', assignTo,
  }, ctx.admin);
}

async function taskOf(member) {
  return PoolTask().findOne({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } } });
}

async function submit(user, task, text = 'https://github.com/me/api') {
  return submissionService.submitTaskWithFiles(task.id, user.id, { submissionText: text, submissionUrls: [] }, []);
}

async function latestSubmission(task) {
  return models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
}

beforeEach(async () => {
  ctx = await world();
});

describe('candidates come in without enrollment or clan membership', () => {
  it('imports, reports each row, and is safe to retry', async () => {
    const existing = await seed.createUser({ role: 'mentee', email: 'existing@test.com' });
    const rows = ['new@test.com', 'EXISTING@test.com ', 'not-an-email', 'new@test.com'];

    const first = await poolMemberService.importMembers(ctx.pool.id, rows, ctx.admin);
    expect(first.summary).toEqual({ added: 1, invited: 1, skipped: 1, failed: 1 });
    expect(first.results.find((r) => r.email === 'existing@test.com').result).toBe('added');

    const again = await poolMemberService.importMembers(ctx.pool.id, rows, ctx.admin);
    expect(again.summary).toEqual({ added: 0, invited: 0, skipped: 3, failed: 1 });

    expect(await models.PoolMember.count({ where: { poolId: ctx.pool.id } })).toBe(2);
    expect(await models.User.count({ where: { email: 'new@test.com' } })).toBe(0);
    const invites = await models.RegistrationInvite.findAll({ where: { email: 'new@test.com' } });
    expect(invites).toHaveLength(1);
    expect(invites[0].programId).toBeNull();
    expect(invites[0].clanId).toBeNull();
    expect(invites[0].metadata.pool).toBe(true);
    expect(await models.Enrollment.count({ where: { menteeId: existing.id } })).toBe(0);
  });

  it('activating a pool invitation makes a candidate, not a mentee', async () => {
    const { user, member } = await registerCandidate('fresh@test.com');
    expect(member.userId).toBe(user.id);
    expect(member.status).toBe('active');
    expect(await models.MenteeProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await models.Enrollment.count({ where: { menteeId: user.id } })).toBe(0);
    expect(await models.ClanMembership.count({ where: { userId: user.id } })).toBe(0);

    const caps = await authzService.getCapabilities(user);
    expect(caps).toContain('candidate');
    expect(caps).not.toContain('mentee');
  });

  it('respects the pool capacity', async () => {
    await poolService.updatePool(ctx.pool.id, { capacity: 2 }, ctx.admin);
    const out = await poolMemberService.importMembers(ctx.pool.id, ['a@test.com', 'b@test.com', 'c@test.com'], ctx.admin);
    expect(out.summary.invited).toBe(2);
    expect(out.results[2]).toMatchObject({ result: 'failed' });
  });
});

describe('qualifying work uses the existing task engine, outside any clan', () => {
  it('assigns once, however many times it is assigned', async () => {
    const { member } = await registerCandidate('c1@test.com');
    const { assignment } = await projectWork();
    await poolTaskService.assign(ctx.pool.id, assignment.id, {}, ctx.admin);
    await poolTaskService.assign(ctx.pool.id, assignment.id, {}, ctx.admin);
    const tasks = await PoolTask().findAll({ where: { poolMemberId: member.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ enrollmentId: null, clanId: null, roadmapTaskId: assignment.roadmapTaskId });
  });

  it('hands existing work to someone who activates later', async () => {
    await projectWork();
    const { member } = await registerCandidate('late@test.com');
    expect(await taskOf(member)).toBeTruthy();
  });

  it('is invisible to every ordinary query', async () => {
    const { member } = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(member);
    expect(await models.AssignedTask.findByPk(task.id)).toBeNull();
    expect(await models.AssignedTask.count({ where: { menteeId: member.userId } })).toBe(0);
    expect(await PoolTask().count({ where: { menteeId: member.userId } })).toBe(1);
  });

  it('runs submit → request changes → resubmit → approve, with no points', async () => {
    const { user, member } = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(member);

    await submit(user, task);
    expect((await member.reload()).status).toBe('reviewing');
    await poolReviewService.review(ctx.pool.id, (await latestSubmission(task)).id,
      { rating: 2, decision: 'changes', feedbackText: 'Add tests' }, ctx.reviewer);
    expect((await task.reload()).status).toBe('revision_needed');

    await submit(user, task, 'https://github.com/me/api with tests');
    const v2 = await latestSubmission(task);
    expect(v2.version).toBe(2);
    await poolReviewService.review(ctx.pool.id, v2.id, { rating: 4, decision: 'approved', feedbackText: 'Good' }, ctx.reviewer);

    await task.reload();
    expect(task.status).toBe('completed');
    expect(task.pointsAwarded).toBe(0);
    expect(await models.PointsHistory.count({ where: { userId: user.id } })).toBe(0);
    expect((await member.reload()).status).toBe('completed');
  });

  it('never awards points, even for an older pool that still stores the retired awardPoints flag', async () => {
    await ctx.pool.update({ settings: { ...ctx.pool.settings, awardPoints: true } });
    const { user, member } = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(member);
    await submit(user, task);
    await poolReviewService.review(ctx.pool.id, (await latestSubmission(task)).id,
      { rating: 5, decision: 'approved', feedbackText: 'Great' }, ctx.reviewer);

    expect((await task.reload()).pointsAwarded).toBe(0);
    expect(await models.PointsHistory.count({ where: { userId: user.id } })).toBe(0);

    // Saving the settings drops the flag and ignores any attempt to set it.
    const saved = await poolService.updatePool(ctx.pool.id, { settings: { awardPoints: true, waitlistSize: 3 } }, ctx.admin);
    const settings = (saved.settings || (await ctx.pool.reload()).settings);
    expect(settings.awardPoints).toBeUndefined();
    expect(settings.waitlistSize).toBe(3);
  });
});

describe('only pool reviewers of the pool\'s programme can review', () => {
  it('admits pool.review here and refuses everyone else', async () => {
    const { user, member } = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(member);
    await submit(user, task);

    expect(await authzService.canActOnTask(ctx.reviewer.id, task, P.TASK_REVIEW)).toBe(true);
    expect(await authzService.canActOnTask(ctx.outsider.id, task, P.TASK_REVIEW)).toBe(false);
    expect(await authzService.canActOnTask(ctx.lead.id, task, P.TASK_REVIEW)).toBe(false);
    // Not even the candidate on their own work.
    expect(await authzService.canActOnTask(user.id, task, P.TASK_REVIEW)).toBe(false);

    const sub = await latestSubmission(task);
    await expect(submissionService.reviewSubmission(sub.id, ctx.lead.id, { rating: 5, isApproved: true }))
      .rejects.toThrow(/permission/);
  });
});

describe('pool work never leaks into a clan', () => {
  it('stays out of the clan when the candidate is already a mentee there', async () => {
    // An existing mentee of clan Alpha joins the pool (an existing account).
    const mentee = await seed.createUser({ role: 'mentee', email: 'inclan@test.com' });
    await require('../../src/services/clanService').addMember(ctx.clan.id, { userId: mentee.id, role: 'mentee' });
    await poolMemberService.importMembers(ctx.pool.id, ['inclan@test.com'], ctx.admin);
    await projectWork();
    const member = await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, userId: mentee.id } });
    const task = await taskOf(member);
    await submit(mentee, task);

    // The clan's lead mentor: no review right, nothing in the queue, not in the clan task list.
    expect(await authzService.canActOnTask(ctx.lead.id, task, P.TASK_REVIEW)).toBe(false);
    const queue = await submissionService.getMentorApprovalsQueue(ctx.lead.id);
    expect(JSON.stringify(queue)).not.toContain(task.id);
    const clanTasks = await taskService.getMenteeTasks(mentee.id, { clanId: ctx.clan.id });
    expect(JSON.stringify(clanTasks)).not.toContain(task.id);
    // It locates in the pool's programme — never in the clan.
    const where = await authzService.scopeOfAssignedTask(task.id);
    expect(where.clanId).toBeUndefined();
    expect(where.programId).toBe(ctx.program.id);
    // The existing submission endpoint cannot reach it either.
    await expect(submissionService.getSubmissionById((await latestSubmission(task)).id)).rejects.toThrow(/not found/i);
  });
});

describe('the candidate sees only their own work', () => {
  it('cannot read another candidate\'s work or anyone\'s score', async () => {
    const a = await registerCandidate('a@test.com');
    const b = await registerCandidate('b@test.com');
    await projectWork();
    const taskB = await taskOf(b.member);
    await expect(poolCandidateService.myTask(a.user.id, taskB.id)).rejects.toThrow(/not found/i);
    await expect(poolCandidateService.assertOwnPoolTask(a.user.id, taskB.id)).rejects.toThrow(/not found/i);

    const pools = await poolCandidateService.myPools(a.user.id);
    expect(pools).toHaveLength(1);
    const text = JSON.stringify(pools);
    expect(text).not.toMatch(/totalScore|"rank"|b@test\.com/);
  });

  /**
   * The list row carries what a clan task row carries, so one component renders
   * both - but `points` is what the work is WORTH, never what was earned on it.
   */
  it('gives the work list the same facts a clan task has', async () => {
    const a = await registerCandidate('rows@test.com');
    await projectWork();
    const [row] = await poolCandidateService.myTasks(a.user.id);
    expect(row).toMatchObject({ difficulty: 'hard', points: 20, required: true });
    expect(typeof row.description).toBe('string');
    expect(row).not.toHaveProperty('pointsAwarded');
    expect(JSON.stringify(row)).not.toMatch(/rating|totalScore/);
  });
});

describe('scoring, shortlist and the human decision', () => {
  async function twoReviewed(ratingA, ratingB) {
    const a = await registerCandidate('a@test.com', 'Ada');
    const b = await registerCandidate('b@test.com', 'Bo');
    await projectWork();
    for (const [c, rating] of [[a, ratingA], [b, ratingB]]) {
      const t = await taskOf(c.member);
      await submit(c.user, t);
      await poolReviewService.review(ctx.pool.id, (await latestSubmission(t)).id, { rating, decision: 'approved', feedbackText: 'ok' }, ctx.reviewer);
    }
    return { a, b };
  }

  it('explains every score as points earned, and proposes the quota', async () => {
    const { a, b } = await twoReviewed(4, 3);
    const { rows, blockers, possible, work } = await poolScoringService.liveScores(ctx.pool.id);
    expect(blockers).toEqual([]);
    // One hard piece of work: 20 points on offer.
    expect(possible).toBe(20);
    expect(work).toEqual([{ key: expect.any(String), label: 'Build an API', kind: 'task', required: true }]);
    const ra = rows.find((r) => r.memberId === a.member.id);
    // Four stars of five on work worth 20 → 16 earned.
    expect(ra.components[0]).toMatchObject({ label: 'Build an API', points: 20, earned: 16, status: 'scored', required: true });
    expect(ra.total).toBe(16);
    expect(ra.possible).toBe(20);
    expect(ra.proposedOutcome).toBe('selected');
    const rb = rows.find((r) => r.memberId === b.member.id);
    expect(rb.total).toBe(12);
    expect(rb.proposedOutcome).toBe('waitlisted');
  });

  it('is worth what the work says, not what its difficulty says, once priced', async () => {
    const a = await registerCandidate('a@test.com', 'Ada');
    const { assignment } = await projectWork();
    await poolTaskService.updateAssignment(ctx.pool.id, assignment.id, { points: 7 }, ctx.admin);
    const t = await taskOf(a.member);
    await submit(a.user, t);
    await poolReviewService.review(ctx.pool.id, (await latestSubmission(t)).id, { rating: 5, decision: 'approved', feedbackText: 'ok' }, ctx.reviewer);
    const { rows, possible } = await poolScoringService.liveScores(ctx.pool.id);
    expect(possible).toBe(7);
    expect(rows[0].total).toBe(7);
  });

  it('adds a hand adjustment to the points earned, and shows it apart', async () => {
    const { a } = await twoReviewed(4, 3);
    await poolMemberService.setManualScore(ctx.pool.id, a.member.id, { score: -4, note: 'Missed the panel' }, ctx.admin);
    const { rows } = await poolScoringService.liveScores(ctx.pool.id);
    const ra = rows.find((r) => r.memberId === a.member.id);
    expect(ra.adjustment).toBe(-4);
    expect(ra.adjustmentNote).toBe('Missed the panel');
    // 16 earned, 4 off — and now behind the candidate who scored three stars.
    expect(ra.total).toBe(12);
    expect(ra.components[0].earned).toBe(16);
  });

  it('refuses to rank anybody when the pool has no work', async () => {
    await registerCandidate('a@test.com', 'Ada');
    const { blockers } = await poolScoringService.liveScores(ctx.pool.id);
    expect(blockers.map((b) => b.code)).toContain('no_work');
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    await expect(poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin)).rejects.toThrow(/qualifying work/i);
  });

  it('is idempotent, and a confirmed selection records decisions', async () => {
    const { a, b } = await twoReviewed(4, 3);
    const first = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    const second = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    expect(second.reused).toBe(true);
    expect(second.shortlist.id).toBe(first.shortlist.id);

    await poolScoringService.confirm(ctx.pool.id, first.shortlist.id, {}, ctx.admin);
    expect((await a.member.reload()).decision).toBe('selected');
    expect(a.member.placement.status).toBe('pending');
    expect(Number(a.member.totalScore)).toBe(16);
    expect((await b.member.reload()).decision).toBe('waitlisted');
  });

  it('stops on a tie at the cutoff until each tied candidate is decided with a reason', async () => {
    await twoReviewed(4, 4);
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    expect(shortlist.status).toBe('blocked');
    const tie = shortlist.blockers.find((x) => x.code === 'tie_at_cutoff');
    expect(tie.memberIds).toHaveLength(2);

    await expect(poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin)).rejects.toThrow(/tied/);
    await expect(poolScoringService.confirm(ctx.pool.id, shortlist.id, {
      overrides: tie.memberIds.map((memberId) => ({ memberId, outcome: 'selected' })),
    }, ctx.admin)).rejects.toThrow(/reason/);

    await poolScoringService.confirm(ctx.pool.id, shortlist.id, {
      overrides: tie.memberIds.map((memberId) => ({ memberId, outcome: 'selected', reason: 'Both strong' })),
    }, ctx.admin);
    const decided = await models.PoolMember.findAll({ where: { poolId: ctx.pool.id } });
    expect(decided.map((m) => m.decision)).toEqual(['selected', 'selected']);
    const log = await poolService.history(ctx.pool.id);
    expect(log.some((e) => e.action === 'POOL_SELECTION_CONFIRMED' && JSON.stringify(e.newValues).includes('Both strong'))).toBe(true);
  });

  it('cannot be confirmed while required work waits for review', async () => {
    const a = await registerCandidate('a@test.com');
    await projectWork();
    await submit(a.user, await taskOf(a.member));
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    expect(shortlist.blockers.map((x) => x.code)).toContain('reviews_outstanding');
    await expect(poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin)).rejects.toThrow(/review/);
  });

  it('freezes the work once there is a decision', async () => {
    const { a } = await twoReviewed(4, 3);
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    await poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin);
    await expect(submit(a.user, await taskOf(a.member))).rejects.toThrow(/decision/);
  });
});

describe('work goes to a pool, or to one person in it', () => {
  it('adds several roadmap steps in one pass, and skips the ones already there', async () => {
    const roadmap = await models.Roadmap.create({
      organizationId: ctx.program.organizationId, programId: ctx.program.id, name: 'Month one', description: 'x',
    });
    const step = (title, difficulty, order) => models.RoadmapTask.create({
      organizationId: ctx.program.organizationId, roadmapId: roadmap.id, title, description: 'x',
      type: 'project', difficulty, taskOrder: order, deliverable: 'Repo',
    });
    const [easy, hard] = await Promise.all([step('Warm up', 'easy', 1), step('The build', 'hard', 2)]);

    const first = await poolTaskService.addRoadmapSteps(ctx.pool.id, {
      roadmapTaskIds: [easy.id, hard.id],
    }, ctx.admin);
    expect(first.summary).toEqual({ added: 2, skipped: 0, failed: 0 });
    // Each step takes its own difficulty's points off the pool's curve.
    expect(first.assignments.map((a) => a.points).sort((x, y) => x - y)).toEqual([5, 20]);

    // A second pass over the same roadmap is safe.
    const again = await poolTaskService.addRoadmapSteps(ctx.pool.id, { roadmapTaskIds: [easy.id, hard.id] }, ctx.admin);
    expect(again.summary).toEqual({ added: 0, skipped: 2, failed: 0 });
  });

  it('refuses a step that is assigned as its own kind of work', async () => {
    const roadmap = await models.Roadmap.create({
      organizationId: ctx.program.organizationId, programId: ctx.program.id, name: 'Month one', description: 'x',
    });
    const quizStep = await models.RoadmapTask.create({
      organizationId: ctx.program.organizationId, roadmapId: roadmap.id, title: 'A quiz', description: 'x',
      type: 'quiz', difficulty: 'easy', taskOrder: 1, deliverable: 'n/a',
    });
    const out = await poolTaskService.addRoadmapSteps(ctx.pool.id, { roadmapTaskIds: [quizStep.id] }, ctx.admin);
    expect(out.summary.failed).toBe(1);
    expect(out.results[0].reason).toMatch(/own kind of work/);
  });

  it('gives chosen work to ONE candidate, and nobody else', async () => {
    const a = await registerCandidate('a@test.com', 'Ada');
    const b = await registerCandidate('b@test.com', 'Bo');
    // Created but handed to nobody.
    const { assignment } = await projectWork(null);
    expect(await taskOf(a.member)).toBeNull();

    const out = await poolTaskService.assignToMember(ctx.pool.id, a.member.id, { assignmentIds: [assignment.id] }, ctx.admin);
    expect(out.summary).toEqual({ assigned: 1, skipped: 0, failed: 0 });
    expect(await taskOf(a.member)).not.toBeNull();
    expect(await taskOf(b.member)).toBeNull();

    // Safe to repeat: nobody holds the same work twice.
    const twice = await poolTaskService.assignToMember(ctx.pool.id, a.member.id, { assignmentIds: [assignment.id] }, ctx.admin);
    expect(twice.summary).toEqual({ assigned: 0, skipped: 1, failed: 0 });
  });

  it('refuses work that is not this pool\'s, and a candidate who is not in it', async () => {
    const a = await registerCandidate('a@test.com', 'Ada');
    await projectWork(null);
    await expect(poolTaskService.assignToMember(ctx.pool.id, a.member.id, {
      assignmentIds: ['11111111-1111-1111-1111-111111111111'],
    }, ctx.admin)).rejects.toThrow(/not part of this pool/i);
    await expect(poolTaskService.assignToMember(ctx.pool.id, '11111111-1111-1111-1111-111111111111', {}, ctx.admin))
      .rejects.toThrow(/not in this pool/i);
  });

  it('re-prices work already handed out, and stops once a selection is confirmed', async () => {
    const { a } = await (async () => {
      const cand = await registerCandidate('a@test.com', 'Ada');
      const { assignment } = await projectWork();
      const t = await taskOf(cand.member);
      await submit(cand.user, t);
      await poolReviewService.review(ctx.pool.id, (await latestSubmission(t)).id, { rating: 5, decision: 'approved', feedbackText: 'ok' }, ctx.reviewer);
      return { a: cand, assignment };
    })();

    const live = await poolTaskService.listAssignments(ctx.pool.id);
    await poolTaskService.updateAssignment(ctx.pool.id, live[0].id, { points: 50 }, ctx.admin);
    expect((await poolScoringService.liveScores(ctx.pool.id)).rows[0].total).toBe(50);

    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    await poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin);
    expect((await a.member.reload()).decision).toBe('selected');
    await expect(poolTaskService.updateAssignment(ctx.pool.id, live[0].id, { points: 1 }, ctx.admin))
      .rejects.toThrow(/part of the record/i);
  });
});

describe('a pool has a photo, as a clan does', () => {
  it('saves one, shows it to its candidates, and removes it', async () => {
    const poolAvatarService = require('../../src/services/poolAvatarService');
    const a = await registerCandidate('a@test.com', 'Ada');

    const saved = await poolAvatarService.setAvatarUrl(ctx.pool.id, ctx.admin, 'https://img.test/pool.png');
    expect(saved.avatarUrl).toBe('https://img.test/pool.png');
    const mine = await require('../../src/services/poolCandidateService').myPools(a.user.id);
    expect(mine[0].pool.avatarUrl).toBe('https://img.test/pool.png');

    await expect(poolAvatarService.setAvatarUrl(ctx.pool.id, ctx.admin, 'not-a-url')).rejects.toThrow(/valid image URL/i);
    // A lead mentor of a clan is not a pool manager.
    await expect(poolAvatarService.setAvatarUrl(ctx.pool.id, ctx.lead, 'https://img.test/x.png')).rejects.toThrow();
    expect((await poolAvatarService.removeAvatar(ctx.pool.id, ctx.admin)).avatarUrl).toBeNull();
  });
});

describe('placement', () => {
  async function selectedCandidate() {
    const c = await registerCandidate('chosen@test.com');
    await projectWork();
    const t = await taskOf(c.member);
    await submit(c.user, t);
    await poolReviewService.review(ctx.pool.id, (await latestSubmission(t)).id, { rating: 5, decision: 'approved', feedbackText: 'great' }, ctx.reviewer);
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    await poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin);
    await poolPlacementService.setTargets(ctx.pool.id, [{ memberId: c.member.id, clanId: ctx.clan.id }], ctx.admin);
    return c;
  }

  it('fails a full clan, then places safely on retry — once', async () => {
    const c = await selectedCandidate();
    // Fill the clan: one seat, already taken.
    await ctx.clan.update({ maxMentees: 1 });
    const sitting = await seed.createUser({ role: 'mentee', email: 'sitting@test.com' });
    await require('../../src/services/clanService').addMember(ctx.clan.id, { userId: sitting.id, role: 'mentee' });

    const blocked = await poolPlacementService.place(ctx.pool.id, {}, ctx.admin);
    expect(blocked.summary).toEqual({ placed: 0, alreadyPlaced: 0, failed: 1 });
    expect(blocked.results[0].code).toBe('clan_full');
    expect((await c.member.reload()).placement.status).toBe('failed');
    expect(c.member.placedAt).toBeNull();
    expect(c.member.decision).toBe('selected'); // selected stands while placement fails
    expect(await models.Enrollment.count({ where: { menteeId: c.user.id } })).toBe(0);

    await ctx.clan.update({ maxMentees: 2 });
    const placed = await poolPlacementService.place(ctx.pool.id, {}, ctx.admin);
    expect(placed.summary.placed).toBe(1);
    const retry = await poolPlacementService.place(ctx.pool.id, { memberIds: [c.member.id] }, ctx.admin);
    expect(retry.summary.placed).toBe(0);

    await c.member.reload();
    expect(c.member.placedAt).toBeTruthy();
    expect(await models.Enrollment.count({ where: { menteeId: c.user.id, programId: ctx.program.id } })).toBe(1);
    expect(await models.ClanMembership.count({ where: { userId: c.user.id, clanId: ctx.clan.id, role: 'mentee' } })).toBe(1);
    // Placement is what makes them a mentee.
    expect(await models.MenteeProfile.count({ where: { userId: c.user.id } })).toBe(1);
    expect(await authzService.getCapabilities(c.user)).toContain('mentee');
  });

  it('keeps qualifying work out of the new clan after placement', async () => {
    const c = await selectedCandidate();
    await poolPlacementService.place(ctx.pool.id, {}, ctx.admin);
    const task = await taskOf(c.member);
    expect(await authzService.canActOnTask(ctx.lead.id, task, P.TASK_REVIEW)).toBe(false);
    expect((await authzService.scopeOfAssignedTask(task.id)).clanId).toBeUndefined();
    const clanTasks = await taskService.getMenteeTasks(c.user.id, { clanId: ctx.clan.id });
    expect(JSON.stringify(clanTasks)).not.toContain(task.id);
  });

  it('refuses a clan with no lead mentor', async () => {
    const c = await selectedCandidate();
    const empty = await models.Clan.create({ programId: ctx.program.id, name: 'Empty', createdBy: ctx.admin.id });
    await poolPlacementService.setTargets(ctx.pool.id, [{ memberId: c.member.id, clanId: empty.id }], ctx.admin);
    const out = await poolPlacementService.place(ctx.pool.id, {}, ctx.admin);
    expect(out.results[0].code).toBe('no_mentor');
  });
});

describe('reminders', () => {
  it('sends a due-soon reminder once, and stops once the work is handed in', async () => {
    const orchestrator = require('../../src/services/notificationOrchestrator');
    const c = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(c.member);
    await PoolTask().update({ dueDate: new Date(Date.now() + 3600000) }, { where: { id: task.id } });

    orchestrator.dispatch.mockClear();
    expect((await poolReminderService.tick()).due_soon).toBe(1);
    expect((await poolReminderService.tick()).due_soon).toBe(0);

    // A second piece of work, handed in before the reminder pass: no reminder for it.
    const second = await poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'Essay', componentKey: 'project', assignTo: 'all' }, ctx.admin);
    const essay = await PoolTask().findOne({ where: { roadmapTaskId: second.assignment.roadmapTaskId } });
    await PoolTask().update({ dueDate: new Date(Date.now() + 3600000) }, { where: { id: essay.id } });
    await submit(c.user, essay);
    expect((await poolReminderService.tick()).due_soon).toBe(0);
  });

  it('stops for a withdrawn candidate and for a closed pool', async () => {
    const c = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(c.member);
    await PoolTask().update({ dueDate: new Date(Date.now() + 3600000) }, { where: { id: task.id } });

    await expect(poolMemberService.exit(ctx.pool.id, c.member.id, 'withdrawn', '', ctx.admin)).rejects.toThrow(/reason/);
    await poolMemberService.exit(ctx.pool.id, c.member.id, 'withdrawn', 'Took another offer', ctx.admin);
    expect((await task.reload()).status).toBe('cancelled');
    expect((await poolReminderService.tick()).due_soon).toBe(0);

    const d = await registerCandidate('d@test.com');
    await PoolTask().update({ dueDate: new Date(Date.now() + 3600000) }, { where: { poolMemberId: d.member.id } });
    await poolService.setStatus(ctx.pool.id, 'closed', ctx.admin);
    expect((await poolReminderService.tick()).due_soon).toBe(0);
  });
});

describe('pool permissions are scoped to the programme', () => {
  it('lists only the pools of programmes the person holds a pool permission at', async () => {
    const mine = await authzService.poolProgramScope(ctx.reviewer);
    expect(mine).toEqual([ctx.program.id]);
    expect(await poolService.listPools({ programIds: await authzService.poolProgramScope(ctx.outsider) })).toEqual([]);
    expect(await authzService.hasPoolAccess(ctx.reviewer)).toBe(true);
    // A pool reviewer is not an admin of anything else.
    expect(await authzService.hasAdminAccess(ctx.reviewer)).toBe(false);
    expect(await authzService.hasPoolAccess(ctx.lead)).toBe(false);
  });

  it('rejects a points curve that is not whole numbers, or is worth nothing', async () => {
    await expect(poolService.updatePool(ctx.pool.id, {
      scoringPolicy: { difficultyPoints: { medium: 2.5 } },
    }, ctx.admin)).rejects.toThrow(/whole number/i);
    await expect(poolService.updatePool(ctx.pool.id, {
      scoringPolicy: { difficultyPoints: { easy: 0, medium: 0, hard: 0, expert: 0 } },
    }, ctx.admin)).rejects.toThrow(/worth some points/i);
    // A partial curve keeps what it does not name.
    const updated = await poolService.updatePool(ctx.pool.id, { scoringPolicy: { difficultyPoints: { hard: 30 } } }, ctx.admin);
    expect(updated.scoringPolicy.difficultyPoints).toMatchObject({ easy: 5, medium: 10, hard: 30, expert: 40 });
  });
});

describe('lean storage: two tables, one column', () => {
  it('keeps the work list on the pool, and concurrent additions both survive', async () => {
    await Promise.all([
      poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'One' }, ctx.admin),
      poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'Two', componentKey: 'project' }, ctx.admin),
    ]);
    const pool = await models.CandidatePool.findByPk(ctx.pool.id);
    expect(pool.workItems.map((w) => w.title).sort()).toEqual(['One', 'Two']);
  });

  it('refuses to confirm a shortlist whose scores moved after it was generated', async () => {
    const a = await registerCandidate('a@test.com');
    await projectWork();
    const t = await taskOf(a.member);
    await submit(a.user, t);
    await poolReviewService.review(ctx.pool.id, (await latestSubmission(t)).id, { rating: 4, decision: 'approved', feedbackText: 'ok' }, ctx.reviewer);
    const { shortlist } = await poolScoringService.generate(ctx.pool.id, ctx.admin);

    // A new candidate's arrival changes the inputs after generation.
    await registerCandidate('late@test.com');
    await expect(poolScoringService.confirm(ctx.pool.id, shortlist.id, {}, ctx.admin)).rejects.toThrow(/changed/);

    // Generating again makes a new version; the first stays readable as superseded.
    const again = await poolScoringService.generate(ctx.pool.id, ctx.admin);
    expect(again.shortlist.version).toBe(2);
    const versions = await poolScoringService.listShortlists(ctx.pool.id);
    expect(versions.map((v) => v.status)).toEqual([again.shortlist.status, 'superseded']);
  });

  it('adds applicants to a pool without touching their applications', async () => {
    const cohort = await models.Cohort.create({ programId: ctx.program.id, name: 'Spring', status: 'open' });
    const app = await models.Application.create({ cohortId: cohort.id, email: 'applicant@test.com', firstName: 'Ana', source: 'manual', status: 'under_review' });
    const out = await poolMemberService.addFromApplications(ctx.pool.id, [app.id], ctx.admin);
    expect(out.summary.invited).toBe(1);
    expect((await app.reload()).status).toBe('under_review');
    expect(app.inviteId).toBeFalsy();
    const member = await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email: 'applicant@test.com' } });
    expect(member.applicationId).toBe(app.id);
    expect(member.details.source).toBe('application');
  });

  it('gathers applicants from cohorts of other programmes, only where the actor runs intake', async () => {
    const own = await models.Cohort.create({ programId: ctx.program.id, name: 'Spring', status: 'open' });
    const other = await models.Cohort.create({ programId: ctx.otherProgram.id, name: 'Autumn', status: 'open' });
    const a1 = await models.Application.create({ cohortId: own.id, email: 'one@test.com', firstName: 'One', source: 'manual', status: 'accepted' });
    const a2 = await models.Application.create({ cohortId: other.id, email: 'two@test.com', firstName: 'Two', source: 'manual', status: 'accepted' });

    // A workspace admin runs every intake: both cohorts land in the one pool.
    const out = await poolMemberService.addFromApplications(ctx.pool.id, [a1.id, a2.id], ctx.admin);
    expect(out.summary.invited).toBe(2);

    // Someone who manages this pool but not the other programme's intake cannot reach into it.
    const operator = await seed.createMentor({ email: 'operator@test.com' });
    await models.RoleAssignment.create({ userId: operator.id, role: 'pool_operator', scopeType: 'program', scopeId: ctx.program.id });
    const a3 = await models.Application.create({ cohortId: other.id, email: 'three@test.com', firstName: 'Three', source: 'manual', status: 'accepted' });
    await expect(poolMemberService.addFromApplications(ctx.pool.id, [a3.id], operator)).rejects.toThrow(/intake you do not run/);
    const allowed = await poolMemberService.applicationPrograms(ctx.pool, operator, [ctx.program.id, ctx.otherProgram.id]);
    expect([...allowed]).toEqual([ctx.program.id]);
  });
});

describe('the reads the screens make', () => {
  it('lists the review queue, opens a submission, and dates the candidate\'s history', async () => {
    const { user, member } = await registerCandidate('c1@test.com');
    await projectWork();
    const task = await taskOf(member);
    await submit(user, task);

    // task_submissions has no created_at — every read must order and date by submitted_at.
    const queue = await poolReviewService.queue(ctx.pool.id);
    expect(queue).toHaveLength(1);
    // The reviewer is told the stake: a hard piece of work, 20 points on the curve.
    expect(queue[0]).toMatchObject({ taskId: task.id, kind: 'task', title: 'Build an API', points: 20, required: true });
    expect(new Date(queue[0].submittedAt).getTime()).not.toBeNaN();

    const detail = await poolReviewService.detail(ctx.pool.id, queue[0].submissionId);
    expect(detail.versions).toHaveLength(1);
    expect(detail.task.acceptanceCriteria).toEqual(['Has tests']);

    const mine = await poolCandidateService.myTask(user.id, task.id);
    expect(mine.submissions).toHaveLength(1);
    expect(new Date(mine.submissions[0].submittedAt).getTime()).not.toBeNaN();

    // And the rest of what the pool screens load.
    await expect(poolService.dashboard(ctx.pool.id)).resolves.toBeTruthy();
    await expect(poolService.history(ctx.pool.id)).resolves.toBeTruthy();
    await expect(poolTaskService.listAssignments(ctx.pool.id)).resolves.toHaveLength(1);
    await expect(poolPlacementService.preview(ctx.pool.id)).resolves.toBeTruthy();
    await expect(poolCandidateService.myPools(user.id)).resolves.toHaveLength(1);
    await expect(poolCandidateService.myTasks(user.id)).resolves.toHaveLength(1);
  });
});
