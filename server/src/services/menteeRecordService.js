const { Op } = require('sequelize');
const { models } = require('../db');
const authzService = require('./authzService');
const { HISTORICAL_MEMBERSHIP_STATUSES } = require('../config/membership');
const logger = require('../utils/logger');

/**
 * One mentee's record across every clan in the organisation.
 *
 * A mentee's history was fragmented per clan. When they MOVE, their old
 * `ClanMembership` flips to 'removed' — a status nothing else in the codebase
 * reads — so the previous mentor loses them and the receiving mentor never had
 * the earlier work. A mentor deciding what to assign next was working blind on
 * everything that came before this clan.
 *
 * The record is strictly ADDITIVE. Per-clan isolation of tasks, schedules and
 * stats is a tested contract (tests/mentor/mentee-multi-clan.test.js) and this
 * changes none of it: no clan-scoped query returns anything different, and
 * nothing here is merged into the working views. This is a separate read.
 *
 * THREE VISIBILITY TIERS, enforced here and never by hiding fields in the UI:
 *
 *   1. Summary      — every clan. Name, programme, dates, counts, and each
 *                     task's title + status. No submissions, feedback or
 *                     ratings from a clan the viewer does not mentor.
 *   2. Full detail  — clans the viewer mentors. Unchanged from today.
 *   3. Work you     — a task whose `mentorId` is the viewer is theirs in full,
 *      assigned      wherever the mentee has since moved. This mirrors
 *                    `authzService.canActOnTask`, which already admits on
 *                    `task.mentorId === userId`; the same rule, read-side.
 *
 * Tier 3 is per TASK, not per clan: two tasks in the same foreign clan can
 * legitimately differ — one full because the viewer set it, one title-only
 * because somebody else did.
 *
 * Org isolation is automatic (`db/organizationScope.js` injects
 * organization_id), so there is deliberately no org predicate below.
 */
class MenteeRecordService {
  /**
   * Every clan this mentee has been in — the union of two sources.
   *
   * Membership alone is not enough. It is the normal source, but a row can be
   * deleted rather than flipped, and then the clan vanishes from the record
   * while its tasks remain. Reading DISTINCT clan_id off the tasks as well
   * costs one indexed query and makes the record independent of membership
   * bookkeeping having survived.
   */
  async listClanHistory(menteeId) {
    if (!menteeId) return [];

    const memberships = await models.ClanMembership.findAll({
      where: {
        userId: menteeId,
        role: 'mentee',
        // HISTORICAL, not VISIBLE: 'removed' is exactly the clan they left, and
        // that row is the only trace the time there happened.
        status: { [Op.in]: HISTORICAL_MEMBERSHIP_STATUSES },
      },
      attributes: ['clanId', 'status', 'joinedAt', 'leftAt'],
      include: [{
        model: models.Clan,
        as: 'clan',
        attributes: ['id', 'name', 'kind', 'programId'],
        required: true,
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'], required: false }],
      }],
      order: [['joinedAt', 'ASC']],
    });

    const byClan = new Map();
    for (const m of memberships) {
      if (!m.clanId || byClan.has(m.clanId)) continue;
      byClan.set(m.clanId, {
        clanId: m.clanId,
        clanName: m.clan?.name || null,
        clanKind: m.clan?.kind || 'cohort',
        programId: m.clan?.programId || null,
        programName: m.clan?.program?.name || null,
        membershipStatus: m.status,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        current: m.status !== 'removed',
      });
    }

    // Clans that hold this mentee's work but no longer hold a membership row.
    const orphanClanIds = (await models.AssignedTask.findAll({
      where: { menteeId, clanId: { [Op.ne]: null } },
      attributes: ['clanId'],
      group: ['clanId'],
      raw: true,
    })).map((r) => r.clanId).filter((id) => id && !byClan.has(id));

    if (orphanClanIds.length) {
      const clans = await models.Clan.findAll({
        where: { id: { [Op.in]: orphanClanIds } },
        attributes: ['id', 'name', 'kind', 'programId'],
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'], required: false }],
      });
      for (const clan of clans) {
        byClan.set(clan.id, {
          clanId: clan.id,
          clanName: clan.name,
          clanKind: clan.kind || 'cohort',
          programId: clan.programId || null,
          programName: clan.program?.name || null,
          membershipStatus: null,
          joinedAt: null,
          leftAt: null,
          current: false,
        });
      }
    }

    return [...byClan.values()];
  }

