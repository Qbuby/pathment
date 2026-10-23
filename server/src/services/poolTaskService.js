/**
 * poolTaskService — qualifying work for the System Pool.
 *
 * Work is the formats Pathment already has: an ordinary task (reading, video,
 * exercise, project, practical, open source…), a quiz kit, or an interview
 * kit. There is no pool task format.
 *
 * Each piece of work is one entry in the pool's `workItems` list with its own
 * task template (RoadmapTask), and one AssignedTask per member pointing at
 * that template and tagged with `poolMemberId`. The tag keeps it out of every
 * clan screen (the AssignedTask default scope) and routes its review to the
 * pool (authzService.canActOnTask). The template is how a task is traced back
 * to its piece of work, and the partial unique index on
 * (pool_member_id, roadmap_task_id) means the same work reaches the same
 * member once, however many times it is assigned.
 *
 * Assigning deliberately does NOT go through taskService.createCustomTask:
 * that path requires a clan, an enrollment and a mentor, and loosening it
 * would let ordinary work be created without them. This is a separate door
 * into the same tables.
 */
const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { pointsForDifficulty } = require('../config/points');
const poolService = require('./poolService');
const poolWorkEvents = require('./poolWorkEvents');

// Task formats that are handed in as text, links and files. Quiz, interview and
// course have runners of their own and are assigned as their own kinds.
const SUBMITTABLE_TYPES = ['reading', 'video', 'exercise', 'project', 'discussion', 'practical', 'assessment', 'custom', 'assignment', 'open_source'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const EST_HOURS = { easy: 2, medium: 4, hard: 8, expert: 12 };
const OPEN_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];

const TaskModel = () => models.AssignedTask.scope('withPoolWork');

class PoolTaskService {
  /**
   * Change the pool's work list under a row lock, so two operators editing at
   * the same moment queue up instead of overwriting each other's change.
   */
  async _editWorkItems(poolId, change) {
    return sequelize.transaction(async (transaction) => {
      const pool = await models.CandidatePool.findByPk(poolId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!pool) throw new NotFoundError('Pool not found');
      const items = poolService.workItems(pool);
      const result = await change(items, pool, transaction);
      await pool.update({ workItems: items }, { transaction });
      return result;
    });
  }

