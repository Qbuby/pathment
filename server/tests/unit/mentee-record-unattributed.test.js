/**
 * A mentee's record must account for every task, including the ones that
 * carry no clan.
 *
 * `assigned_tasks.clan_id` is nullable, and plenty of older work has it unset.
 * The record read only ever asked for `clan_id IN (their clans)`, so every one
 * of those rows vanished — the panel reported "0 of 0 tasks done" about a
 * mentee whose own profile listed twenty-three. Two reads of the same work
 * disagreeing is the bug; this pins the fix.
 *
 * Pure unit test: the database is mocked, so this asserts what the service
 * does with the rows rather than what a query returns.
 */
jest.mock('../../src/db', () => ({
  models: {
    User: { findByPk: jest.fn() },
    ClanMembership: { findAll: jest.fn(async () => []) },
    Clan: { findAll: jest.fn(async () => []) },
    AssignedTask: { findAll: jest.fn(async () => []) },
    Blocker: { findAll: jest.fn(async () => []), count: jest.fn(async () => 0) },
    CertificateInstance: { findAll: jest.fn(async () => []) },
    TaskSubmission: { findAll: jest.fn(async () => []) },
  },
}));
jest.mock('../../src/services/authzService', () => ({
  hasAdminAccess: jest.fn(async () => false),
  mentoredClanIds: jest.fn(async () => []),
}));

const { models } = require('../../src/db');
const authzService = require('../../src/services/authzService');
const service = require('../../src/services/menteeRecordService');

const MENTEE = '11111111-1111-4111-8111-111111111111';
const CLAN = '22222222-2222-4222-8222-222222222222';
const MENTOR = '33333333-3333-4333-8333-333333333333';
const OTHER_MENTOR = '44444444-4444-4444-8444-444444444444';

const actor = { id: MENTOR };

/** Rows the mentee's clan history is built from. */
function membershipIs(clanId) {
  models.ClanMembership.findAll.mockResolvedValue([{
    clanId,
    status: 'active',
    joinedAt: new Date('2026-01-01'),
    leftAt: null,
    clan: { id: clanId, name: 'MERN Fellows', kind: 'cohort', programId: 'p1', program: { id: 'p1', name: 'MERN' } },
  }]);
}

/**
 * Stand in for `AssignedTask.findAll`. The service calls it three times with
 * different shapes — the orphan-clan scan (grouped), the tally (raw) and the
 * task list — so each is answered on its own terms.
 */
function tasksAre(rows) {
  models.AssignedTask.findAll.mockImplementation(async (options = {}) => {
    if (options.group) return []; // DISTINCT clan_id scan for orphaned clans
    const where = options.where || {};
    // The unattributed tally asks for clanId: null explicitly.
    if (where.clanId === null) return rows.filter((r) => !r.clanId).map((r) => ({ status: r.status }));
    if (options.raw) return rows.map((r) => ({ menteeId: MENTEE, clanId: r.clanId, status: r.status }));
    return rows.map((r) => ({ ...r, roadmapTask: { title: r.title, type: 'project' }, toJSON: () => r }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  models.User.findByPk.mockResolvedValue({
    id: MENTEE, toJSON: () => ({ id: MENTEE, firstName: 'Mei', lastName: 'Lin' }),
  });
  models.Blocker.findAll.mockResolvedValue([]);
  models.Blocker.count.mockResolvedValue(0);
  models.CertificateInstance.findAll.mockResolvedValue([]);
  models.TaskSubmission.findAll.mockResolvedValue([]);
  authzService.hasAdminAccess.mockResolvedValue(false);
  authzService.mentoredClanIds.mockResolvedValue([CLAN]);
  membershipIs(CLAN);
});

describe('work with no clan', () => {
  it('is counted in the totals instead of disappearing', async () => {
    tasksAre([
      { id: 't1', clanId: null, mentorId: MENTOR, status: 'completed', title: 'Week 1' },
      { id: 't2', clanId: null, mentorId: MENTOR, status: 'in_progress', title: 'Week 2' },
      { id: 't3', clanId: null, mentorId: MENTOR, status: 'cancelled', title: 'Dropped' },
    ]);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.totals.tasksAssigned).toBe(3);
    expect(record.totals.tasksCompleted).toBe(1);
    // Cancelled work is not unfinished — the same rule the clan tally uses.
    expect(record.totals.tasksUnfinished).toBe(1);
  });

  it('is grouped on its own and never counted as a clan', async () => {
    tasksAre([{ id: 't1', clanId: null, mentorId: MENTOR, status: 'completed', title: 'Week 1' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);
    const loose = record.clans.find((c) => c.unattributed);

    expect(loose).toBeDefined();
    expect(loose.clanId).toBeNull();
    expect(loose.tasks).toHaveLength(1);
    // One real clan, plus a group that is not one.
    expect(record.clans).toHaveLength(2);
    expect(record.totals.clans).toBe(1);
  });

  it('comes last, after every real clan', async () => {
    tasksAre([
      { id: 't1', clanId: CLAN, mentorId: MENTOR, status: 'completed', title: 'In clan' },
      { id: 't2', clanId: null, mentorId: MENTOR, status: 'completed', title: 'Loose' },
    ]);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.clans.at(-1).unattributed).toBe(true);
    expect(record.clans[0].clanName).toBe('MERN Fellows');
  });

  it('withholds detail from a non-admin, because no clan means no clan to mentor', async () => {
    tasksAre([{ id: 't1', clanId: null, mentorId: OTHER_MENTOR, status: 'completed', title: 'Someone else set this' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);
    const loose = record.clans.find((c) => c.unattributed);

    expect(loose.visibility).toBe('summary');
    expect(loose.tasks[0].detail).toBe('titleOnly');
    expect(loose.tasks[0]).not.toHaveProperty('submissions');
  });

  it('still shows the viewer their own work in full, wherever it sits', async () => {
    tasksAre([{ id: 't1', clanId: null, mentorId: MENTOR, status: 'completed', title: 'You set this' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);
    const loose = record.clans.find((c) => c.unattributed);

    expect(loose.tasks[0].assignedByViewer).toBe(true);
    expect(loose.tasks[0].detail).toBe('full');
  });

  it('gives an admin the full tier on it', async () => {
    authzService.hasAdminAccess.mockResolvedValue(true);
    tasksAre([{ id: 't1', clanId: null, mentorId: OTHER_MENTOR, status: 'completed', title: 'Loose' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.clans.find((c) => c.unattributed).visibility).toBe('full');
  });

  it('is absent entirely when every task has a clan', async () => {
    tasksAre([{ id: 't1', clanId: CLAN, mentorId: MENTOR, status: 'completed', title: 'In clan' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.clans.some((c) => c.unattributed)).toBe(false);
    expect(record.totals.tasksAssigned).toBe(1);
  });

  it('reports loose work for a mentee who has never had a clan at all', async () => {
    models.ClanMembership.findAll.mockResolvedValue([]);
    tasksAre([{ id: 't1', clanId: null, mentorId: MENTOR, status: 'completed', title: 'Orphan' }]);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.clans).toHaveLength(1);
    expect(record.clans[0].unattributed).toBe(true);
    expect(record.totals.tasksAssigned).toBe(1);
  });

  it('counts open blockers that carry no clan', async () => {
    tasksAre([]);
    models.Blocker.count.mockResolvedValue(2);

    const record = await service.getMenteeRecord(MENTEE, actor);

    expect(record.totals.openBlockers).toBe(2);
    expect(record.clans.find((c) => c.unattributed).metrics.openBlockers).toBe(2);
  });
});
