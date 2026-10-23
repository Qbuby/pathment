'use strict';

/**
 * The ranking answers with the same shape whether or not anybody can be ranked.
 *
 * `ranking()` returns `{ ranked, notRanked, rankedCount }` — except that the
 * "nobody to rank" path returned a bare `[]`. A clan with no rankable mentees
 * therefore answered with an array where the caller was promised an object,
 * and the Top performers tab reads `board.ranked.length` to decide whether to
 * show its empty state. On an array that is `undefined.length`, so the one
 * screen whose job was to say "nobody here yet" was the only screen that could
 * not say it: the whole tab fell into the error boundary with "Something went
 * wrong".
 *
 * Seen in production on a clan with zero active mentees, while the sibling
 * clan with one mentee worked perfectly — which is exactly what makes this
 * kind of bug survive: it looks like it works.
 */

const { models } = require('../../src/db');
const service = require('../../src/services/performanceNominationService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

const RANKING_KEYS = ['ranked', 'notRanked', 'rankedCount'];

describe('top performer ranking shape', () => {
  let admin, mentor, program, emptyClan, populatedClan;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `tp-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `tp-mentor-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Qantara Fellowship' });

    emptyClan = await models.Clan.create({
      programId: program.id, name: 'Qantara 2', leadMentorId: mentor.id, createdBy: admin.id,
    });
    populatedClan = await models.Clan.create({
      programId: program.id, name: 'Qantara 1', leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(emptyClan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(populatedClan.id, { userId: mentor.id, role: 'lead_mentor' });

    const mentee = await createMentee({ email: `tp-mentee-${Date.now()}@test.com` });
    await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    await clanService.addMember(populatedClan.id, { userId: mentee.id, role: 'mentee' });
  });

  /** The case that broke. */
  it('returns the ranking object for a clan with nobody in it', async () => {
    const board = await service.ranking({ user: mentor, clanId: emptyClan.id, limit: 50 });

    expect(Array.isArray(board)).toBe(false);
    expect(Object.keys(board).sort()).toEqual([...RANKING_KEYS].sort());
    expect(board.ranked).toEqual([]);
    expect(board.notRanked).toEqual([]);
    expect(board.rankedCount).toBe(0);
  });

  /**
   * The page reads exactly this to choose between the empty state and the
   * table. It is the line that threw.
   */
  it('lets the caller measure both halves without checking the type first', async () => {
    const board = await service.ranking({ user: mentor, clanId: emptyClan.id, limit: 50 });
    expect(() => board.ranked.length + board.notRanked.length).not.toThrow();
    expect(board.ranked.length + board.notRanked.length).toBe(0);
  });

  it('returns the same shape for a clan that does have mentees', async () => {
    const board = await service.ranking({ user: mentor, clanId: populatedClan.id, limit: 50 });

    expect(Array.isArray(board)).toBe(false);
    expect(Object.keys(board).sort()).toEqual([...RANKING_KEYS].sort());
    // The mentee has no finished work, so they are listed as unrankable with a
    // reason rather than given a fabricated position.
    expect(board.ranked.length + board.notRanked.length).toBeGreaterThan(0);
  });

  it('still refuses a clan the caller does not mentor', async () => {
    const outsider = await createMentor({ email: `outsider-${Date.now()}@test.com` });
    await expect(
      service.ranking({ user: outsider, clanId: populatedClan.id, limit: 50 })
    ).rejects.toThrow(/do not mentor/i);
  });
});
