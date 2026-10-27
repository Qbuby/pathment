'use strict';

/**
 * The follow-up queue has to be able to see the people it exists to find.
 *
 * On a workspace of a thousand mentees it returned NOTHING, while the Overview
 * beside it advertised 49 high priority and 98 needing follow-up. Three
 * independent filters were stacking up, and between them they excluded every
 * mentee in the organisation:
 *
 *   1. `loadSnapshot` dropped STANDING clans, which is where 353 still-active
 *      people had been moved to when their programme ended;
 *   2. `membershipsByClan` loaded only ACTIVE memberships, so 465 PAUSED
 *      mentees were invisible on the one screen meant to notice them;
 *   3. `followUps` skipped FROZEN clans, which is where the 567 the Overview
 *      was counting actually lived.
 *
 * Each exclusion is defensible alone. Their union was everybody, and the screen
 * said "Nobody matches these filters right now" — which read as good news.
 *
 * Paused deserves its own mention: somebody who steps away stops generating the
 * signals risk is computed from, so they settle at 'low' and drop out of a
 * queue filtered on risk. config/membership.js says the whole point of pausing
 * is that somebody brings them back, so they belong here by definition.
 */

const { models } = require('../../src/db');
const clanHealthService = require('../../src/services/clanHealthService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

const idsIn = (result) => result.rows.map((r) => r.id);

describe('follow-up queue visibility', () => {
  let admin, mentor, program, frozenClan, standingClan, liveClan;
  let inFrozen, pausedMentee, inStanding;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `fu-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `fu-mentor-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });

    liveClan = await models.Clan.create({
      programId: program.id, name: 'Live Cohort', leadMentorId: mentor.id, createdBy: admin.id,
    });
    // Created live and frozen further down, because the roster of a historical
    // clan cannot be changed - which is the product rule, and the reason these
    // people are stranded in the first place.
    frozenClan = await models.Clan.create({
      programId: program.id, name: 'Finished Cohort', leadMentorId: mentor.id, createdBy: admin.id,
    });
    standingClan = await models.Clan.create({
      programId: program.id, name: 'Alumni Standing', kind: 'standing',
      leadMentorId: mentor.id, createdBy: admin.id,
    });

    const make = async (label, clan, status = 'active') => {
      const person = await createMentee({ email: `${label}-${Date.now()}-${Math.random()}@test.com` });
      await createEnrollment({ menteeId: person.id, programId: program.id, status: 'active' });
      await clanService.addMember(clan.id, { userId: person.id, role: 'mentee' });
      if (status !== 'active') {
        await models.ClanMembership.update(
          { status }, { where: { clanId: clan.id, userId: person.id, role: 'mentee' } },
        );
      }
      return person;
    };

    // Paused, inside a cohort that has finished: the most stranded person in
    // the system, and invisible under all three of the old filters at once.
    inFrozen = await make('frozen', frozenClan, 'paused');
    pausedMentee = await make('paused', liveClan, 'paused');
    inStanding = await make('standing', standingClan);
    await frozenClan.update({ frozenAt: new Date('2026-09-01') });
  });

  /** The headline: it must not come back empty when there are people in it. */
  it('does not report an empty queue while mentees exist in every clan kind', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    expect(result.total).toBeGreaterThan(0);
  });

  it('sees a paused mentee, who is the whole reason pausing exists', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    expect(idsIn(result)).toContain(pausedMentee.id);
  });

  it('gives a paused mentee a reason rather than a blank cell', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    const row = result.rows.find((r) => r.id === pausedMentee.id);
    expect(row.paused).toBe(true);
    expect(row.riskReason).toMatch(/paused/i);
  });

  it('can filter to the paused, who never register as a risk level', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50, risk: 'paused' }, null);
    // Both of them: the one in a live clan and the one stranded in a finished
    // cohort. Neither registers as a risk level, which is the point.
    expect(idsIn(result).sort()).toEqual([pausedMentee.id, inFrozen.id].sort());
  });

  /**
   * A cohort that ended is where most of the flagged people are, and the
   * Overview counts them. Hiding them here is what made the two screens
   * disagree.
   */
  it('no longer discards a clan because its cohort has finished', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    const clanNames = result.rows.flatMap((r) => r.clans.map((c) => c.name));
    expect(clanNames).toContain('Finished Cohort');
  });

  it('marks which clans are finished so the screen can say so', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    const row = result.rows.find((r) => r.id === inFrozen.id);
    expect(row.clans.some((c) => c.frozen === true)).toBe(true);
  });

  it('reaches into standing clans, where a continuing cohort lives', async () => {
    await models.ClanMembership.update(
      { status: 'paused' },
      { where: { clanId: standingClan.id, userId: inStanding.id, role: 'mentee' } },
    );
    const result = await clanHealthService.followUps({ page: 1, limit: 50 }, null);
    expect(idsIn(result)).toContain(inStanding.id);
  });

  it('still honours a clan filter', async () => {
    const result = await clanHealthService.followUps({ page: 1, limit: 50, clanId: liveClan.id }, null);
    expect(idsIn(result)).toEqual([pausedMentee.id]);
  });

  /**
   * The dashboards deliberately leave paused people out of clan averages, so
   * that widening the queue must not quietly move every clan's numbers.
   */
  it('leaves the health dashboards on their own narrower scope', async () => {
    const insights = await clanHealthService.orgInsights(null);
    expect(insights).toHaveProperty('clans');
    const standing = insights.clans.find((c) => c.name === 'Alumni Standing');
    expect(standing).toBeUndefined();
  });
});
