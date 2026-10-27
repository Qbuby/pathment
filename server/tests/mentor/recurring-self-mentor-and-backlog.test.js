'use strict';

/**
 * Two things that made repeating tasks stop working, pinned.
 *
 * 1. SELF-MENTORING. `taskService._isMentorForMentee` refuses when the mentor
 *    and the mentee are the same person, and must keep refusing: a co-mentor of
 *    the clan they also learn in matches every clan check after it, so without
 *    that line they could assign their own work and then review it.
 *
 *    What it was never meant to judge is a scheduler acting on a repeat
 *    somebody set earlier. Core team members are exactly the overlapping case -
 *    `co_mentor` and `mentee` in one standing clan - so every occurrence the
 *    materialiser computed for them was refused with "You are not the mentor
 *    for this mentee", once per occurrence, once an hour, into the log and
 *    nowhere a human would look. Fourteen refusals in one tick on production,
 *    and the mentor screen still read "Repeats every weekday".
 *
 * 2. BACKLOG. A repeat is a standing instruction, not a licence to pile up.
 *    Somebody who stopped submitting for a month came back to twenty-two open
 *    tasks, every one overdue.
 *
 * Unit test: the database is mocked, so this asserts who the occurrence is
 * assigned BY and whether it is created at all, not what a query returns.
 */

