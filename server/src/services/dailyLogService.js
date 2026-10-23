const { models } = require('../db');
const { todayInZone } = require('../utils/timezone');
const { resolveMenteeClanId, listMenteeClans, clanScopedWhere } = require('./menteeClanScope');
const clanLifecycleService = require('./clanLifecycleService');

/** Daily check-in log (one entry per mentee per day, upserted). */
class DailyLogService {
  /** Today in the MENTEE's own zone. Never UTC, and never the client's word for it. */
  async _todayFor(menteeId) {
    const settings = await models.UserSettings.findOne({
      where: { userId: menteeId }, attributes: ['timezone'],
    });
    return todayInZone(settings?.timezone || 'UTC');
  }

  /**
   * Record today's check-in.
   *
   * The day is decided here, not by the caller. It used to arrive in the body
   * as `dateKey` and was written exactly as sent, so anybody could POST last
   * Tuesday and have it stored, counted in "logged 3 of 6 days", and fed to
   * `updateStreak` — and the daily-log page offered that as a feature, with a
   * strip of the last ten days and "Missed a day? Tap it and backfill."
   *
   * A log you can fill in afterwards measures nothing. The gaps are the point:
   * a mentor reading four filled days and two empty ones learns something real,
   * and they can only trust it if a day closes when the day closes.
   *
   * `dateKey` is still accepted and ignored rather than rejected, deliberately.
   * The client's idea of today comes from the browser's clock and the server's
   * from the mentee's stored zone; near midnight those legitimately disagree,
   * and refusing the save would block a real check-in to punish a difference of
   * opinion about what time it is. Ignoring it cannot be wrong — the entry
   * lands on the mentee's actual today either way.
   *
   * @param {string} menteeId
   * @param {object} entry
   */
  async upsert(menteeId, { tasksDone, slotsDone, note, clanId: requestedClanId }) {
    const dateKey = await this._todayFor(menteeId);
    const clanId = await resolveMenteeClanId(menteeId, requestedClanId);
    await clanLifecycleService.assertClanWritable(clanId);
    const memberships = await listMenteeClans(menteeId);
    const where = clanScopedWhere({ menteeId, dateKey }, clanId, memberships.length);
    const tasks = Array.isArray(tasksDone) ? tasksDone : [];
    const slots = Array.isArray(slotsDone) ? slotsDone : [];
    let entry = await models.DailyLogEntry.findOne({ where });
    if (entry) {
      entry.tasksDone = tasks;
      entry.slotsDone = slots;
      entry.note = note ?? null;
      entry.loggedAt = new Date();
      if (clanId) entry.clanId = clanId;
      await entry.save();
    } else {
      entry = await models.DailyLogEntry.create({ menteeId, dateKey, tasksDone: tasks, slotsDone: slots, note: note ?? null, clanId: clanId || null });
    }

    // Logging a day is what a streak is made of, and nothing here used to say
    // so: the counter on the profile was only ever moved when a mentor
    // approved a submission, so a mentee could log every day for a fortnight
    // and still be told their streak was zero. Required here rather than at
    // the top of the file because gamification reaches back into this one.
    //
    // Deliberately not fatal. A streak is worth less than the log entry it
    // counts, and refusing to save somebody's day because a badge check threw
    // would be the wrong way round.
    try {
      await require('./gamificationService').updateStreak(menteeId);
    } catch (error) {
      console.error('[DailyLog] Could not update the streak:', error.message);
    }

    return entry;
  }

  async list(menteeId, limit = 14, clanId = null) {
    const resolved = await resolveMenteeClanId(menteeId, clanId);
    const memberships = await listMenteeClans(menteeId);
    return models.DailyLogEntry.findAll({
      where: clanScopedWhere({ menteeId }, resolved, memberships.length),
      order: [['dateKey', 'DESC']],
      limit
    });
  }
}

module.exports = new DailyLogService();
