const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const cohortService = require('./cohortService');
const performanceService = require('./performanceService');
const authzService = require('./authzService');

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

/**
 * How many of a roadmap's steps a report lists by name.
 *
 * A report has to be able to say WHICH steps, not just how many, but a
 * programme-wide run is hundreds of people and an unbounded list would put
 * tens of thousands of rows on the wire. Anything past this is counted
 * instead of named.
 */
const STEP_LIMIT = 60;

/**
 * A programme can be thousands of people, and placing somebody in it means
 * scoring all of them. Past this the programme-wide rank is left out and the
 * clan rank, which is the one a mentor actually uses, still stands.
 */
const PROGRAM_RANK_CAP = 1500;

/**
 * Past this many people in one run, the programme-wide rank is dropped too.
 *
 * Not a preference: Heroku's router ends any request that has not answered
 * within thirty seconds, so the whole report has a hard budget. Ranking a
 * thousand-person programme is the single most expensive thing in here and
 * the least load-bearing number on the page - the clan rank is the one a
 * mentor and a funder actually read. Reporting on a hundred people at once
 * spends that budget on the hundred reports instead.
 */
const PROGRAM_RANK_BATCH_CAP = 120;

/**
 * The programme board, remembered briefly.
 *
 * Building a clan's reports and then emailing them runs the whole thing
 * twice, and the second run asks the scoring engine the identical question
 * about the identical thousand people. Sixty seconds covers that round trip
 * and nothing longer: a report is a read of live data, not a cached artifact.
 */
const BOARD_TTL_MS = 60_000;
const boardCache = new Map();

async function cachedLeaderboard(key, load) {
  const hit = boardCache.get(key);
  if (hit && hit.until > Date.now()) return hit.board;
  const board = await load();
  boardCache.set(key, { board, until: Date.now() + BOARD_TTL_MS });
  // The map is keyed by programme and day, so it cannot grow without bound in
  // any realistic workspace - but an expired entry should not outlive its use.
  for (const [k, v] of boardCache) if (v.until <= Date.now()) boardCache.delete(k);
  return board;
}

/** A note is a sentence or two for a reader outside Pathment, not an essay. */
const NOTE_LIMIT = 2000;

/** Where a roadmap step stood at the end of the period. */
function stateOfStep(task, closedAt) {
  if (!task) return 'not_assigned';
  if (task.status === 'completed') return 'completed';
  if (task.status === 'cancelled') return 'cancelled';
  if (task.submittedAt) return 'submitted';
  if (task.dueDate && new Date(task.dueDate).getTime() < closedAt) return 'overdue';
  if (task.startedAt || task.status === 'in_progress') return 'in_progress';
  return 'assigned';
}

class MenteeReportService {
  /**
   * One mentee, one period.
   *
   * A thin wrapper over the batch builder rather than a second implementation,
   * because the single report and the clan report have to agree about every
   * number on them.
   */
  async build({ menteeId, from, to, clanId = null } = {}) {
    if (!menteeId) throw new ValidationError('A mentee is required');
    const [report] = await this.buildMany([menteeId], { from, to, clanId });
    return report || null;
  }

