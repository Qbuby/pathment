'use strict';

/**
 * Pushing one block to a roster must not bulldoze the people who adapted it.
 *
 * `applySlotToAll` overwrote every copy unconditionally. A mentee who had moved
 * their deep-work block to the evening because that is when they actually work
 * would find it back at 10am, with no explanation and no sign it had happened.
 *
 * A mentor should not have to choose between keeping everyone in step and
 * respecting the few who have made it theirs — so they get both, and the names
 * of whoever was left alone.
 */

const { models } = require('../../src/db');
const templates = require('../../src/services/scheduleTemplateService');
const board = require('../../src/services/scheduleBoardService');
const clanService = require('../../src/services/clanService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('pushing a block to everyone', () => {
  const SLOT = 'slot-deep';
  let admin, mentor, steady, adapter, clan;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'apply-admin@test.com' });
    mentor = await createMentor({ email: 'apply-mentor@test.com' });
    steady = await createMentee({ email: 'apply-steady@test.com' });
    adapter = await createMentee({ email: 'apply-adapter@test.com' });

    const program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Apply clan', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    for (const m of [steady, adapter]) {
      await clanService.addMember(clan.id, { userId: m.id, role: 'mentee' });
      await models.MenteeSchedule.create({
        menteeId: m.id, clanId: clan.id, assignedBy: mentor.id,
        schedule: [{ id: SLOT, label: 'Deep work', time: '10:00', days: 'everyday', kind: 'empty' }],
      });
    }
  });

  const timeOf = async (menteeId) => {
    const b = await board.board(menteeId, { clanId: clan.id }, mentor);
    return b.slots.find((s) => s.id === SLOT)?.time;
  };

  it('applies to everyone who has not touched the block', async () => {
    const result = await templates.applySlotToAll(mentor.id, SLOT, { kind: 'empty' });
    expect(result.applied).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('leaves alone a mentee who made the block their own, and names them', async () => {
    await board.updateSlot(adapter.id, SLOT, { time: '19:00' }, adapter, clan.id);

    const result = await templates.applySlotToAll(mentor.id, SLOT, { kind: 'empty' });
    expect(result.applied).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ menteeId: adapter.id, reason: 'they changed this block' });
    // Their evening is still their evening.
    expect(await timeOf(adapter.id)).toBe('19:00');
    expect(await timeOf(steady.id)).toBe('10:00');
  });

  it('never touches a block the mentee made themselves', async () => {
    const own = await board.addSlot(adapter.id, { label: 'My own', time: '21:00' }, adapter, clan.id);
    const result = await templates.applySlotToAll(mentor.id, own.id, { kind: 'empty' });
    expect(result.applied).toBe(0);
    expect(result.skipped[0]).toMatchObject({ reason: 'their own block' });
  });

  /** The override exists — it just has to be asked for. */
  it('still resets everybody when the mentor explicitly forces it', async () => {
    await board.updateSlot(adapter.id, SLOT, { time: '19:00' }, adapter, clan.id);
    const result = await templates.applySlotToAll(mentor.id, SLOT, { kind: 'empty' }, null, { force: true });
    expect(result.applied).toBe(2);
    expect(result.skipped).toEqual([]);
  });
});
