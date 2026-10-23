const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { todayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const clanLifecycleService = require('./clanLifecycleService');

const MAX_NOTE_LENGTH = 2000;
/** How far back the log window ever reaches. Keeps an ancient assignment from drawing a hundred rows. */
const MAX_DAYS = 30;

/**
 * While the work is still in the mentee's hands, the log is theirs to write:
 * today's line, and any day they meant to write and did not.
 *
 * The moment it is handed over it freezes. That is the line this feature needs
 * — not "today only", which makes an honest mentee's forgotten Tuesday
 * unrecoverable, and not "always", which lets the week be composed the morning
 * of the review. A record a mentor is reading is only worth reading if nobody
 * can tidy it while they read it.
 */
const OPEN_STATUSES = ['assigned', 'in_progress', 'revision_needed'];
const CLOSED_BECAUSE = {
  submitted: 'Your mentor has this now, so the log is closed.',
  completed: 'This task is finished, so its log is closed.',
  cancelled: 'This task was cancelled, so its log is closed.',
};
const closedBecause = (status) => (OPEN_STATUSES.includes(status)
  ? null
  : CLOSED_BECAUSE[status] || 'This task is closed, so its log cannot change.');

/**
 * taskProgressService - a mentee's day-by-day notes on one assigned task.
 *
 * The point of the feature is not "did they finish", it is "is this going badly
 * and can we tell before the deadline". A four day task with nothing written on
 * days one and two IS the signal, so gaps are preserved and surfaced rather than
 * collapsed away.
 *
 * Writing TODAY's progress also upserts the day's DailyLogEntry, so logging on
 * the task counts toward the streak. That is the point of putting it here: the
 * daily log stops being a chore on a separate page and happens where the work
 * happens. Filling in an earlier day does not move the streak — see log().
 */
class TaskProgressService {
  /** The mentee's own timezone. Every day boundary in here is theirs, not UTC's and not the browser's. */
  async _zoneFor(menteeId) {
    const settings = await models.UserSettings.findOne({ where: { userId: menteeId }, attributes: ['timezone'] });
    return settings?.timezone || 'UTC';
  }

  /** Today's calendar day in the MENTEE's own timezone, never UTC and never the client's word. */
  async _todayFor(menteeId) {
    return todayInZone(await this._zoneFor(menteeId));
  }

  /**
   * The span the log covers: the day work started through today, stretched to
   * the deadline if that is further out, and capped at MAX_DAYS.
   */
  _window(task, today, firstEntryKey = null) {
    const keyOf = (d) => new Date(d).toISOString().split('T')[0];
    const started = task.startedAt ? keyOf(task.startedAt)
      : (task.assignedAt ? keyOf(task.assignedAt) : today);
    let from = firstEntryKey && firstEntryKey < started ? firstEntryKey : started;
    let to = today;
    if (task.dueDate) {
      const due = keyOf(task.dueDate);
      if (due > to) to = due;
    }
    if (this._daysBetween(from, to) > MAX_DAYS) from = this._shift(to, -MAX_DAYS);
    return { from, to };
  }

  /**
   * The earliest day a note may be attached to: the day the task reached this
   * mentee, and never more than MAX_DAYS back.
   *
   * Deliberately NOT `startedAt`, which the reading window uses. The first
   * save stamps `startedAt` with today, so a mentee catching up on three
   * missed days would find the first two refused the moment they wrote the
   * third. Assignment is the fact that does not move.
   */
  _writeFloor(task, today) {
    const keyOf = (d) => new Date(d).toISOString().split('T')[0];
    const landed = task.assignedAt ? keyOf(task.assignedAt)
      : (task.startedAt ? keyOf(task.startedAt) : today);
    const capped = this._shift(today, -MAX_DAYS);
    return landed > capped ? landed : capped;
  }

  /**
   * Which day a note belongs to.
   *
   * No date means today, which is almost always what is meant. A date is
   * honoured only if this task has actually lived through it: you can fill in
   * the Tuesday you forgot, you cannot write tomorrow, and you cannot write a
   * day before the task existed.
   */
  _resolveDay(task, today, requested) {
    if (!requested) return today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) throw new ValidationError('That is not a date');
    if (requested > today) throw new ValidationError('You cannot log a day that has not happened yet');
    if (requested < this._writeFloor(task, today)) {
      throw new ValidationError('That day is before this task started');
    }
    return requested;
  }

  /** Whole days between two 'YYYY-MM-DD' keys. Date arithmetic on a label, so UTC is correct here. */
  _daysBetween(fromKey, toKey) {
    const a = new Date(`${fromKey}T00:00:00Z`).getTime();
    const b = new Date(`${toKey}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86400000);
  }

  /**
   * The task, if this mentee owns it. Ownership is checked against the task's
   * menteeId, not against "is a mentee" - otherwise any mentee could write on
   * anyone's task.
   */
  async _ownedTask(menteeId, assignedTaskId) {
    const task = await models.AssignedTask.findByPk(assignedTaskId, {
      // organizationId: tenant guard; enrollmentId: frozen-program fallback when clanId is null.
      attributes: ['id', 'organizationId', 'menteeId', 'clanId', 'enrollmentId', 'status', 'dueDate', 'assignedAt', 'startedAt'],
    });
    if (!task) throw new NotFoundError('Task not found');
    if (task.menteeId !== menteeId) throw new ForbiddenError('This task is not yours');
    return task;
  }

  /**
   * Record or replace one day's progress on a task.
   *
   * Upsert rather than append: several entries in one day turns a timeline into
   * a chat log and makes "logged 3 of 4 days" meaningless.
   *
   * `dateKey` is optional and means "this line belongs to that day". It is
   * accepted while the task is still open and refused once it is not, which is
   * the whole policy in one sentence.
   */
  async log(menteeId, assignedTaskId, { note, minutesSpent = null, dateKey: requestedDay = null } = {}) {
    const text = typeof note === 'string' ? note.trim() : '';
    if (!text) throw new ValidationError('Write a line about what you did');
    if (text.length > MAX_NOTE_LENGTH) {
      throw new ValidationError(`Keep it under ${MAX_NOTE_LENGTH} characters`);
    }

    const task = await this._ownedTask(menteeId, assignedTaskId);
    await clanLifecycleService.assertTaskWritable(task);
    const closed = closedBecause(task.status);
    if (closed) throw new ValidationError(closed);

    const zone = await this._zoneFor(menteeId);
    const today = todayInZone(zone);
    const dateKey = this._resolveDay(task, today, requestedDay);
    const minutes = minutesSpent == null ? null : Math.max(0, Math.min(24 * 60, parseInt(minutesSpent, 10) || 0));

    const existing = await models.TaskProgressEntry.findOne({ where: { assignedTaskId, dateKey } });
    let entry;
    if (existing) {
      await existing.update({ note: text, minutesSpent: minutes });
      entry = existing;
    } else {
      entry = await models.TaskProgressEntry.create({
        assignedTaskId, menteeId, dateKey, note: text, minutesSpent: minutes,
      });
    }

    // Working on a task IS showing up that day. Upserting the daily log here is
    // what lets the streak count it, and is the reason this lives on the task
    // rather than on a separate page.
    //
    // Only today, though. Filling in a day you missed is honest bookkeeping on
    // the task; it is not retroactively having shown up. Crediting it would let
    // a fortnight's streak be assembled in one sitting, which is exactly why
    // the daily log stopped taking a date from the client in the first place.
    //
    // Deliberately not fatal: a streak is worth less than the note it counts,
    // and refusing to save somebody's progress because a badge check threw would
    // be the wrong way round.
    if (dateKey === today) {
      try {
        await this._creditDay(menteeId, dateKey, task.clanId);
      } catch (error) {
        console.error('[taskProgress] Could not credit the day:', error.message);
      }
    }

    // A task with progress on it is in progress, whatever it said before.
    if (task.status === 'assigned') {
      await task.update({ status: 'in_progress', startedAt: task.startedAt || new Date() });
    }

    return this._shape(entry, zone);
  }

  /**
   * Make sure the day exists in the daily log, then recount the streak.
   * Does NOT touch `tasksDone`: that array means "ticked complete today", which
   * is a different fact from "worked on it today". Conflating them would put two
   * meanings in one column.
   */
  async _creditDay(menteeId, dateKey, clanId) {
    const [day, created] = await models.DailyLogEntry.findOrCreate({
      where: { menteeId, dateKey, clanId: clanId || null },
      defaults: { menteeId, dateKey, clanId: clanId || null, tasksDone: [], slotsDone: [], note: null },
    });
    if (!created) await day.update({ loggedAt: new Date() });
    await require('./gamificationService').updateStreak(menteeId);
  }

  /**
   * The timeline for a task, oldest first, with the empty days left IN.
   *
   * The gaps are the signal. A mentor seeing three filled days and one hollow one
   * learns more than any status field, so this returns the full span from the day
   * work started to today (or the due date, whichever is later) rather than only
   * the days that have an entry.
   */
  async listForTask(assignedTaskId, { menteeId } = {}) {
    const task = await models.AssignedTask.findByPk(assignedTaskId, {
      attributes: ['id', 'menteeId', 'assignedAt', 'startedAt', 'dueDate', 'status'],
    });
    if (!task) throw new NotFoundError('Task not found');

    const entries = await models.TaskProgressEntry.findAll({
      where: { assignedTaskId },
      order: [['dateKey', 'ASC']],
    });

    const zone = await this._zoneFor(menteeId || task.menteeId);
    const today = todayInZone(zone);

    // The window: from the first thing that happened, to today or the deadline.
    const firstEntry = entries.length ? entries[0].dateKey : null;
    const { from, to } = this._window(task, today, firstEntry);

    const byDate = new Map(entries.map((e) => [e.dateKey, e]));
    const days = [];
    for (let cursor = from; cursor <= to; cursor = this._shift(cursor, 1)) {
      const entry = byDate.get(cursor);
      days.push({
        dateKey: cursor,
        isToday: cursor === today,
        isFuture: cursor > today,
        entry: entry ? this._shape(entry, zone) : null,
      });
    }

    const loggedDays = entries.length;
    const elapsed = days.filter((d) => !d.isFuture).length;
    const closed = closedBecause(task.status);
    return {
      days,
      // Whether the mentee may still write here, and the reason if not. The
      // client draws its edit affordances from this rather than re-deriving
      // the rule and drifting from it.
      canLog: !closed,
      closedBecause: closed,
      summary: {
        loggedDays,
        elapsedDays: elapsed,
        // The sentence a mentor actually reads on the review screen.
        label: elapsed > 0 ? `logged ${loggedDays} of ${elapsed} day${elapsed === 1 ? '' : 's'}` : 'not started',
        lastNote: entries.length ? entries[entries.length - 1].note : null,
        lastLoggedOn: entries.length ? entries[entries.length - 1].dateKey : null,
      },
    };
  }

  _shift(dateKey, offsetDays) {
    const d = new Date(`${dateKey}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }

  /** The mentor's read. Same data, and the same permission the rest of the mentor surface uses. */
  async listForMentor(user, assignedTaskId) {
    const task = await models.AssignedTask.findByPk(assignedTaskId, { attributes: ['id', 'menteeId'] });
    if (!task) throw new NotFoundError('Task not found');
    if (!(await authzService.canViewMentee(user, task.menteeId))) {
      throw new ForbiddenError('You do not mentor this person');
    }
    return this.listForTask(assignedTaskId, { menteeId: task.menteeId });
  }

  /**
   * Drop one day from the log.
   *
   * Same line as writing: while the task is still the mentee's, any day in it
   * can be corrected or taken back; once it is with the mentor the log is what
   * it is. Deleting is not more dangerous than rewriting, so it would be odd
   * to let one through and not the other.
   */
  async remove(menteeId, assignedTaskId, dateKey) {
    const task = await this._ownedTask(menteeId, assignedTaskId);
    await clanLifecycleService.assertTaskWritable(task);
    const closed = closedBecause(task.status);
    if (closed) throw new ValidationError(closed);

    const entry = await models.TaskProgressEntry.findOne({ where: { assignedTaskId, dateKey } });
    if (!entry) throw new NotFoundError('No progress logged for that day');
    await entry.destroy();
    return { removed: true, dateKey };
  }

  /**
   * A one line progress read per in-flight task, for the cohort review screen.
   *
   * This is where the feature earns its keep: the mentor is already going person
   * by person, and "logged 3 of 4 days, last: stuck on the refresh flow" turns a
   * status into a conversation opener at no extra cost to them.
   *
   * Kept cheap on purpose. One query for the tasks, one for every entry across
   * them, then counted in memory. No N+1 across a 20 person clan.
   */
  async summaryForMentee(menteeId, { limit = 3, clanId = null } = {}) {
    const { Op } = require('sequelize');
    const where = { menteeId, status: { [Op.in]: ['assigned', 'in_progress', 'revision_needed'] } };
    // Clan review must not surface open work from another clan (e.g. completed
    // cohort history on a fresh standing-clan mentee).
    if (clanId) where.clanId = clanId;
    const tasks = await models.AssignedTask.findAll({
      where,
      attributes: ['id', 'roadmapTaskId', 'dueDate', 'startedAt', 'assignedAt'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'], required: false }],
      order: [['dueDate', 'ASC NULLS LAST']],
      limit,
    });
    if (!tasks.length) return [];

    const taskIds = tasks.map((t) => t.id);
    const entries = await models.TaskProgressEntry.findAll({
      where: { assignedTaskId: { [Op.in]: taskIds } },
      attributes: ['assignedTaskId', 'dateKey', 'note'],
      order: [['dateKey', 'ASC']],
      raw: true,
    });

    const byTask = new Map(taskIds.map((id) => [id, []]));
    entries.forEach((e) => byTask.get(e.assignedTaskId)?.push(e));

    const today = await this._todayFor(menteeId);
    return tasks.map((t) => {
      const rows = byTask.get(t.id) || [];
      const startKey = t.startedAt || t.assignedAt
        ? new Date(t.startedAt || t.assignedAt).toISOString().split('T')[0]
        : today;
      // Days that have actually elapsed, capped so an old assignment does not
      // read as "logged 2 of 90 days" and look like a catastrophe.
      const elapsed = Math.max(1, Math.min(30, this._daysBetween(startKey, today) + 1));
      const last = rows.length ? rows[rows.length - 1] : null;
      return {
        taskId: t.id,
        title: t.roadmapTask?.title || 'Task',
        loggedDays: rows.length,
        elapsedDays: elapsed,
        label: rows.length ? `logged ${rows.length} of ${elapsed} day${elapsed === 1 ? '' : 's'}` : 'nothing logged yet',
        lastNote: last ? last.note : null,
        lastLoggedOn: last ? last.dateKey : null,
      };
    });
  }

  _shape(entry, zone = null) {
    return {
      id: entry.id,
      dateKey: entry.dateKey,
      note: entry.note,
      minutesSpent: entry.minutesSpent,
      loggedAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      // Written on the day, or filled in afterwards. Backfilling is allowed,
      // so the honest thing is to let a mentor see which is which rather than
      // let a gap quietly close itself.
      addedLate: Boolean(zone && entry.createdAt
        && todayInZone(zone, new Date(entry.createdAt)) !== entry.dateKey),
    };
  }
}

module.exports = new TaskProgressService();
