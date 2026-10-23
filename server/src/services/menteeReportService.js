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

    const allowed = [];
    for (const id of candidates) {
      if (allowed.length >= cap) break;
      // eslint-disable-next-line no-await-in-loop
      if (await authzService.canViewMentee(user, id, { clanId })) allowed.push(id);
    }
    return {
      menteeIds: allowed,
      refused: candidates.length - allowed.length,
      capped: candidates.length > cap,
    };
  }

  /** The same report, for several people. */
  async buildMany(menteeIds, { from, to, clanId = null } = {}) {
    const reports = [];
    for (const menteeId of menteeIds) {
      // eslint-disable-next-line no-await-in-loop
      const report = await this.build({ menteeId, from, to, clanId });
      if (report) reports.push(report);
    }
    return reports;
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
  async sendReports(user, { recipients = [], menteeIds = null, clanId = null, programId = null, from, to, note = '' } = {}) {
    const clean = [...new Set((recipients || []).map((r) => String(r || '').trim().toLowerCase()).filter(Boolean))];
    if (!clean.length) throw new ValidationError('Add at least one email address');
    if (clean.length > 10) throw new ValidationError('Ten recipients at a time is the limit');
    const bad = clean.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
    if (bad.length) throw new ValidationError(`That is not a valid email address: ${bad[0]}`);

    const audience = await this.resolveAudience(user, { menteeIds, clanId, programId });
    if (!audience.menteeIds.length) throw new ValidationError('No mentees you can report on were selected');

    const reports = await this.buildMany(audience.menteeIds, { from, to, clanId });
    if (!reports.length) throw new ValidationError('Nothing to report for that period');

    const period = reports[0].period;
    const label = `${new Date(period.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(period.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const subject = reports.length === 1
      ? `Progress report: ${reports[0].mentee.name} (${label})`
      : `Progress report: ${reports.length} mentees (${label})`;

    const emailService = require('./emailService');
    const { renderEmail, plainText } = require('../utils/emailTemplate');
    const bodyHtml = this._emailBody(reports, { label, note, sender: user });

    let queued = 0;
    for (const to_ of clean) {
      // eslint-disable-next-line no-await-in-loop
      const result = await emailService.enqueue({
        to: to_,
        subject,
        html: renderEmail({ heading: subject, bodyHtml, preheader: `Progress for ${label}` }),
        text: plainText({ heading: subject, bodyText: this._emailText(reports, { label, note }) }),
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
        newValues: { recipients: clean, mentees: reports.map((r) => r.mentee.id), period },
      });
    } catch (error) {
      console.error('[reports] audit failed (non-fatal):', error.message);
    }

    return {
      sent: queued,
      recipients: clean.length,
      mentees: reports.length,
      refused: audience.refused,
      capped: audience.capped,
    };
  }

  /** A table somebody can read without logging in, because they cannot. */
  _emailBody(reports, { label, note, sender }) {
    const esc = (value) => String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = reports.map((r) => {
      const place = r.standing?.inClan?.rank
        ? `${r.standing.inClan.rank} of ${r.standing.inClan.of}`
        : 'not ranked';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${esc(r.mentee.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.progress.absolute}%</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.activity.completed}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.progress.onTimeRate}%</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(place)}</td>
      </tr>`;
    }).join('');

    const context = reports[0]?.context;
    return `
      ${note ? `<p style="margin:0 0 14px;">${esc(note)}</p>` : ''}
      <p style="margin:0 0 14px;color:#475569;font-size:14px;">
        ${esc(context?.program?.name || 'Programme')}${context?.clan ? ` &middot; ${esc(context.clan.name)}` : ''}
        &middot; ${esc(label)}
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">
          <th style="padding:6px 10px;">Mentee</th>
          <th style="padding:6px 10px;text-align:right;">Progress</th>
          <th style="padding:6px 10px;text-align:right;">Finished</th>
          <th style="padding:6px 10px;text-align:right;">On time</th>
          <th style="padding:6px 10px;text-align:right;">In clan</th>
        </tr>
        ${rows}
      </table>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
        Sent from Pathment by ${esc(`${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'a mentor')}.
        Progress is measured as at the end of the period shown.
      </p>`;
  }

  _emailText(reports, { label, note }) {
    const lines = [note, '', `Period: ${label}`, ''].filter((line) => line !== undefined);
    for (const r of reports) {
      lines.push(`${r.mentee.name}: ${r.progress.absolute}% overall, ${r.activity.completed} finished this period, ${r.progress.onTimeRate}% on time`);
    }
    return lines.join('\n');
  }
}

module.exports = new MenteeReportService();
