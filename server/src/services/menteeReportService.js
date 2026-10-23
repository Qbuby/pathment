const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const cohortService = require('./cohortService');
const performanceService = require('./performanceService');

/**
 * One mentee, one period, everything a human needs to judge how it went.
 *
 * Three questions, and the report is only useful if it answers all three:
 *
 *   where do they STAND    their place in the clan and in the programme, by
 *                          the same score the leaderboard and the mentor
 *                          cockpit already use, so nobody has to reconcile two
 *                          different numbers for the same person;
 *   what did they DO       the work that actually moved inside the period,
 *                          rather than a lifetime total that looks identical
 *                          every month;
 *   where are they NOW     progress, pace and risk as at the END of the
 *                          period, not as at today, so a report for September
 *                          still reads the way September did.
 *
 * That last one is the reason this is a service rather than a query. The
 * metrics engine already supports an as-of date (`preloadMenteeData` takes
 * `asOfEnd`), which is how the frozen-cohort snapshots stay honest; this reuses
 * it rather than inventing a second definition of progress.
 *
 * Nothing here computes a score of its own. Every number comes from the
 * service that already owns it, because a report that disagrees with the
 * screen it was generated from is worse than no report.
 */

/** The month a report defaults to: the one being lived through. */
function defaultPeriod(now = new Date()) {
  const to = new Date(now);
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  return { from, to };
}

function parsePeriod({ from, to } = {}) {
  if (!from && !to) return defaultPeriod();
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : new Date();
  if (start && Number.isNaN(start.getTime())) throw new ValidationError('That start date is not a date');
  if (Number.isNaN(end.getTime())) throw new ValidationError('That end date is not a date');
  if (start && start > end) throw new ValidationError('The start date is after the end date');
  // An end date is a DAY, and somebody asking for work "to the 30th" means
  // including everything that happened on the 30th.
  end.setUTCHours(23, 59, 59, 999);
  return { from: start || defaultPeriod(end).from, to: end };
}

const within = (value, from, to) => {
  if (!value) return false;
  const at = new Date(value).getTime();
  return at >= from.getTime() && at <= to.getTime();
};

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