  /**
   * Per-(mentee, clan) tallies, batched.
   *
   * Extracted from `standingClanService.priorRecord` so both read the same
   * counting rules. "Unfinished" is anything not completed and not cancelled —
   * keep that exact definition; the standing-clan tests assert it.
   */
  async tallyByMenteeClan(menteeIds, clanIds) {
    const empty = { taskTally: new Map(), openBlockers: new Map(), latestCertByMentee: new Map() };
    if (!menteeIds?.length || !clanIds?.length) return empty;

    const [tasks, blockers, certificates] = await Promise.all([
      models.AssignedTask.findAll({
        where: { clanId: { [Op.in]: clanIds }, menteeId: { [Op.in]: menteeIds } },
        attributes: ['menteeId', 'clanId', 'status'],
        raw: true,
      }),
      models.Blocker.findAll({
        where: { clanId: { [Op.in]: clanIds }, menteeId: { [Op.in]: menteeIds }, status: { [Op.ne]: 'resolved' } },
        attributes: ['menteeId', 'clanId'],
        raw: true,
      }),
      models.CertificateInstance.findAll({
        where: { menteeId: { [Op.in]: menteeIds } },
        attributes: ['menteeId', 'tier', 'certificateNumber', 'createdAt'],
        raw: true,
      }),
    ]);

    const key = (menteeId, clanId) => `${menteeId}:${clanId}`;
    const taskTally = new Map();
    for (const t of tasks) {
      const k = key(t.menteeId, t.clanId);
      const row = taskTally.get(k) || { assigned: 0, completed: 0, unfinished: 0 };
      row.assigned += 1;
      if (t.status === 'completed') row.completed += 1;
      else if (t.status !== 'cancelled') row.unfinished += 1;
      taskTally.set(k, row);
    }

    const openBlockers = new Map();
    for (const b of blockers) {
      const k = key(b.menteeId, b.clanId);
      openBlockers.set(k, (openBlockers.get(k) || 0) + 1);
    }

    const latestCertByMentee = new Map();
    for (const c of certificates) {
      const existing = latestCertByMentee.get(c.menteeId);
      if (!existing || new Date(c.createdAt) > new Date(existing.createdAt)) latestCertByMentee.set(c.menteeId, c);
    }

    return { taskTally, openBlockers, latestCertByMentee };
  }