  /** The pool's work, each with how far its members have got. */
  async listAssignments(poolId) {
    const pool = await poolService.getPool(poolId);
    const items = poolService.workItems(pool);
    if (!items.length) return [];
    const templates = await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: items.map((w) => w.roadmapTaskId) } },
      attributes: ['id', 'title', 'type', 'difficulty', 'deliverable'],
    });
    const rows = await TaskModel().findAll({
      where: { roadmapTaskId: { [Op.in]: items.map((w) => w.roadmapTaskId) }, poolMemberId: { [Op.ne]: null } },
      include: [{ model: models.PoolMember, as: 'poolMember', attributes: [], where: { poolId }, required: true }],
      attributes: ['roadmapTaskId', 'status'],
      raw: true,
    });
    return items.map((w) => {
      const counts = {};
      for (const r of rows) if (r.roadmapTaskId === w.roadmapTaskId) counts[r.status] = (counts[r.status] || 0) + 1;
      return { ...w, roadmapTask: templates.find((t) => t.id === w.roadmapTaskId) || null, counts };
    });
  }

  /** Validate a kit is ready to hand out. */
  async _kit(kind, kitId) {
    if (!kitId) throw new ValidationError(`Choose a ${kind} to assign`);
    const Kit = kind === 'quiz' ? models.QuizKit : models.InterviewKit;
    const Question = kind === 'quiz' ? models.QuizQuestion : models.InterviewQuestion;
    const kit = await Kit.findByPk(kitId);
    if (!kit) throw new NotFoundError(`That ${kind} does not exist`);
    if (kit.status !== 'published') throw new ValidationError(`Publish this ${kind} before assigning it`);
    if (!(await Question.count({ where: { kitId } }))) throw new ValidationError(`That ${kind} has no questions yet`);
    return kit;
  }

  /**
   * Create one piece of qualifying work for the pool and, optionally, hand it
   * out straight away.
   *
   *   kind 'task'       { roadmapTaskId } to reuse an existing roadmap step, or
   *                     { title, description, type, difficulty, deliverable,
   *                       acceptanceCriteria } for a one-off special assignment
   *   kind 'quiz'       { kitId, evaluationMode?, timeLimitSeconds?, passScore?, allowRetake?, showAnswers? }
   *   kind 'interview'  { kitId, …interview options }
   *   always            { componentKey?, required?, dueAt?, assignTo?: 'all' | memberId[] }
   */
  async createAssignment(poolId, data, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'take new work');
    const kind = data.kind || 'task';
    if (!models.CandidatePool.WORK_KINDS.includes(kind)) throw new ValidationError(`Unknown kind of work "${kind}"`);

    const componentKey = data.componentKey ? String(data.componentKey) : null;
    const components = pool.scoringPolicy?.components || [];
    if (componentKey && components.length && !components.some((c) => c.key === componentKey)) {
      throw new ValidationError('That score component is not part of this pool\'s scoring');
    }
    const dueAt = data.dueAt ? new Date(data.dueAt) : (pool.qualificationDueAt ? new Date(pool.qualificationDueAt) : null);
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError('The due date is not a valid date');

    let roadmapTask;
    let title;
    let config = {};
    if (kind === 'task' && data.roadmapTaskId) {
      roadmapTask = await models.RoadmapTask.findByPk(data.roadmapTaskId);
      if (!roadmapTask) throw new NotFoundError('That roadmap step does not exist');
      if (!SUBMITTABLE_TYPES.includes(roadmapTask.type)) {
        throw new ValidationError(`A ${roadmapTask.type} step is assigned through its own kind of work, not as a task`);
      }
      // The template identifies the piece of work, so one step can be used once per pool.
      if (poolService.workItems(pool).some((w) => w.roadmapTaskId === roadmapTask.id && !w.cancelledAt)) {
        throw new ValidationError('That roadmap step is already part of this pool\'s work');
      }
      title = roadmapTask.title;
    } else if (kind === 'task') {
      title = String(data.title || '').trim();
      if (!title) throw new ValidationError('Give the work a title');
      const type = data.type || 'assignment';
      if (!SUBMITTABLE_TYPES.includes(type)) throw new ValidationError(`Unknown task type "${type}"`);
      const difficulty = DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'medium';
      roadmapTask = await models.RoadmapTask.create({
        title: title.slice(0, 255),
        description: String(data.description || '').trim() || 'No description provided',
        type,
        difficulty,
        taskOrder: 0,
        deliverable: String(data.deliverable || '').trim() || 'Submit your work',
        acceptanceCriteria: Array.isArray(data.acceptanceCriteria)
          ? data.acceptanceCriteria.map((c) => String(c).trim()).filter(Boolean).slice(0, 30)
          : [],
        estimatedHours: EST_HOURS[difficulty],
        isMandatory: false,
        isCustomTask: true,
        pointsBase: pointsForDifficulty(difficulty),
      });
    } else {
      const kit = await this._kit(kind, data.kitId);
      title = String(data.title || '').trim() || kit.title || (kind === 'quiz' ? 'Quiz' : 'Interview');
      // Quizzes in a pool default to auto-grading: objective answers need no reviewer.
      const evaluationMode = kind === 'quiz' ? (data.evaluationMode || 'auto') : data.evaluationMode;
      config = { ...(data.options || {}), kitId: kit.id, ...(evaluationMode ? { evaluationMode } : {}) };
      for (const key of ['timeLimitSeconds', 'passScore', 'allowRetake', 'showAnswers', 'shuffleQuestions', 'timingMode', 'totalSeconds']) {
        if (data[key] !== undefined) config[key] = data[key];
      }
      roadmapTask = await models.RoadmapTask.create({
        title: title.slice(0, 255),
        description: String(data.description || '').trim() || (kind === 'quiz' ? 'Complete this quiz.' : 'Complete this interview.'),
        type: kind,
        difficulty: 'medium',
        taskOrder: 0,
        deliverable: kind === 'quiz' ? 'Complete the quiz' : 'Complete the interview',
        acceptanceCriteria: [],
        estimatedHours: 1,
        isMandatory: false,
        isCustomTask: true,
        pointsBase: pointsForDifficulty('medium'),
      });
    }

    const assignment = await this._editWorkItems(poolId, (items) => {
      const item = {
        id: crypto.randomUUID(),
        kind,
        roadmapTaskId: roadmapTask.id,
        title: title.slice(0, 255),
        componentKey,
        required: data.required !== false,
        dueAt: dueAt ? dueAt.toISOString() : null,
        config,
        createdById: actor.id,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      };
      items.push(item);
      return item;
    });
    await poolService.audit(pool.id, actor.id, 'POOL_WORK_CREATED', { assignmentId: assignment.id, kind, title: assignment.title, componentKey });

    let assigned = null;
    if (data.assignTo) {
      assigned = await this.assign(poolId, assignment.id, { memberIds: data.assignTo === 'all' ? null : data.assignTo }, actor);
    }
    return { assignment, assigned };
  }

  /**
   * Hand a piece of work to members — everyone active (memberIds null) or a
   * chosen group. Safe to repeat: a member who already holds it is skipped,
   * and the partial unique index makes a concurrent double-assign impossible.
   */
  async assign(poolId, assignmentId, { memberIds = null } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'assign work');
    const assignment = poolService.workItems(pool).find((w) => w.id === assignmentId);
    if (!assignment) throw new NotFoundError('That work is not part of this pool');
    if (assignment.cancelledAt) throw new ValidationError('That work was cancelled');

    const where = { poolId };
    if (Array.isArray(memberIds)) {
      if (!memberIds.length) throw new ValidationError('Choose at least one candidate');
      where.id = { [Op.in]: memberIds };
    }
    const members = await models.PoolMember.findAll({ where, order: [['createdAt', 'ASC']] });
    const results = [];
    for (const member of members) {
      results.push(await this._assignOne(pool, assignment, member, actor?.id || assignment.createdById || pool.createdById));
    }
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        if (!members.some((m) => m.id === id)) results.push({ memberId: id, result: 'failed', reason: 'Not a candidate in this pool' });
      }
    }
    const summary = { assigned: 0, skipped: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    if (actor) await poolService.audit(pool.id, actor.id, 'POOL_WORK_ASSIGNED', { assignmentId, ...summary });
    return { summary, results };
  }

  async _assignOne(pool, assignment, member, mentorId) {
    const base = { memberId: member.id, email: member.email };
    if (!member.userId) return { ...base, result: 'skipped', reason: 'Has not activated their account yet — they receive it on activation' };
    if (member.decision) return { ...base, result: 'skipped', reason: `Already ${member.decision.replace('_', ' ')}` };
    const existing = await TaskModel().findOne({
      where: { roadmapTaskId: assignment.roadmapTaskId, poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id'],
    });
    if (existing) return { ...base, result: 'skipped', reason: 'Already has this work', taskId: existing.id };

    const roadmapTask = await models.RoadmapTask.findByPk(assignment.roadmapTaskId, { attributes: ['id', 'title', 'pointsBase', 'difficulty'] });
    if (!roadmapTask) return { ...base, result: 'failed', reason: 'The work\'s template no longer exists' };
    const dueDate = assignment.dueAt || pool.qualificationDueAt || new Date(Date.now() + 7 * 86400000);
    let task;
    try {
      task = await sequelize.transaction(async (transaction) => {
        const created = await models.AssignedTask.create({
          roadmapTaskId: roadmapTask.id,
          menteeId: member.userId,
          mentorId,
          enrollmentId: null,
          clanId: null,
          poolMemberId: member.id,
          status: 'assigned',
          dueDate,
          pointsBase: roadmapTask.pointsBase ?? pointsForDifficulty(roadmapTask.difficulty || 'medium'),
          isCustomTask: true,
        }, { transaction });
        if (assignment.kind === 'quiz') {
          await require('./quizKitService').createAssignmentForTask(
            { assignedTaskId: created.id, kitId: assignment.config.kitId, options: assignment.config }, { transaction }
          );
        } else if (assignment.kind === 'interview') {
          await require('./interviewKitService').createAssignmentForTask(
            { assignedTaskId: created.id, kitId: assignment.config.kitId, options: assignment.config }, { transaction }
          );
        }
        return created;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) return { ...base, result: 'skipped', reason: 'Already has this work' };
      return { ...base, result: 'failed', reason: error.message };
    }

    await poolWorkEvents.refreshMemberStatus(member.id);
    try {
      const due = new Date(dueDate).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '');
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_WORK_ASSIGNED,
        recipients: [{ userId: member.userId }],
        payload: {
          title: `New qualifying work: ${assignment.title}`,
          message: `“${assignment.title}” is part of ${pool.name}. Due ${due}.`,
          actionUrl: poolWorkEvents.candidateTaskUrl(task.id),
          actionLabel: 'Open',
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id,
          emailSubject: `${pool.name}: ${assignment.title}`,
        },
        dedupe: { relatedEntityType: 'pool_work_assigned', relatedEntityId: task.id },
      });
    } catch (error) {
      console.error('[pool] work-assigned notification failed:', error.message);
    }
    return { ...base, result: 'assigned', taskId: task.id };
  }

  /** Everything in the pool that isn't cancelled → this one member (on activation). */
  async assignAllToMember(memberId, { actorId = null } = {}) {
    const member = await models.PoolMember.findByPk(memberId, { include: [{ model: models.CandidatePool, as: 'pool' }] });
    if (!member?.pool || member.pool.status === 'closed' || member.pool.archivedAt) return [];
    const results = [];
    for (const assignment of poolService.workItems(member.pool).filter((w) => !w.cancelledAt)) {
      results.push(await this._assignOne(member.pool, assignment, member, actorId || assignment.createdById || member.pool.createdById));
    }
    return results;
  }

  /** Withdraw a piece of work from the pool: cancels it for everyone who has not finished it. */
  async cancelAssignment(poolId, assignmentId, reason, actor) {
    const now = new Date();
    const { assignment, cancelled } = await this._editWorkItems(poolId, async (items, pool, transaction) => {
      const item = items.find((w) => w.id === assignmentId);
      if (!item) throw new NotFoundError('That work is not part of this pool');
      if (item.cancelledAt) return { assignment: item, cancelled: 0 };
      item.cancelledAt = now.toISOString();
      const [count] = await TaskModel().update(
        { status: 'cancelled', cancelledBy: actor.id, cancelledAt: now, cancellationReason: reason ? String(reason).slice(0, 2000) : 'Removed from the pool' },
        {
          where: {
            roadmapTaskId: item.roadmapTaskId,
            status: { [Op.in]: OPEN_STATUSES },
            poolMemberId: { [Op.in]: sequelize.literal(`(SELECT id FROM candidate_pool_members WHERE pool_id = ${sequelize.escape(pool.id)})`) },
          },
          transaction,
        }
      );
      return { assignment: item, cancelled: count };
    });
    await poolService.audit(poolId, actor.id, 'POOL_WORK_CANCELLED', { assignmentId, cancelled, reason: reason || null });
    return assignment;
  }

  /** A candidate opens a task: assigned → in progress (their own pool work only). */
  async startTask(taskId, userId) {
    const task = await TaskModel().findByPk(taskId);
    if (!task || !task.poolMemberId || task.menteeId !== userId) throw new NotFoundError('Task not found');
    await require('./clanLifecycleService').assertTaskWritable(task.id);
    if (['assigned', 'not_started'].includes(task.status)) {
      await task.update({ status: 'in_progress', startedAt: task.startedAt || new Date() });
      await poolWorkEvents.refreshMemberStatus(task.poolMemberId);
    } else if (task.status === 'cancelled') {
      throw new ForbiddenError('This work was cancelled');
    }
    return task;
  }
}

module.exports = new PoolTaskService();
module.exports.SUBMITTABLE_TYPES = SUBMITTABLE_TYPES;