class MenteeReportService {
  /**
   * @param {object} input
   * @param {string} input.menteeId
   * @param {string|Date} [input.from]  defaults to the first of the current month
   * @param {string|Date} [input.to]    defaults to now
   * @param {string|null} [input.clanId]
   */
  async build({ menteeId, from, to, clanId = null } = {}) {
    if (!menteeId) throw new ValidationError('A mentee is required');
    const period = parsePeriod({ from, to });

    const mentee = await models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
    });
    if (!mentee) return null;

    const scope = await cohortService.workScopeForClan(clanId);
    const clan = clanId ? await models.Clan.findByPk(clanId, { attributes: ['id', 'name', 'kind', 'programId'] }) : null;
    const programId = clan?.programId || scope.programId || null;
    const program = programId
      ? await models.Program.findByPk(programId, { attributes: ['id', 'name', 'totalDurationWeeks'] })
      : null;

    /**
     * The state of things at the END of the period, not today.
     *
     * Without `asOfEnd` a report for a month that closed in August would be
     * recalculated against today's data and quietly disagree with itself every
     * time it was opened.
     */
    const preloads = await cohortService.preloadMenteeData([menteeId], {
      ...(programId ? { programId } : {}),
      ...(clanId ? { clanId } : {}),
      asOfEnd: period.to,
      asOfDateKey: period.to.toISOString().slice(0, 10),
    });
    const row = await cohortService.buildMenteeRow(menteeId, preloads);
    if (!row) return null;

    /**
     * The report loads its own tasks rather than reusing the metrics preload.
     *
     * That preload trims its SELECT to the columns the score needs - no title,
     * no roadmap_task_id - because it runs over every mentee in a clan and the
     * columns it leaves out cost real time there. A report is one person, and
     * it has to be able to say WHICH task, which means fetching the rest.
     */
    const tasks = await this._loadTasks(menteeId, { clanId, programId, asOfEnd: period.to });
    const activity = this._activityIn(tasks, period);
    const roadmaps = await this._roadmapProgress(tasks);
    const standing = await this._standing(menteeId, { clanId, programId });

    return {
      generatedAt: new Date().toISOString(),
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      mentee: {
        id: mentee.id,
        name: `${mentee.firstName || ''} ${mentee.lastName || ''}`.trim(),
        email: mentee.email,
        avatarUrl: mentee.profilePictureUrl || null,
      },
      context: {
        clan: clan ? { id: clan.id, name: clan.name, kind: clan.kind } : null,
        program: program ? { id: program.id, name: program.name, totalWeeks: program.totalDurationWeeks } : null,
        week: row.week,
        totalWeeks: row.totalWeeks,
      },
      // As at the end of the period.
      progress: {
        absolute: row.absoluteProgress,
        relative: row.relativeProgress,
        onTimeRate: row.onTimeRate,
        avgRating: Number(row.avgRating || 0),
        momentum: row.momentum,
        risk: row.risk,
        riskReason: row.riskReason,
        signals: row.signals || [],
        openBlockers: row.openBlockers,
        pendingApprovals: row.pendingApprovals,
        extensions: row.extensions,
        tasksAssigned: row.taskCount,
        tasksCompleted: row.tasksCompleted,
        lastActive: row.lastActive,
      },
      activity,
      roadmaps,
      standing,
    };
  }

  /**
   * This mentee's work, as it stood at the end of the period.
   *
   * Same as-of rule the metrics engine uses: a task assigned after the window
   * closed did not exist yet as far as this report is concerned, and a task
   * finished afterwards was still open at the time. Without the second part a
   * report for August would show August's work as complete because it is
   * complete NOW, which is a different claim.
   */
  async _loadTasks(menteeId, { clanId, programId, asOfEnd }) {
    const where = { menteeId, assignedAt: { [Op.lte]: asOfEnd } };
    if (clanId) where.clanId = clanId;

    const rows = await models.AssignedTask.findAll({
      where,
      attributes: [
        'id', 'status', 'isLate', 'assignedAt', 'startedAt', 'submittedAt', 'completedAt',
        'dueDate', 'finalRating', 'pointsAwarded', 'roadmapTaskId', 'clanId', 'titleOverride',
      ],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title', 'roadmapId', 'difficulty', 'type'], required: false }],
    });

    const closedAt = new Date(asOfEnd).getTime();
    return rows.map((task) => {
      const plain = task.toJSON();
      plain.title = plain.titleOverride || plain.roadmapTask?.title || 'Task';
      // Rewind anything that happened after the window closed.
      const completed = plain.completedAt ? new Date(plain.completedAt).getTime() : null;
      if (completed != null && completed > closedAt) {
        plain.status = 'in_progress';
        plain.completedAt = null;
        plain.finalRating = null;
        plain.pointsAwarded = 0;
      }
      const submitted = plain.submittedAt ? new Date(plain.submittedAt).getTime() : null;
      if (submitted != null && submitted > closedAt) plain.submittedAt = null;
      return plain;
    });
  }

  /**
   * What moved inside the window.
   *
   * A lifetime total reads the same in March as in September; this is the part
   * that makes one month's report different from the next.
   */
  _activityIn(tasks, period) {
    const { from, to } = period;
    const assigned = tasks.filter((t) => within(t.assignedAt, from, to));
    const submitted = tasks.filter((t) => within(t.submittedAt, from, to));
    const completed = tasks.filter((t) => within(t.completedAt, from, to));
    // Overdue is judged at the END of the period, so a report does not call
    // somebody late for a deadline they met the following week.
    const overdue = tasks.filter((t) => t.dueDate
      && new Date(t.dueDate) < to
      && !['completed', 'cancelled'].includes(t.status));

    const rated = completed.filter((t) => t.finalRating != null);
    return {
      assigned: assigned.length,
      submitted: submitted.length,
      completed: completed.length,
      stillOpen: overdue.length,
      pointsEarned: completed.reduce((sum, t) => sum + (Number(t.pointsAwarded) || 0), 0),
      averageRating: rated.length
        ? Number((rated.reduce((s, t) => s + Number(t.finalRating), 0) / rated.length).toFixed(2))
        : null,
      /** Named, because "6 tasks" tells a mentee nothing about which six. */
      completedTasks: completed.map((t) => ({
        id: t.id,
        title: t.title,
        completedAt: t.completedAt,
        rating: t.finalRating ?? null,
        points: Number(t.pointsAwarded) || 0,
        late: Boolean(t.isLate),
      })),
      openTasks: overdue.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
      })),
    };
  }

  /**
   * Which roadmap they are on, and how far through it they are.
   *
   * Grouped from the work itself rather than from an assignment record,
   * because a mentee can be partway through several at once and the question
   * "where are they up to" has to be answerable per roadmap.
   */
  async _roadmapProgress(tasks) {
    const roadmapTaskIds = [...new Set(tasks.map((t) => t.roadmapTaskId).filter(Boolean))];
    if (!roadmapTaskIds.length) return [];

    const roadmapTasks = await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: roadmapTaskIds } },
      attributes: ['id', 'roadmapId', 'title'],
      raw: true,
    });
    const roadmapIds = [...new Set(roadmapTasks.map((t) => t.roadmapId).filter(Boolean))];
    if (!roadmapIds.length) return [];

    const [roadmaps, totals] = await Promise.all([
      models.Roadmap.findAll({ where: { id: { [Op.in]: roadmapIds } }, attributes: ['id', 'name'], raw: true, paranoid: false }),
      models.RoadmapTask.findAll({ where: { roadmapId: { [Op.in]: roadmapIds } }, attributes: ['id', 'roadmapId'], raw: true }),
    ]);
    const totalByRoadmap = new Map();
    for (const t of totals) totalByRoadmap.set(t.roadmapId, (totalByRoadmap.get(t.roadmapId) || 0) + 1);
    const roadmapOfTask = new Map(roadmapTasks.map((t) => [t.id, t.roadmapId]));

    const mine = new Map();
    for (const task of tasks) {
      const roadmapId = task.roadmapTask?.roadmapId || roadmapOfTask.get(task.roadmapTaskId);
      if (!roadmapId) continue;
      if (!mine.has(roadmapId)) mine.set(roadmapId, { assigned: 0, completed: 0 });
      const bucket = mine.get(roadmapId);
      bucket.assigned += 1;
      if (task.status === 'completed') bucket.completed += 1;
    }

    return roadmaps.map((roadmap) => {
      const bucket = mine.get(roadmap.id) || { assigned: 0, completed: 0 };
      const steps = totalByRoadmap.get(roadmap.id) || 0;
      return {
        id: roadmap.id,
        name: roadmap.name,
        steps,
        assigned: bucket.assigned,
        completed: bucket.completed,
        /** Of the whole roadmap, not of what they happen to have been given. */
        percentOfRoadmap: pct(bucket.completed, steps),
        percentOfAssigned: pct(bucket.completed, bucket.assigned),
      };
    }).sort((a, b) => b.assigned - a.assigned);
  }

  /**
   * Where they place, in their clan and across the programme.
   *
   * Deliberately the same `performanceService.leaderboard` the Recognition
   * screens and the mentor cockpit use. A report that invents its own ranking
   * is a report that will be argued with.
   *
   * Somebody below the eligibility bar comes back unranked WITH the reason,
   * rather than being given a fabricated position.
   */
  async _standing(menteeId, { clanId, programId }) {
    const place = async (ids, scopeClanId) => {
      if (!ids.length) return null;
      const board = await performanceService.leaderboard(ids, { clanId: scopeClanId });
      const ranked = board.ranked.find((m) => m.id === menteeId);
      if (ranked) return { rank: ranked.rank, of: board.counted, score: ranked.score, notRankedBecause: null };
      const missed = board.notRanked.find((m) => m.id === menteeId);
      return { rank: null, of: board.counted, score: missed?.score ?? null, notRankedBecause: missed?.notRankedBecause || 'Not enough finished work to place them yet' };
    };

    let inClan = null;
    if (clanId) {
      const members = await models.ClanMembership.findAll({
        where: { clanId, role: 'mentee' }, attributes: ['userId'], raw: true,
      });
      inClan = await place([...new Set(members.map((m) => m.userId))], clanId);
    }

    let inProgram = null;
    if (programId) {
      const enrolled = await models.Enrollment.findAll({
        where: { programId }, attributes: ['menteeId'], raw: true,
      });
      const ids = [...new Set(enrolled.map((e) => e.menteeId).filter(Boolean))];
      // A programme can be thousands of people; ranking all of them to place
      // one is work nobody asked for. Capped, and said so in the payload.
      inProgram = ids.length <= 1500 ? await place(ids, null) : null;
    }

    return { inClan, inProgram };
  }
}

module.exports = new MenteeReportService();