  /**
   * The record. `actor` decides the tiers; the mentee decides the content.
   *
   * `includeTasks: false` returns clans + metrics only — what the clan-review
   * card needs, so a hot per-mentee path does not pull a full task list.
   */
  async getMenteeRecord(menteeId, actor, { includeTasks = true, taskLimit = 400 } = {}) {
    const mentee = await models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'],
    });
    if (!mentee) return null;

    const clans = await this.listClanHistory(menteeId);
    const sectionErrors = {};

    /**
     * `hasAdminAccess`, not `actsAsAdmin`: this is a per-record read, matching
     * `canViewMentee` and `cohortController.getMenteeProfile`. `actsAsAdmin` is
     * for narrowing LISTS by the portal hat — using it here would withhold a
     * chart from the one person accountable for the whole organisation.
     */
    const [isAdmin, mentoredClanIds] = await Promise.all([
      authzService.hasAdminAccess(actor),
      authzService.mentoredClanIds(actor.id),
    ]);
    const mine = new Set(mentoredClanIds);

    const withVisibility = clans.map((clan) => ({
      ...clan,
      visibility: isAdmin || mine.has(clan.clanId) ? 'full' : 'summary',
      mentoredByViewer: mine.has(clan.clanId),
    }));

    if (!withVisibility.length) {
      return {
        menteeId,
        mentee: mentee.toJSON(),
        viewer: { isAdmin, mentoredClanIds },
        clans: [],
        totals: { clans: 0, programmes: 0, tasksAssigned: 0, tasksCompleted: 0, tasksUnfinished: 0, openBlockers: 0 },
        sectionErrors,
      };
    }

    const clanIds = withVisibility.map((c) => c.clanId);
    let tally = { taskTally: new Map(), openBlockers: new Map(), latestCertByMentee: new Map() };
    try {
      tally = await this.tallyByMenteeClan([menteeId], clanIds);
    } catch (error) {
      // Counts are the point of the summary, so a failure here is worth saying.
      sectionErrors.metrics = error.message;
      logger.warn(`[menteeRecord] tally failed for ${menteeId}: ${error.message}`);
    }

    const tasksByClan = includeTasks
      ? await this._tasksByClan(menteeId, clanIds, withVisibility, actor, { taskLimit, sectionErrors })
      : new Map();

    const key = `${menteeId}:`;
    const out = withVisibility.map((clan) => {
      const t = tally.taskTally.get(key + clan.clanId) || { assigned: 0, completed: 0, unfinished: 0 };
      return {
        ...clan,
        metrics: {
          tasksAssigned: t.assigned,
          tasksCompleted: t.completed,
          tasksUnfinished: t.unfinished,
          openBlockers: tally.openBlockers.get(key + clan.clanId) || 0,
        },
        ...(includeTasks ? { tasks: tasksByClan.get(clan.clanId) || [] } : {}),
      };
    });

    // Current clans first, then most recently active.
    out.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0);
    });

    const certificate = tally.latestCertByMentee.get(menteeId) || null;
    return {
      menteeId,
      mentee: mentee.toJSON(),
      viewer: { isAdmin, mentoredClanIds },
      clans: out,
      certificate: certificate
        ? { tier: certificate.tier, certificateNumber: certificate.certificateNumber }
        : null,
      totals: {
        clans: out.length,
        programmes: new Set(out.map((c) => c.programId).filter(Boolean)).size,
        tasksAssigned: out.reduce((n, c) => n + c.metrics.tasksAssigned, 0),
        tasksCompleted: out.reduce((n, c) => n + c.metrics.tasksCompleted, 0),
        tasksUnfinished: out.reduce((n, c) => n + c.metrics.tasksUnfinished, 0),
        openBlockers: out.reduce((n, c) => n + c.metrics.openBlockers, 0),
      },
      sectionErrors,
    };
  }

  /**
   * Tasks per clan, with the tier decided BEFORE any detail is fetched.
   *
   * That ordering is the safeguard: a withheld submission is never loaded, let
   * alone serialised. Deciding first and deleting later is how this kind of
   * boundary leaks.
   */
  async _tasksByClan(menteeId, clanIds, clansWithVisibility, actor, { taskLimit, sectionErrors }) {
    const byClan = new Map(clanIds.map((id) => [id, []]));

    const rows = await models.AssignedTask.findAll({
      where: { menteeId, clanId: { [Op.in]: clanIds } },
      attributes: ['id', 'clanId', 'mentorId', 'status', 'dueDate', 'completedAt', 'isLate', 'titleOverride', 'finalRating'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type'], required: false }],
      order: [['assignedAt', 'DESC']],
      limit: taskLimit,
    });

    const visibilityOf = new Map(clansWithVisibility.map((c) => [c.clanId, c.visibility]));
    const shaped = rows.map((row) => {
      const assignedByViewer = row.mentorId === actor.id;
      return {
        row,
        assignedByViewer,
        // Tier 3 overrides the clan's tier, per task.
        detail: visibilityOf.get(row.clanId) === 'full' || assignedByViewer ? 'full' : 'titleOnly',
      };
    });

    const fullIds = shaped.filter((s) => s.detail === 'full').map((s) => s.row.id);
    let submissionsByTask = new Map();
    if (fullIds.length) {
      try {
        const submissions = await models.TaskSubmission.findAll({
          where: { assignedTaskId: { [Op.in]: fullIds } },
          attributes: ['id', 'assignedTaskId', 'version', 'status', 'submittedAt'],
          order: [['version', 'DESC']],
        });
        for (const s of submissions) {
          const list = submissionsByTask.get(s.assignedTaskId) || [];
          if (list.length < 3) list.push(s.toJSON());
          submissionsByTask.set(s.assignedTaskId, list);
        }
      } catch (error) {
        submissionsByTask = new Map();
        sectionErrors.submissions = error.message;
      }
    }

    for (const { row, assignedByViewer, detail } of shaped) {
      const base = {
        id: row.id,
        title: row.titleOverride || row.roadmapTask?.title || 'Untitled task',
        type: row.roadmapTask?.type || null,
        status: row.status,
        dueDate: row.dueDate,
        completedAt: row.completedAt,
        isLate: row.isLate,
        mentorId: row.mentorId,
        assignedByViewer,
        detail,
      };
      // The keys are ABSENT on a title-only task, not null: an absent key
      // cannot be rendered by accident, and the shape documents the boundary.
      if (detail === 'full') {
        base.finalRating = row.finalRating;
        base.submissions = submissionsByTask.get(row.id) || [];
      }
      byClan.get(row.clanId)?.push(base);
    }

    return byClan;
  }

  /**
   * Open work in the mentee's OTHER clans — the narrow read for clan review.
   *
   * This is the part that changes a mentor's next decision: something they are
   * already mid-way through elsewhere is the thing you do not want to assign
   * over. Titles and status only, never detail.
   */
  async openWorkElsewhere(menteeId, actor, { excludeClanId = null } = {}) {
    const clans = await this.listClanHistory(menteeId);
    const others = clans.filter((c) => c.clanId !== excludeClanId);
    if (!others.length) return [];

    const nameOf = new Map(others.map((c) => [c.clanId, c.clanName]));
    const rows = await models.AssignedTask.findAll({
      where: {
        menteeId,
        clanId: { [Op.in]: others.map((c) => c.clanId) },
        status: { [Op.notIn]: ['completed', 'cancelled'] },
      },
      attributes: ['id', 'clanId', 'mentorId', 'status', 'dueDate', 'titleOverride'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'], required: false }],
      order: [['dueDate', 'ASC']],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.titleOverride || row.roadmapTask?.title || 'Untitled task',
      status: row.status,
      dueDate: row.dueDate,
      clanId: row.clanId,
      clanName: nameOf.get(row.clanId) || null,
      assignedByViewer: row.mentorId === actor.id,
    }));
  }
}

module.exports = new MenteeRecordService();
