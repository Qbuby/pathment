/**
 * poolService — the System Pool itself: create and configure a pool, move it
 * through its life, and answer "where is everybody?" for the operator.
 *
 * A pool is bound to a programme, which is the scope every `pool.*`
 * permission is checked at (routes resolve it with `authzService.scopeOfPool`).
 * Members, work, scoring and placement live in their own services:
 *   poolMemberService     candidates in and out
 *   poolTaskService       qualifying work
 *   poolScoringService    scores, shortlist, decisions
 *   poolPlacementService  clans
 *   poolReminderService   reminders
 */
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');

/**
 * Where a pool may go next. Forward through the round, back to qualifying if
 * reviewing turns up work that needs redoing, and closed from anywhere.
 */
const TRANSITIONS = {
  draft: ['open', 'closed'],
  open: ['qualifying', 'reviewing', 'closed'],
  qualifying: ['open', 'reviewing', 'closed'],
  reviewing: ['qualifying', 'placing', 'closed'],
  placing: ['reviewing', 'closed'],
  closed: [],
};

const SCORE_SOURCES = ['quiz', 'task_review', 'interview_review', 'manual'];

const REMINDER_DEFAULTS = {
  enabled: true,
  inviteAfterDays: 3,
  inviteMaxCount: 2,
  dueSoonHours: 48,
  inactivityDays: 5,
  inactivityMaxCount: 2,
};

const SETTINGS_DEFAULTS = {
  autoAssignOnActivation: true,
  waitlistSize: null, // null → as many as the quota
  targetClanIds: [],
};

const int = (value, { min = 0, max = 100000 } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
};