const mockModels = {
  Clan: { findByPk: jest.fn() },
  ClanMembership: { findAll: jest.fn(async () => []) },
  AssignedTask: { findAll: jest.fn(async () => []), count: jest.fn(async () => 0) },
  Notification: { findOne: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  User: { findByPk: jest.fn(async () => ({ firstName: 'Sher', lastName: 'Yar' })) },
};

jest.mock('../../src/db', () => ({
  models: mockModels,
  sequelize: { transaction: jest.fn(async (fn) => fn('tx')), query: jest.fn(async () => []) },
}));
jest.mock('../../src/services/taskService', () => ({
  createCustomTask: jest.fn(async () => ({ id: 'created' })),
}));

const taskService = require('../../src/services/taskService');
const materializer = require('../../src/services/recurringSlotMaterializer');

const MENTEE = 'mentee-1';
const LEAD = 'lead-1';
const CO = 'co-1';
const CLAN = 'clan-1';
const SLOT = 'slot-0';

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

/** A repeat on every day of the week, so occurrences land inside the horizon. */
const everyDay = (overrides = {}) => ({
  title: '5 x 3 Talks',
  type: 'discussion',
  startsOn: tomorrow(),
  timeLocal: '09:00',
  timezone: 'UTC',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  intervalWeeks: 1,
  dueOffsetDays: 7,
  ...overrides,
});

const assignedBy = () => [...new Set(taskService.createCustomTask.mock.calls.map((c) => c[1]))];

beforeEach(() => {
  jest.clearAllMocks();
  mockModels.Clan.findByPk.mockResolvedValue({ kind: 'standing', frozenAt: null, leadMentorId: LEAD });
  mockModels.ClanMembership.findAll.mockResolvedValue([]);
  mockModels.AssignedTask.findAll.mockResolvedValue([]);
  mockModels.AssignedTask.count.mockResolvedValue(0);
  mockModels.Notification.findOne.mockResolvedValue(null);
});

describe('who a recurring occurrence is assigned by', () => {
  it('leaves a real mentor alone', async () => {
    const result = await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    expect(result.createdForSlot).toBeGreaterThan(0);
    expect(assignedBy()).toEqual([LEAD]);
  });

  it('hands a self-assigned repeat to the clan lead instead of failing', async () => {
    // The production case: the slot's mentorId IS the mentee, because a core
    // team member set a repeat on their own task.
    const result = await materializer._materialize(MENTEE, MENTEE, SLOT, everyDay(), CLAN);
    expect(result.createdForSlot).toBeGreaterThan(0);
    expect(assignedBy()).toEqual([LEAD]);
  });

  it('falls back to the most senior other mentor when the lead is the mentee too', async () => {
    mockModels.Clan.findByPk.mockResolvedValue({ kind: 'standing', frozenAt: null, leadMentorId: MENTEE });
    mockModels.ClanMembership.findAll.mockResolvedValue([
      { userId: CO, role: 'co_mentor' },
      { userId: 'core-1', role: 'core_team' },
    ]);

    await materializer._materialize(MENTEE, MENTEE, SLOT, everyDay(), CLAN);
    expect(assignedBy()).toEqual(['core-1']);   // core_team outranks co_mentor
  });

  it('skips the slot when the clan holds nobody but the mentee', async () => {
    mockModels.Clan.findByPk.mockResolvedValue({ kind: 'standing', frozenAt: null, leadMentorId: MENTEE });
    mockModels.ClanMembership.findAll.mockResolvedValue([]);

    const result = await materializer._materialize(MENTEE, MENTEE, SLOT, everyDay(), CLAN);
    expect(result).toMatchObject({ createdForSlot: 0, skipped: 'no-mentor' });
    expect(taskService.createCustomTask).not.toHaveBeenCalled();
  });
});

describe('a repeat that is piling up', () => {
  it('keeps creating while the mentee is behind by less than the limit', async () => {
    mockModels.AssignedTask.count.mockResolvedValue(2);
    const result = await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    expect(result.createdForSlot).toBeGreaterThan(0);
    expect(result.pausedForBacklog).toBeUndefined();
  });

  it('stops creating once too many past-due occurrences are unsubmitted', async () => {
    mockModels.AssignedTask.count.mockResolvedValue(3);
    const result = await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    expect(result.createdForSlot).toBe(0);
    expect(result.pausedForBacklog).toBe(3);
    expect(taskService.createCustomTask).not.toHaveBeenCalled();
  });

  it('counts only past-due, unsubmitted occurrences of this one slot', async () => {
    mockModels.AssignedTask.count.mockResolvedValue(3);
    await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);

    const { where } = mockModels.AssignedTask.count.mock.calls[0][0];
    expect(where.menteeId).toBe(MENTEE);
    expect(where.scheduleSlotId).toBe(SLOT);
    const statuses = where.status[Object.getOwnPropertySymbols(where.status)[0]];
    expect(statuses).toEqual(['assigned', 'not_started', 'in_progress', 'revision_needed']);
    expect(where.dueDate).toBeDefined();
  });

  it('tells the mentor once, not once an hour', async () => {
    mockModels.AssignedTask.count.mockResolvedValue(5);
    await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    expect(mockModels.Notification.create).toHaveBeenCalledTimes(1);
    expect(mockModels.Notification.create.mock.calls[0][0]).toMatchObject({
      userId: LEAD,
      audience: 'mentor',
      relatedEntityType: 'recurring_backlog',
      relatedEntityId: MENTEE,
    });

    // A notice already sent this week means no second one.
    jest.clearAllMocks();
    mockModels.Clan.findByPk.mockResolvedValue({ kind: 'standing', frozenAt: null, leadMentorId: LEAD });
    mockModels.AssignedTask.count.mockResolvedValue(5);
    mockModels.AssignedTask.findAll.mockResolvedValue([]);
    mockModels.Notification.findOne.mockResolvedValue({ id: 'already' });
    await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    expect(mockModels.Notification.create).not.toHaveBeenCalled();
  });

  it('never notifies the mentee about their own backlog', async () => {
    // The self-assigned case resolves to the lead, so the notice goes there.
    mockModels.AssignedTask.count.mockResolvedValue(4);
    await materializer._materialize(MENTEE, MENTEE, SLOT, everyDay(), CLAN);
    const recipients = mockModels.Notification.create.mock.calls.map((c) => c[0].userId);
    expect(recipients).not.toContain(MENTEE);
  });
});

describe('how far ahead a repeat may run', () => {
  it('never materialises more than a week out', async () => {
    await materializer._materialize(MENTEE, LEAD, SLOT, everyDay(), CLAN);
    const dates = taskService.createCustomTask.mock.calls.map((c) => c[0].occurrenceDate).sort();
    const horizon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates[dates.length - 1] <= horizon).toBe(true);
  });
});
