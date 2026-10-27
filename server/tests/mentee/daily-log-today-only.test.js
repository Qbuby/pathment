'use strict';

/**
 * A day closes when the day closes.
 *
 * The daily log took the date from the request body and wrote it exactly as
 * sent. No check that it was today, or even that it had happened yet. The
 * mentee page offered this as a feature — a strip of the last ten days and
 * "Missed a day? Tap it and backfill" — and every backfilled row went through
 * `updateStreak` on the way in.
 *
 * So the streak, the "logged 3 of 6 days" line a mentor reads on review, and
 * the gaps that are the whole point of keeping a log could all be composed
 * after the fact, on the morning of the review. A log you can fill in later
 * measures nothing.
 *
 * The day is the server's to decide now, from the mentee's own timezone. A
 * `dateKey` in the body is ignored rather than rejected: the client's idea of
 * today comes from the browser clock and the server's from the stored zone,
 * and near midnight those legitimately disagree — refusing the save would
 * block a real check-in over a difference of opinion about what time it is.
 */

const dailyLogService = require('../../src/services/dailyLogService');
const { models } = require('../../src/db');
const { shiftDayKey } = require('../../src/services/streak');
const { cleanDb, createMentee } = require('../helpers/seed');
const { todayInZone } = require('../../src/utils/timezone');

describe('the daily log writes today and only today', () => {
  let mentee;

  beforeEach(async () => {
    await cleanDb();
    mentee = await createMentee();
    await models.MenteeProfile.findOrCreate({ where: { userId: mentee.id } });
    await models.UserSettings.findOrCreate({
      where: { userId: mentee.id },
      defaults: { userId: mentee.id, timezone: 'UTC' },
    });
  });

  const today = () => todayInZone('UTC');

  it('ignores a date in the body and stores today', async () => {
    const lastTuesday = shiftDayKey(today(), -5);
    const entry = await dailyLogService.upsert(mentee.id, {
      dateKey: lastTuesday,
      tasksDone: [],
      slotsDone: [],
      note: 'claiming a day I did not log',
    });

    expect(entry.dateKey).toBe(today());
    await expect(
      models.DailyLogEntry.count({ where: { menteeId: mentee.id, dateKey: lastTuesday } }),
    ).resolves.toBe(0);
  });

  it('cannot be used to claim a day that has not happened', async () => {
    const entry = await dailyLogService.upsert(mentee.id, {
      dateKey: shiftDayKey(today(), 3),
      tasksDone: [],
      slotsDone: [],
      note: 'logging Thursday on Monday',
    });

    expect(entry.dateKey).toBe(today());
    await expect(
      models.DailyLogEntry.count({
        where: { menteeId: mentee.id, dateKey: shiftDayKey(today(), 3) },
      }),
    ).resolves.toBe(0);
  });

  it('still upserts, so saving twice in a day is one row', async () => {
    await dailyLogService.upsert(mentee.id, { tasksDone: [], slotsDone: [], note: 'first' });
    const second = await dailyLogService.upsert(mentee.id, {
      tasksDone: [], slotsDone: [], note: 'corrected',
    });

    expect(second.note).toBe('corrected');
    await expect(
      models.DailyLogEntry.count({ where: { menteeId: mentee.id } }),
    ).resolves.toBe(1);
  });

  it('a backdated post cannot inflate the streak', async () => {
    // Six days of history that never happened, posted one after another.
    for (let back = 6; back >= 1; back -= 1) {
      await dailyLogService.upsert(mentee.id, {
        dateKey: shiftDayKey(today(), -back),
        tasksDone: [], slotsDone: [], note: 'invented',
      });
    }

    const rows = await models.DailyLogEntry.findAll({
      where: { menteeId: mentee.id }, attributes: ['dateKey'], raw: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].dateKey).toBe(today());

    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(profile.currentStreakDays).toBe(1);
  });
});