  /**
   * The same report for everybody at once, in a fixed number of queries
   * rather than a fixed number PER PERSON.
   *
   * This used to loop the single-mentee builder, and the single-mentee builder
   * ranks its subject against their clan AND against their whole programme.
   * Ranking is not a lookup: placing one person means scoring all of them. So
   * a clan of twenty asked the scoring engine to rank a thousand-person
   * programme twenty times over, and the request died on the client's
   * thirty-second timeout long before the server gave up.
   *
   * Everything shared is therefore computed once: one preload, one task query,
   * one roadmap lookup, one clan leaderboard, one programme leaderboard. What
   * remains per mentee is arithmetic over data already in memory.
   */
  async buildMany(menteeIds, { from, to, clanId = null } = {}) {
    const ids = [...new Set(menteeIds)].filter(Boolean);
    if (!ids.length) return [];
    const period = parsePeriod({ from, to });

    const scope = await cohortService.workScopeForClan(clanId);
    const clan = clanId
      ? await models.Clan.findByPk(clanId, { attributes: ['id', 'name', 'kind', 'programId'] })
      : null;
    const programId = clan?.programId || scope.programId || null;

    const [mentees, program, preloads, tasksByMentee] = await Promise.all([
      models.User.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
      }),
      programId
        ? models.Program.findByPk(programId, { attributes: ['id', 'name', 'totalDurationWeeks'] })
        : null,
      /**
       * The state of things at the END of the period, not today.
       *
       * Without `asOfEnd` a report for a month that closed in August would be
       * recalculated against today's data and quietly disagree with itself
       * every time it was opened.
       */
      cohortService.preloadMenteeData(ids, {
        ...(programId ? { programId } : {}),
        ...(clanId ? { clanId } : {}),
        asOfEnd: period.to,
        asOfDateKey: period.to.toISOString().slice(0, 10),
      }),
      this._loadTasks(ids, { clanId, asOfEnd: period.to }),
    ]);

    const [roadmapsByMentee, standingByMentee] = await Promise.all([
      this._roadmapProgress(tasksByMentee, period.to),
      this._standing(ids, { clanId, programId }),
    ]);

    const context = {
      clan: clan ? { id: clan.id, name: clan.name, kind: clan.kind } : null,
      program: program
        ? { id: program.id, name: program.name, totalWeeks: program.totalDurationWeeks }
        : null,
    };
    const generatedAt = new Date().toISOString();
    const periodOut = { from: period.from.toISOString(), to: period.to.toISOString() };

    const built = await Promise.all(mentees.map(async (mentee) => {
      const row = await cohortService.buildMenteeRow(mentee.id, preloads);
      if (!row) return null;
      const tasks = tasksByMentee.get(mentee.id) || [];

      return {
        generatedAt,
        period: periodOut,
        mentee: {
          id: mentee.id,
          name: `${mentee.firstName || ''} ${mentee.lastName || ''}`.trim(),
          email: mentee.email,
          avatarUrl: mentee.profilePictureUrl || null,
        },
        context: { ...context, week: row.week, totalWeeks: row.totalWeeks },
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
        activity: this._activityIn(tasks, period),
        roadmaps: roadmapsByMentee.get(mentee.id) || [],
        standing: standingByMentee.get(mentee.id) || { inClan: null, inProgram: null },
      };
    }));

    // Read as a document: alphabetical, so the same clan comes back in the
    // same order every time rather than in whatever order the database felt
    // like returning the users in.
    return built
      .filter(Boolean)
      .sort((a, b) => a.mentee.name.localeCompare(b.mentee.name));
  }

  /**
   * Everybody's work, as it stood at the end of the period.
   *
   * Same as-of rule the metrics engine uses: a task assigned after the window
   * closed did not exist yet as far as this report is concerned, and a task
   * finished afterwards was still open at the time. Without the second part a
   * report for August would show August's work as complete because it is
   * complete NOW, which is a different claim.
   *
   * The report loads its own tasks rather than reusing the metrics preload.
   * That preload trims its SELECT to the columns the score needs - no title,
   * no roadmap_task_id - because it runs over every mentee in a clan and the
   * columns it leaves out cost real time there. A report has to be able to say
   * WHICH task, which means fetching the rest.
   */
  async _loadTasks(menteeIds, { clanId, asOfEnd }) {
    const byMentee = new Map(menteeIds.map((id) => [id, []]));
    if (!menteeIds.length) return byMentee;

    const where = { menteeId: { [Op.in]: menteeIds }, assignedAt: { [Op.lte]: asOfEnd } };
    if (clanId) where.clanId = clanId;

    const rows = await models.AssignedTask.findAll({
      where,
      attributes: [
        'id', 'menteeId', 'status', 'isLate', 'assignedAt', 'startedAt', 'submittedAt', 'completedAt',
        'dueDate', 'finalRating', 'pointsAwarded', 'roadmapTaskId', 'clanId', 'titleOverride', 'typeOverride',
      ],
      include: [{
        model: models.RoadmapTask,
        as: 'roadmapTask',
        attributes: ['id', 'title', 'roadmapId', 'difficulty', 'type', 'taskOrder'],
        required: false,
      }],
    });

    const closedAt = new Date(asOfEnd).getTime();
    for (const task of rows) {
      const plain = task.toJSON();
      plain.title = plain.titleOverride || plain.roadmapTask?.title || 'Task';
      plain.type = plain.typeOverride || plain.roadmapTask?.type || null;
      plain.difficulty = plain.roadmapTask?.difficulty || null;
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
      const bucket = byMentee.get(plain.menteeId);
      if (bucket) bucket.push(plain);
    }
    return byMentee;
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
        type: t.type,
        completedAt: t.completedAt,
        // DECIMAL comes back from Sequelize as a string, and "4.00/5" is not
        // what anybody wrote on the review.
        rating: t.finalRating != null ? Number(t.finalRating) : null,
        points: Number(t.pointsAwarded) || 0,
        late: Boolean(t.isLate),
      })),
      openTasks: overdue.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        dueDate: t.dueDate,
        status: t.status,
      })),
    };
  }

  /**
   * Which roadmap each mentee is on, how far through it they are, and WHICH
   * steps those are.
   *
   * The percentage alone was the weakest part of the report: "41% of the
   * roadmap" is a number a funder cannot check and a mentee cannot act on. So
   * every step of the roadmap comes back named and in order, each marked with
   * where it stood at the end of the period - including the ones never handed
   * out, because "not started yet" and "started and abandoned" look identical
   * in a progress bar and could not be more different in a review.
   *
   * Loaded for the whole group at once: a clan usually shares a roadmap, so
   * this is a handful of queries for twenty people rather than per person.
   */
  async _roadmapProgress(tasksByMentee, asOfEnd) {
    const out = new Map([...tasksByMentee.keys()].map((id) => [id, []]));
    const allTasks = [...tasksByMentee.values()].flat();
    const roadmapTaskIds = [...new Set(allTasks.map((t) => t.roadmapTaskId).filter(Boolean))];
    if (!roadmapTaskIds.length) return out;

    const owning = await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: roadmapTaskIds } },
      attributes: ['id', 'roadmapId'],
      raw: true,
    });
    const roadmapOfTask = new Map(owning.map((t) => [t.id, t.roadmapId]));
    const roadmapIds = [...new Set(owning.map((t) => t.roadmapId).filter(Boolean))];
    if (!roadmapIds.length) return out;

    const [roadmaps, steps] = await Promise.all([
      models.Roadmap.findAll({
        where: { id: { [Op.in]: roadmapIds } },
        attributes: ['id', 'name'],
        raw: true,
        paranoid: false,
      }),
      models.RoadmapTask.findAll({
        where: { roadmapId: { [Op.in]: roadmapIds } },
        attributes: ['id', 'roadmapId', 'title', 'taskOrder', 'type', 'difficulty'],
        order: [['taskOrder', 'ASC']],
        raw: true,
      }),
    ]);

    const roadmapById = new Map(roadmaps.map((r) => [r.id, r]));
    const stepsByRoadmap = new Map();
    for (const step of steps) {
      if (!stepsByRoadmap.has(step.roadmapId)) stepsByRoadmap.set(step.roadmapId, []);
      stepsByRoadmap.get(step.roadmapId).push(step);
    }

    const closedAt = new Date(asOfEnd).getTime();
    for (const [menteeId, tasks] of tasksByMentee) {
      out.set(menteeId, this._roadmapsFor(tasks, { roadmapOfTask, roadmapById, stepsByRoadmap, closedAt }));
    }
    return out;
  }

  /** One mentee's roadmaps, built from maps the group already paid for. */
  _roadmapsFor(tasks, { roadmapOfTask, roadmapById, stepsByRoadmap, closedAt }) {
    const mine = new Map();
    for (const task of tasks) {
      const roadmapId = task.roadmapTask?.roadmapId || roadmapOfTask.get(task.roadmapTaskId);
      if (!roadmapId) continue;
      if (!mine.has(roadmapId)) mine.set(roadmapId, { assigned: 0, completed: 0, byStep: new Map() });
      const bucket = mine.get(roadmapId);
      bucket.assigned += 1;
      if (task.status === 'completed') bucket.completed += 1;
      // Several assignments of one step can exist after a reassignment; the
      // furthest along is the one that describes where they got to.
      const existing = task.roadmapTaskId ? bucket.byStep.get(task.roadmapTaskId) : null;
      if (task.roadmapTaskId && (!existing || (existing.status !== 'completed' && task.status === 'completed'))) {
        bucket.byStep.set(task.roadmapTaskId, task);
      }
    }

    const result = [];
    for (const [roadmapId, bucket] of mine) {
      const roadmap = roadmapById.get(roadmapId);
      if (!roadmap) continue;
      const all = stepsByRoadmap.get(roadmapId) || [];
      const listed = all.slice(0, STEP_LIMIT);
      result.push({
        id: roadmap.id,
        name: roadmap.name,
        steps: all.length,
        assigned: bucket.assigned,
        completed: bucket.completed,
        /** Of the whole roadmap, not of what they happen to have been given. */
        percentOfRoadmap: pct(bucket.completed, all.length),
        percentOfAssigned: pct(bucket.completed, bucket.assigned),
        tasks: listed.map((step) => {
          const task = bucket.byStep.get(step.id) || null;
          return {
            id: step.id,
            title: step.title,
            type: step.type || null,
            difficulty: step.difficulty || null,
            state: stateOfStep(task, closedAt),
            dueDate: task?.dueDate || null,
            completedAt: task?.completedAt || null,
            rating: task?.finalRating != null ? Number(task.finalRating) : null,
            points: task ? Number(task.pointsAwarded) || 0 : 0,
            late: Boolean(task?.isLate),
          };
        }),
        tasksHidden: Math.max(0, all.length - listed.length),
      });
    }
    return result.sort((a, b) => b.assigned - a.assigned);
  }

  /**
   * Where everybody places, in their clan and across the programme.
   *
   * Deliberately the same `performanceService.leaderboard` the Recognition
   * screens and the mentor cockpit use. A report that invents its own ranking
   * is a report that will be argued with.
   *
   * Two leaderboards for the whole group, not two per mentee. Somebody below
   * the eligibility bar comes back unranked WITH the reason rather than being
   * given a fabricated position, and somebody the board has never heard of
   * gets no standing at all rather than a confident "not enough work yet".
   */
  async _standing(menteeIds, { clanId, programId }) {
    const out = new Map(menteeIds.map((id) => [id, { inClan: null, inProgram: null }]));

    const placeAll = (board, key) => {
      const known = new Map();
      for (const m of board.ranked) {
        known.set(m.id, { rank: m.rank, of: board.counted, score: m.score, notRankedBecause: null });
      }
      for (const m of board.notRanked) {
        known.set(m.id, {
          rank: null,
          of: board.counted,
          score: m.score ?? null,
          notRankedBecause: m.notRankedBecause || 'Not enough finished work to place them yet',
        });
      }
      for (const id of menteeIds) {
        const place = known.get(id);
        if (place) out.get(id)[key] = place;
      }
    };

    if (clanId) {
      const members = await models.ClanMembership.findAll({
        where: { clanId, role: 'mentee' }, attributes: ['userId'], raw: true,
      });
      const ids = [...new Set(members.map((m) => m.userId))];
      if (ids.length) placeAll(await performanceService.leaderboard(ids, { clanId }), 'inClan');
    }

    if (programId && menteeIds.length <= PROGRAM_RANK_BATCH_CAP) {
      const enrolled = await models.Enrollment.findAll({
        where: { programId }, attributes: ['menteeId'], raw: true,
      });
      const ids = [...new Set(enrolled.map((e) => e.menteeId).filter(Boolean))];
      if (ids.length && ids.length <= PROGRAM_RANK_CAP) {
        const board = await cachedLeaderboard(
          `program:${programId}:${ids.length}`,
          () => performanceService.leaderboard(ids, { clanId: null }),
        );
        placeAll(board, 'inProgram');
      }
    }

    return out;
  }

  // ── reporting on more than one person ──────────────────────────────────

  /**
   * Who this caller may report on, given what they asked for.
   *
   * Resolved from the caller's actual access rather than from the ids the
   * browser sent. A mentor naming a clan they do not mentor, or an id they
   * picked out of a URL, gets the same answer as if they had named nobody:
   * `canViewMentee` is the authority, and it already accounts for a co-mentor
   * whose `mentee.view` has been revoked.
   */
  async resolveAudience(user, { menteeIds = null, clanId = null, programId = null } = {}, { cap = 200 } = {}) {
    let candidates = [];

    if (Array.isArray(menteeIds) && menteeIds.length) {
      candidates = [...new Set(menteeIds)];
    } else if (clanId) {
      const rows = await models.ClanMembership.findAll({
        where: { clanId, role: 'mentee' }, attributes: ['userId'], raw: true,
      });
      candidates = [...new Set(rows.map((r) => r.userId))];
    } else if (programId) {
      const rows = await models.Enrollment.findAll({
        where: { programId }, attributes: ['menteeId'], raw: true,
      });
      candidates = [...new Set(rows.map((r) => r.menteeId).filter(Boolean))];
    } else {
      throw new ValidationError('Choose a clan, a programme or some mentees');
    }

    if (!candidates.length) return { menteeIds: [], refused: 0, capped: false };

    /**
     * The caller's role assignments are resolved once and handed to every
     * check. Without that, two hundred candidates meant two hundred
     * re-derivations of the same answer, one after another.
     */
    const assignments = await authzService.getAssignments(user);
    const allowed = [];
    const CHUNK = 25;
    for (let i = 0; i < candidates.length && allowed.length < cap; i += CHUNK) {
      const slice = candidates.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      const verdicts = await Promise.all(
        slice.map((id) => authzService.canViewMentee(user, id, { clanId, assignments })),
      );
      slice.forEach((id, index) => {
        if (verdicts[index] && allowed.length < cap) allowed.push(id);
      });
    }

    return {
      menteeIds: allowed,
      refused: candidates.length - allowed.length,
      capped: candidates.length > cap,
    };
  }

  /**
   * The mentor's own words, per mentee.
   *
   * A report is numbers, and numbers alone do not explain why somebody had a
   * quiet month or why a late submission was the right call. The sender can
   * write one line for everybody and then override it for the people who need
   * something said about them specifically.
   */
  _cleanNotes(notes, allowedIds) {
    const out = new Map();
    if (!notes || typeof notes !== 'object') return out;
    const allowed = new Set(allowedIds);
    for (const [menteeId, value] of Object.entries(notes)) {
      if (!allowed.has(menteeId)) continue;
      const text = String(value == null ? '' : value).trim().slice(0, NOTE_LIMIT);
      if (text) out.set(menteeId, text);
    }
    return out;
  }

  /**
   * Send these reports to people outside Pathment.
   *
   * The reason this exists: the organisations funding a fellowship need to see
   * that the people they are paying for are actually progressing, and they do
   * not have accounts here. So the recipients are arbitrary addresses, which
   * makes this the one place in the product that mails strangers on a user's
   * say-so.
   *
   * That is handled rather than hoped about. The recipient list is capped and
   * validated, the mentee list comes from `resolveAudience` rather than from
   * the request, and every send is written to the audit log with who sent what
   * to whom: an export of somebody's progress leaving the system should be
   * answerable for afterwards.
   */
  async sendReports(user, {
    recipients = [], menteeIds = null, clanId = null, programId = null,
    from, to, note = '', notes = {},
  } = {}) {
    const clean = [...new Set((recipients || []).map((r) => String(r || '').trim().toLowerCase()).filter(Boolean))];
    if (!clean.length) throw new ValidationError('Add at least one email address');
    if (clean.length > 10) throw new ValidationError('Ten recipients at a time is the limit');
    const bad = clean.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
    if (bad.length) throw new ValidationError(`That is not a valid email address: ${bad[0]}`);

    const audience = await this.resolveAudience(user, { menteeIds, clanId, programId });
    if (!audience.menteeIds.length) throw new ValidationError('No mentees you can report on were selected');

    const reports = await this.buildMany(audience.menteeIds, { from, to, clanId });
    if (!reports.length) throw new ValidationError('Nothing to report for that period');

    const shared = String(note || '').trim().slice(0, NOTE_LIMIT);
    const perMentee = this._cleanNotes(notes, reports.map((r) => r.mentee.id));
    for (const report of reports) report.note = perMentee.get(report.mentee.id) || null;

    const period = reports[0].period;
    const label = `${new Date(period.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(period.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const subject = reports.length === 1
      ? `Progress report: ${reports[0].mentee.name} (${label})`
      : `Progress report: ${reports.length} mentees (${label})`;

    const emailService = require('./emailService');
    const { renderEmail, plainText } = require('../utils/emailTemplate');
    const bodyHtml = this._emailBody(reports, { label, note: shared, sender: user });

    let queued = 0;
    for (const to_ of clean) {
      // eslint-disable-next-line no-await-in-loop
      const result = await emailService.enqueue({
        to: to_,
        subject,
        html: renderEmail({ heading: subject, bodyHtml, preheader: `Progress for ${label}` }),
        text: plainText({ heading: subject, bodyText: this._emailText(reports, { label, note: shared }) }),
        emailType: 'system',
        priority: 4,
      });
      if (result && result.queued !== false) queued += 1;
    }

    try {
      await require('../utils/auditContext').createAuditLog({
        action: 'MENTEE_REPORT_SENT',
        entityType: 'MenteeReport',
        entityId: user.id,
        newValues: {
          recipients: clean,
          mentees: reports.map((r) => r.mentee.id),
          period,
          sharedNote: Boolean(shared),
          individualNotes: perMentee.size,
        },
      });
    } catch (error) {
      console.error('[reports] audit failed (non-fatal):', error.message);
    }

    return {
      sent: queued,
      recipients: clean.length,
      mentees: reports.length,
      notes: perMentee.size,
      refused: audience.refused,
      capped: audience.capped,
    };
  }

  /** A report somebody can read without logging in, because they cannot. */
  _emailBody(reports, { label, note, sender }) {
    const esc = (value) => String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const context = reports[0]?.context;

    const place = (report) => (report.standing?.inClan?.rank
      ? `${report.standing.inClan.rank} of ${report.standing.inClan.of}`
      : 'not ranked');

    // A table is the fastest way to compare people, so it stays - but only
    // when there is more than one person to compare.
    const summary = reports.length > 1 ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
        <tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">
          <th style="padding:6px 10px;">Mentee</th>
          <th style="padding:6px 10px;text-align:right;">Progress</th>
          <th style="padding:6px 10px;text-align:right;">Finished</th>
          <th style="padding:6px 10px;text-align:right;">On time</th>
          <th style="padding:6px 10px;text-align:right;">In clan</th>
        </tr>
        ${reports.map((r) => `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${esc(r.mentee.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.progress.absolute}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.activity.completed}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.progress.onTimeRate}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(place(r))}</td>
        </tr>`).join('')}
      </table>` : '';

    const card = (r) => {
      const roadmap = r.roadmaps[0];
      const done = r.activity.completedTasks.slice(0, 6);
      return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 16px;">
        <tr><td style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
          <p style="margin:0 0 2px;font-size:16px;font-weight:600;color:#0f172a;">${esc(r.mentee.name)}</p>
          <p style="margin:0 0 12px;font-size:12px;color:#64748b;">
            ${esc(r.context.program?.name || 'Programme')}${r.context.clan ? ` &middot; ${esc(r.context.clan.name)}` : ''}${r.context.week ? ` &middot; week ${r.context.week}${r.context.totalWeeks ? ` of ${r.context.totalWeeks}` : ''}` : ''}
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#334155;">
            <tr>
              <td style="padding:0 8px 0 0;"><strong style="font-size:18px;color:#0f172a;">${r.progress.absolute}%</strong><br><span style="color:#64748b;font-size:11px;">of their roadmap</span></td>
              <td style="padding:0 8px;"><strong style="font-size:18px;color:#0f172a;">${r.activity.completed}</strong><br><span style="color:#64748b;font-size:11px;">finished this period</span></td>
              <td style="padding:0 8px;"><strong style="font-size:18px;color:#0f172a;">${r.progress.onTimeRate}%</strong><br><span style="color:#64748b;font-size:11px;">deadlines met</span></td>
              <td style="padding:0 0 0 8px;"><strong style="font-size:18px;color:#0f172a;">${esc(place(r))}</strong><br><span style="color:#64748b;font-size:11px;">in their clan</span></td>
            </tr>
          </table>
          ${roadmap ? `<p style="margin:12px 0 0;font-size:13px;color:#334155;">
            <strong style="font-weight:600;">${esc(roadmap.name)}</strong>
            <span style="color:#64748b;"> &middot; ${roadmap.completed} of ${roadmap.steps} steps done</span>
          </p>` : ''}
          ${done.length ? `<p style="margin:10px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;">Finished this period</p>
          <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#334155;">
            ${done.map((t) => `<li style="margin:2px 0;">${esc(t.title)}${t.rating != null ? ` <span style="color:#64748b;">(${t.rating}/5)</span>` : ''}</li>`).join('')}
            ${r.activity.completedTasks.length > done.length ? `<li style="margin:2px 0;color:#64748b;">and ${r.activity.completedTasks.length - done.length} more</li>` : ''}
          </ul>` : `<p style="margin:10px 0 0;font-size:13px;color:#64748b;">Nothing was completed in this window.</p>`}
          ${r.note ? `<p style="margin:12px 0 0;padding:10px 12px;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:4px;font-size:13px;color:#334155;">${esc(r.note)}</p>` : ''}
        </td></tr>
      </table>`;
    };

    return `
      ${note ? `<p style="margin:0 0 18px;font-size:14px;color:#334155;">${esc(note)}</p>` : ''}
      <p style="margin:0 0 18px;color:#475569;font-size:14px;">
        ${esc(context?.program?.name || 'Programme')}${context?.clan ? ` &middot; ${esc(context.clan.name)}` : ''}
        &middot; ${esc(label)}
      </p>
      ${summary}
      ${reports.map(card).join('')}
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
        Sent from Pathment by ${esc(`${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'a mentor')}.
        Progress is measured as at the end of the period shown.
      </p>`;
  }

  _emailText(reports, { label, note }) {
    const lines = [];
    if (note) lines.push(note, '');
    lines.push(`Period: ${label}`, '');
    for (const r of reports) {
      lines.push(`${r.mentee.name}: ${r.progress.absolute}% overall, ${r.activity.completed} finished this period, ${r.progress.onTimeRate}% on time`);
      if (r.roadmaps[0]) lines.push(`  ${r.roadmaps[0].name}: ${r.roadmaps[0].completed} of ${r.roadmaps[0].steps} steps done`);
      if (r.note) lines.push(`  Note: ${r.note}`);
    }
    return lines.join('\n');
  }
}

module.exports = new MenteeReportService();
