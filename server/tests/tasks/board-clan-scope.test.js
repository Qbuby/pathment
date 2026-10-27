/**
 * A mentee moved into a standing clan opens their day and finds the previous
 * clan's work in it.
 *
 * Two faults, both in `scheduleBoardService.board`:
 *   1. `_scheduleRow` fell back to "any row this mentee has" when the clan had
 *      none, so the new clan rendered the old clan's blocks.
 *   2. the task query scoped by the schedule ROW's clan, so a clan with no row
 *      — or a legacy row carrying no clan — applied no clan filter at all.
 *
 * Mocked DB: these assert the WHERE clause the service builds, which is where
 * both faults lived.
 */
jest.mock('../../src/db', () => ({
  sequelize: { escape: (v) => `'${v}'` },
  models: {
    MenteeSchedule: { findOne: jest.fn() },
    AssignedTask: { findAll: jest.fn(async () => []) },
    UserSettings: { findOne: jest.fn(async () => ({ timezone: 'UTC' })) },
    ClanMembership: { findAll: jest.fn(async () => []) },
  },
}));
jest.mock('../../src/services/authzService', () => ({
  can: jest.fn(async () => true),
  requireCan: jest.fn(async () => true),
}));
jest.mock('../../src/services/clanLifecycleService', () => ({ assertClanWritable: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const board = require('../../src/services/scheduleBoardService');

const MENTEE = 'mentee-1';
const COHORT = '11111111-1111-4111-8111-111111111111';
const STANDING = '22222222-2222-4222-8222-222222222222';
const ACTOR = { id: MENTEE, role: 'mentee' };

/** Pretend the mentee holds these clan memberships. */
function memberships(...clanIds) {
  models.ClanMembership.findAll.mockResolvedValue(
    clanIds.map((clanId, i) => ({ id: `m${i}`, clanId, enrollmentId: null, status: 'active' })),
  );
}

const taskWhere = () => models.AssignedTask.findAll.mock.calls[0][0].where;
const scheduleWhere = () => models.MenteeSchedule.findOne.mock.calls[0][0].where;

beforeEach(() => {
  jest.clearAllMocks();
  models.MenteeSchedule.findOne.mockResolvedValue(null);
  models.AssignedTask.findAll.mockResolvedValue([]);
});

test('the standing clan with no schedule row asks only for that clan', async () => {
  // Previously: no row → no clan filter → every task the mentee ever had.
  memberships(COHORT, STANDING);
  await board.board(MENTEE, { clanId: STANDING }, ACTOR);

  expect(taskWhere().clanId).toBe(STANDING);
  expect(taskWhere().menteeId).toBe(MENTEE);
});

test('a clan with no schedule row does not borrow another clan\'s', async () => {
  // Previously: `row || findOne({ menteeId })` handed back the old clan's row,
  // so the new clan rendered the old clan's blocks.
  memberships(COHORT, STANDING);
  await board.board(MENTEE, { clanId: STANDING }, ACTOR);

  expect(scheduleWhere().clanId).toBe(STANDING);
  expect(models.MenteeSchedule.findOne).toHaveBeenCalledTimes(1);
});

test('the clan filter is not taken from the schedule row', async () => {
  // A legacy row carrying a different clan must not decide what the day shows.
  memberships(COHORT, STANDING);
  models.MenteeSchedule.findOne.mockResolvedValue({ clanId: COHORT, schedule: [], templateId: null });

  await board.board(MENTEE, { clanId: STANDING }, ACTOR);
  expect(taskWhere().clanId).toBe(STANDING);
});

test('a mentee in exactly one clan needs no clan stated', async () => {
  memberships(COHORT);
  await board.board(MENTEE, {}, ACTOR);
  // One membership → legacy rows with no clan can only belong here, so the
  // filter is an OR rather than a bare equality. Both arms name this clan.
  const where = taskWhere();
  expect(JSON.stringify(where[Op.or] ?? where.clanId)).toContain(COHORT);
});

test('every other condition survives the clan filter', async () => {
  // The clan filter contributes its own OR for legacy rows; the slot and
  // occurrence groups must not be overwritten by it.
  memberships(COHORT);
  await board.board(MENTEE, { clanId: COHORT }, ACTOR);

  const and = taskWhere()[Op.and];
  expect(Array.isArray(and)).toBe(true);
  expect(and).toHaveLength(2);
  // occurrence group, then the in-a-block / waiting-to-be-planned group
  expect(and[0][Op.or]).toHaveLength(2);
  expect(and[1][Op.or]).toHaveLength(2);
});