const date = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${label} is not a valid date`);
  return d;
};

/**
 * A scoring policy is a list of components, each with a visible label, weight,
 * source and maximum, whose weights add up to 100. Nothing else is accepted —
 * the total must always be explainable from its parts.
 */
function validateScoringPolicy(policy, { previousVersion = 0 } = {}) {
  const components = Array.isArray(policy?.components) ? policy.components : [];
  const seen = new Set();
  const clean = components.map((c, i) => {
    const key = String(c.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
    const label = String(c.label || '').trim().slice(0, 80);
    const weight = Number(c.weight);
    if (!key) throw new ValidationError(`Score component ${i + 1} needs a key`);
    if (seen.has(key)) throw new ValidationError(`Score component "${key}" appears twice`);
    seen.add(key);
    if (!label) throw new ValidationError(`Score component "${key}" needs a label`);
    if (!SCORE_SOURCES.includes(c.source)) {
      throw new ValidationError(`Score component "${label}" has an unknown source (use ${SCORE_SOURCES.join(', ')})`);
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      throw new ValidationError(`Score component "${label}" needs a weight between 0 and 100`);
    }
    return { key, label, weight, source: c.source, required: c.required !== false, max: 100 };
  });
  if (clean.length) {
    const total = clean.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new ValidationError(`Score weights must add up to 100% (they add up to ${Math.round(total * 100) / 100}%)`);
    }
  }
  return { version: previousVersion + 1, components: clean };
}

function validateReminderPolicy(policy = {}) {
  const out = { ...REMINDER_DEFAULTS };
  if (policy.enabled !== undefined) out.enabled = Boolean(policy.enabled);
  for (const key of ['inviteAfterDays', 'inviteMaxCount', 'inactivityDays', 'inactivityMaxCount']) {
    if (policy[key] === undefined) continue;
    const n = int(policy[key], { min: 0, max: 60 });
    if (Number.isNaN(n)) throw new ValidationError(`Reminder setting ${key} must be a whole number from 0 to 60`);
    out[key] = n ?? REMINDER_DEFAULTS[key];
  }
  if (policy.dueSoonHours !== undefined) {
    const n = int(policy.dueSoonHours, { min: 0, max: 24 * 14 });
    if (Number.isNaN(n)) throw new ValidationError('Reminder setting dueSoonHours must be a whole number of hours (up to 14 days)');
    out.dueSoonHours = n ?? REMINDER_DEFAULTS.dueSoonHours;
  }
  return out;
}

function validateSettings(settings = {}, current = {}) {
  // Pool work never awards points; drop the retired flag if an older pool still stores it.
  const { awardPoints: _retired, ...kept } = current || {};
  const out = { ...SETTINGS_DEFAULTS, ...kept };
  if (settings.autoAssignOnActivation !== undefined) out.autoAssignOnActivation = Boolean(settings.autoAssignOnActivation);
  if (settings.waitlistSize !== undefined) {
    const n = int(settings.waitlistSize, { min: 0 });
    if (Number.isNaN(n)) throw new ValidationError('Waitlist size must be a whole number');
    out.waitlistSize = n;
  }
  if (settings.targetClanIds !== undefined) {
    if (!Array.isArray(settings.targetClanIds)) throw new ValidationError('targetClanIds must be a list');
    out.targetClanIds = [...new Set(settings.targetClanIds.map(String))];
  }
  return out;
}

class PoolService {
  constructor() {
    this.TRANSITIONS = TRANSITIONS;
    this.validateScoringPolicy = validateScoringPolicy;
    this.validateReminderPolicy = validateReminderPolicy;
  }

  async _program(programId) {
    const program = programId ? await models.Program.findByPk(programId, { attributes: ['id', 'name'] }) : null;
    if (!program) throw new ValidationError('Choose a programme for this pool');
    return program;
  }

  async _assertCohortInProgram(cohortId, programId) {
    if (!cohortId) return null;
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId'] });
    if (!cohort) throw new ValidationError('That cohort does not exist');
    if (cohort.programId !== programId) throw new ValidationError('That cohort belongs to a different programme');
    return cohort;
  }

  async _assertClansInProgram(clanIds, programId) {
    if (!clanIds?.length) return;
    const clans = await models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'programId'] });
    if (clans.length !== clanIds.length || clans.some((c) => c.programId !== programId)) {
      throw new ValidationError('Every target clan must belong to the pool\'s programme');
    }
  }

  _fields(data, { creating, pool } = {}) {
    const out = {};
    if (creating || data.name !== undefined) {
      const name = String(data.name || '').trim();
      if (!name) throw new ValidationError('A pool needs a name');
      out.name = name.slice(0, 160);
    }
    if (data.description !== undefined) out.description = data.description ? String(data.description) : null;
    if (creating || data.selectionQuota !== undefined) {
      const quota = int(data.selectionQuota, { min: 1 });
      if (!quota) throw new ValidationError('Say how many candidates the shortlist selects (at least 1)');
      out.selectionQuota = quota;
    }
    if (data.capacity !== undefined) {
      const capacity = int(data.capacity, { min: 1 });
      if (Number.isNaN(capacity)) throw new ValidationError('Capacity must be a whole number of at least 1, or empty for no limit');
      out.capacity = capacity;
    }
    for (const [field, label] of [['opensAt', 'Opening date'], ['closesAt', 'Closing date'], ['qualificationDueAt', 'Qualification deadline']]) {
      if (data[field] !== undefined) out[field] = date(data[field], label);
    }
    const opensAt = out.opensAt !== undefined ? out.opensAt : pool?.opensAt;
    const closesAt = out.closesAt !== undefined ? out.closesAt : pool?.closesAt;
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      throw new ValidationError('The closing date must be after the opening date');
    }
    const capacity = out.capacity !== undefined ? out.capacity : pool?.capacity;
    const quota = out.selectionQuota !== undefined ? out.selectionQuota : pool?.selectionQuota;
    if (capacity && quota && quota > capacity) {
      throw new ValidationError('The shortlist cannot select more candidates than the pool can hold');
    }
    return out;
  }

  /** Pools the caller may see. `programIds === null` means every programme. */
  async listPools({ programIds = null, status = null, programId = null } = {}) {
    if (Array.isArray(programIds) && (!programIds.length || (programId && !programIds.includes(programId)))) return [];
    const where = {};
    if (programId) where.programId = programId;
    else if (Array.isArray(programIds)) where.programId = { [Op.in]: programIds };
    if (status === 'archived') where.archivedAt = { [Op.ne]: null };
    else {
      where.archivedAt = null;
      if (status) where.status = status;
    }
    const pools = await models.CandidatePool.findAll({
      where,
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    if (!pools.length) return [];
    const counts = await models.PoolMember.findAll({
      where: { poolId: { [Op.in]: pools.map((p) => p.id) } },
      attributes: ['poolId', 'status', 'decision'],
      raw: true,
    });
    return pools.map((pool) => {
      const mine = counts.filter((c) => c.poolId === pool.id);
      return {
        ...pool.toJSON(),
        memberCount: mine.filter((m) => !['withdrawn', 'disqualified'].includes(m.decision)).length,
        invitedCount: mine.filter((m) => m.status === 'invited' && !m.decision).length,
        selectedCount: mine.filter((m) => m.decision === 'selected').length,
      };
    });
  }

  async getPool(poolId) {
    const pool = await models.CandidatePool.findByPk(poolId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] },
        { model: models.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
    });
    if (!pool) throw new NotFoundError('Pool not found');
    return pool;
  }

  async createPool(data, actor) {
    const program = await this._program(data.programId);
    await this._assertCohortInProgram(data.cohortId, program.id);
    const settings = validateSettings(data.settings || {});
    await this._assertClansInProgram(settings.targetClanIds, program.id);
    const pool = await models.CandidatePool.create({
      ...this._fields(data, { creating: true }),
      programId: program.id,
      cohortId: data.cohortId || null,
      status: 'draft',
      scoringPolicy: validateScoringPolicy(data.scoringPolicy || { components: [] }, { previousVersion: 0 }),
      reminderPolicy: validateReminderPolicy(data.reminderPolicy || {}),
      settings,
      createdById: actor.id,
    });
    await this.audit(pool.id, actor.id, 'POOL_CREATED', { name: pool.name, programId: pool.programId, selectionQuota: pool.selectionQuota });
    return this.getPool(pool.id);
  }

  /**
   * Edit a pool. The programme never changes (it is the permission scope).
   * Changing the scoring policy issues a new policy VERSION; shortlists already
   * generated keep the policy they were made with.
   */
  async updatePool(poolId, data, actor) {
    const pool = await this.getPool(poolId);
    if (pool.status === 'closed') throw new ValidationError('A closed pool cannot be edited');
    if (data.programId && data.programId !== pool.programId) {
      throw new ValidationError('A pool cannot move to another programme');
    }
    const patch = this._fields(data, { pool });
    if (data.cohortId !== undefined) {
      await this._assertCohortInProgram(data.cohortId, pool.programId);
      patch.cohortId = data.cohortId || null;
    }
    if (data.scoringPolicy !== undefined) {
      if (await this.isSelectionConfirmed(poolId)) {
        throw new ValidationError('The scoring policy cannot change after a shortlist has been confirmed');
      }
      patch.scoringPolicy = validateScoringPolicy(data.scoringPolicy, { previousVersion: pool.scoringPolicy?.version || 0 });
    }
    if (data.reminderPolicy !== undefined) patch.reminderPolicy = validateReminderPolicy({ ...pool.reminderPolicy, ...data.reminderPolicy });
    if (data.settings !== undefined) {
      patch.settings = validateSettings(data.settings, pool.settings || {});
      await this._assertClansInProgram(patch.settings.targetClanIds, pool.programId);
    }
    const before = {};
    for (const key of Object.keys(patch)) before[key] = pool.get(key);
    await pool.update(patch);
    await this.audit(pool.id, actor.id, 'POOL_UPDATED', { changed: Object.keys(patch) }, before);
    return this.getPool(pool.id);
  }

  async setStatus(poolId, status, actor) {
    const pool = await this.getPool(poolId);
    if (pool.archivedAt) throw new ValidationError('This pool is archived');
    const allowed = TRANSITIONS[pool.status] || [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`A ${pool.status} pool cannot move to ${status}${allowed.length ? ` (it can move to ${allowed.join(', ')})` : ''}`);
    }
    const from = pool.status;
    await pool.update({ status });
    await this.audit(pool.id, actor.id, 'POOL_STATUS_CHANGED', { from, to: status });
    return this.getPool(pool.id);
  }

  /**
   * Has a person confirmed the selection? Confirming is what writes the
   * selection decisions, so a member holding one is the record of it.
   */
  async isSelectionConfirmed(poolId) {
    return Boolean(await models.PoolMember.findOne({
      where: { poolId, decision: { [Op.in]: ['selected', 'waitlisted', 'not_selected'] } },
      attributes: ['id'],
    }));
  }

  /** Archive hides a finished (or abandoned draft) pool from the list. */
  async archive(poolId, actor) {
    const pool = await this.getPool(poolId);
    if (!['closed', 'draft'].includes(pool.status)) throw new ValidationError('Close the pool before archiving it');
    await pool.update({ archivedAt: new Date() });
    await this.audit(pool.id, actor.id, 'POOL_ARCHIVED', {});
    return this.getPool(pool.id);
  }

  /**
   * Is the pool accepting this kind of change? Candidates can be added and
   * work assigned while the pool is open through reviewing — never once it is
   * closed or archived.
   */
  assertActive(pool, what = 'change') {
    if (pool.archivedAt || pool.status === 'closed') {
      throw new ValidationError(`This pool is closed — it cannot ${what}`);
    }
  }

  /**
   * One candidate's place in the round, for the operator dashboard. Derived
   * from their work every time, never stored, so it cannot drift.
   */
  bucketOf(member, tasks, { inactivityDays = REMINDER_DEFAULTS.inactivityDays, now = new Date() } = {}) {
    if (member.decision === 'withdrawn' || member.decision === 'disqualified') return 'withdrawn';
    if (!member.userId) return 'invite_pending';
    const live = tasks.filter((t) => t.status !== 'cancelled');
    if (!live.length) return 'not_started';
    const statuses = live.map((t) => t.status);
    if (statuses.every((s) => s === 'completed')) return 'completed';
    if (statuses.includes('revision_needed')) return 'changes_requested';
    if (statuses.includes('submitted')) {
      return statuses.every((s) => s === 'submitted' || s === 'completed') ? 'needs_review' : 'in_progress';
    }
    const lastActivity = Math.max(
      new Date(member.details?.activatedAt || member.createdAt).getTime(),
      ...live.map((t) => new Date(t.updatedAt || t.assignedAt || 0).getTime())
    );
    if (inactivityDays && now.getTime() - lastActivity > inactivityDays * 86400000) return 'stalled';
    if (statuses.some((s) => s === 'in_progress' || s === 'completed')) return 'in_progress';
    return 'not_started';
  }

  /**
   * The pool's work items, each shaped the way the screens read them.
   * `cancelledAt` is kept on the item; callers filter when they want live work.
   */
  workItems(pool) {
    return (Array.isArray(pool.workItems) ? pool.workItems : []).map((w) => ({ ...w }));
  }

  /** The work item a pool task belongs to — matched on its task template. */
  workItemForTask(pool, roadmapTaskId) {
    const matching = this.workItems(pool).filter((w) => w.roadmapTaskId === roadmapTaskId);
    // A step cancelled and added again has two items; the live one is the answer.
    return matching.find((w) => !w.cancelledAt) || matching[matching.length - 1] || null;
  }

  /** Every member with their bucket and per-work-item status. */
  async dashboard(poolId) {
    const pool = await this.getPool(poolId);
    const [members, tasks] = await Promise.all([
      models.PoolMember.findAll({
        where: { poolId },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'] },
          { model: models.Clan, as: 'placedClan', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'ASC']],
      }),
      models.AssignedTask.scope('withPoolWork').findAll({
        where: { poolMemberId: { [Op.ne]: null } },
        include: [{ model: models.PoolMember, as: 'poolMember', attributes: [], where: { poolId }, required: true }],
        attributes: ['id', 'poolMemberId', 'roadmapTaskId', 'status', 'dueDate', 'submittedAt', 'completedAt', 'updatedAt', 'assignedAt', 'isLate'],
      }),
    ]);
    const assignments = this.workItems(pool);
    // Target clans live in each member's placement JSON; name them in one read.
    const targetIds = [...new Set(members.map((m) => m.placement?.targetClanId).filter(Boolean))];
    const targetClans = targetIds.length
      ? new Map((await models.Clan.findAll({ where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'name'] })).map((c) => [c.id, c]))
      : new Map();
    const tasksByMember = new Map();
    for (const t of tasks) {
      if (!tasksByMember.has(t.poolMemberId)) tasksByMember.set(t.poolMemberId, []);
      tasksByMember.get(t.poolMemberId).push(t);
    }
    const invites = await models.RegistrationInvite.findAll({
      where: { id: { [Op.in]: members.map((m) => m.inviteId).filter(Boolean) } },
      attributes: ['id', 'expiresAt', 'usedAt', 'revokedAt'],
    });
    const inviteById = new Map(invites.map((i) => [i.id, i]));
    const inactivityDays = pool.reminderPolicy?.inactivityDays ?? REMINDER_DEFAULTS.inactivityDays;
    const rows = members.map((m) => {
      const mine = tasksByMember.get(m.id) || [];
      const invite = m.inviteId ? inviteById.get(m.inviteId) : null;
      const targetClanId = m.placement?.targetClanId || null;
      return {
        id: m.id,
        email: m.email,
        name: models.PoolMember.displayName(m),
        userId: m.userId,
        source: m.details?.source || 'import',
        status: m.status,
        bucket: this.bucketOf(m, mine, { inactivityDays }),
        decision: m.decision,
        decisionReason: m.decisionReason,
        decidedAt: m.decidedAt,
        totalScore: m.totalScore,
        rank: m.rank,
        placementStatus: models.PoolMember.placementStatus(m),
        placementError: m.placedAt ? null : (m.placement?.error || null),
        placedClan: m.placedClan,
        targetClan: targetClanId ? (targetClans.get(targetClanId) || { id: targetClanId, name: 'Unknown clan' }) : null,
        activatedAt: m.details?.activatedAt || null,
        manualScores: m.manualScores,
        invite: invite ? {
          expired: !invite.usedAt && new Date(invite.expiresAt) < new Date(),
          revoked: Boolean(invite.revokedAt),
          expiresAt: invite.expiresAt,
        } : null,
        work: assignments.map((a) => {
          const t = mine.find((x) => x.roadmapTaskId === a.roadmapTaskId && x.status !== 'cancelled');
          return { assignmentId: a.id, taskId: t?.id || null, status: t?.status || null, dueDate: t?.dueDate || null, isLate: Boolean(t?.isLate) };
        }),
      };
    });
    const buckets = {};
    for (const r of rows) buckets[r.bucket] = (buckets[r.bucket] || 0) + 1;
    return { pool, assignments, members: rows, buckets };
  }

  /**
   * The pool's story, newest first. Shortlist snapshots carry the full ranking
   * in the log; the list here keeps only their summary, so the History screen
   * stays light however many candidates the pool holds.
   */
  async history(poolId) {
    const events = await models.AuditLog.findAll({
      where: { entityType: 'CandidatePool', entityId: poolId },
      order: [['createdAt', 'DESC']],
      limit: 500,
      include: models.AuditLog.associations.user
        ? [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
        : [],
    });
    return events.map((e) => {
      const json = e.toJSON();
      if (json.newValues?.entries) json.newValues = { ...json.newValues, entries: undefined, entryCount: json.newValues.entries.length };
      return json;
    });
  }

  /** Every pool event is logged against the pool, so one query reads its story. */
  async audit(poolId, userId, action, newValues = {}, oldValues = null) {
    await createAuditLog({
      userId, action, entityType: 'CandidatePool', entityId: poolId, newValues, ...(oldValues ? { oldValues } : {}),
    });
  }

  /**
   * A record that must exist — a shortlist snapshot. Unlike `audit`, which
   * never throws (a lost log line must not break a request), this writes
   * directly and fails loudly: a snapshot that silently went missing would be
   * a selection with no record of what it was based on.
   */
  async snapshot(poolId, userId, action, newValues) {
    const { getRequestContext } = require('../utils/auditContext');
    const ctx = getRequestContext();
    return models.AuditLog.create({
      userId: userId || ctx.userId || null,
      action,
      entityType: 'CandidatePool',
      entityId: poolId,
      newValues,
      ipAddress: ctx.ip || null,
      userAgent: ctx.userAgent || null,
      ...(models.AuditLog.rawAttributes.organizationId ? { organizationId: ctx.organizationId || null } : {}),
    });
  }

  /** Snapshots of one kind for this pool, oldest first. */
  async snapshots(poolId, actions) {
    return models.AuditLog.findAll({
      where: { entityType: 'CandidatePool', entityId: poolId, action: { [Op.in]: actions } },
      order: [['createdAt', 'ASC']],
    });
  }
}

module.exports = new PoolService();
module.exports.REMINDER_DEFAULTS = REMINDER_DEFAULTS;
module.exports.SETTINGS_DEFAULTS = SETTINGS_DEFAULTS;
module.exports.SCORE_SOURCES = SCORE_SOURCES;
