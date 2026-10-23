/**
 * What happens around a piece of System Pool work when the shared task engine
 * touches it.
 *
 * The submission / review / quiz / interview code is reused as-is for pool
 * work. The few places where pool work must behave differently — who hears
 * about a submission, where the candidate's link points, keeping the
 * candidate's progress status current — call in here, so the shared engine
 * carries one `if (task.poolMemberId)` per decision instead of pool logic.
 */
const { Op } = require('sequelize');
const { models } = require('../db');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const { ROLES } = require('../config/roles');

const orchestrator = () => require('./notificationOrchestrator');

/** The candidate-facing link for one piece of qualifying work. */
function candidateTaskUrl(taskId) {
  // A candidate's qualifying work opens in the mentee workspace, in the pool
  // scope — there is no separate candidate area any more. `?pool=1` is how the
  // task screen knows to read it as pool work rather than clan work.
  return `/mentee/tasks/${taskId}?pool=1`;
}

/** The operator-facing link into a pool. */
function poolUrl(poolId, tab = null) {
  return `/admin/pools/${poolId}${tab ? `?tab=${tab}` : ''}`;
}

async function memberWithPool(poolMemberId) {
  if (!poolMemberId) return null;
  return models.PoolMember.findByPk(poolMemberId, {
    include: [{ model: models.CandidatePool, as: 'pool' }],
  });
}

/**
 * Everyone who holds `permission` for this pool by a PROGRAMME-scoped grant,
 * plus whoever created the pool. Org-wide admins are deliberately not swept
 * in: they hold every permission everywhere, and a pool of hundreds would bury
 * them. If nobody is named for the programme, the creator still hears.
 */
async function holdersOf(pool, permission) {
  const builtIn = Object.entries(ROLES)
    .filter(([, role]) => role.permissions !== '*' && role.permissions.includes(permission))
    .map(([key]) => key);
  const custom = await models.CustomRole.findAll({ attributes: ['key', 'permissions'] });
  const roles = [...builtIn, ...custom.filter((r) => (r.permissions || []).includes(permission)).map((r) => r.key)];
  const grants = await models.RoleAssignment.findAll({
    where: { role: { [Op.in]: roles }, scopeType: 'program', scopeId: pool.programId },
    attributes: ['userId'],
  });
  const ids = new Set(grants.map((g) => g.userId));
  if (pool.createdById) ids.add(pool.createdById);
  return [...ids];
}

/**
 * Recompute where a candidate is in their qualifying work, from the work
 * itself. Frozen once a decision exists — the selection was made on it.
 *
 *   invited     no account yet
 *   active      account, nothing started
 *   qualifying  something started, required work not all handed in
 *   reviewing   all work handed in, some still awaiting review
 *   completed   all work approved
 */
async function refreshMemberStatus(poolMemberId, { transaction } = {}) {
  const member = await models.PoolMember.findByPk(poolMemberId, { transaction });
  if (!member || member.decision) return member;
  let status;
  if (!member.userId) {
    status = 'invited';
  } else {
    const tasks = await models.AssignedTask.scope('withPoolWork').findAll({
      where: { poolMemberId, status: { [Op.ne]: 'cancelled' } },
      attributes: ['status'],
      transaction,
    });
    const statuses = tasks.map((t) => t.status);
    if (!statuses.length) status = 'active';
    else if (statuses.every((s) => s === 'completed')) status = 'completed';
    else if (statuses.every((s) => s === 'completed' || s === 'submitted')) status = 'reviewing';
    else if (statuses.some((s) => ['in_progress', 'submitted', 'revision_needed', 'completed'].includes(s))) status = 'qualifying';
    else status = 'active';
  }
  if (member.status !== status) await member.update({ status }, { transaction });
  return member;
}

/** Work was handed in: the pool's reviewers hear (in-app), not a mentor. */
async function onSubmitted(task, { submissionId, version = 1, kind = 'work' } = {}) {
  const member = await memberWithPool(task.poolMemberId);
  if (!member?.pool) return;
  await refreshMemberStatus(member.id);
  try {
    const reviewers = (await holdersOf(member.pool, P.POOL_REVIEW)).filter((id) => id !== task.menteeId);
    if (!reviewers.length) return;
    const who = models.PoolMember.displayName(member) || member.email;
    const roadmapTask = task.roadmapTask || await models.RoadmapTask.findByPk(task.roadmapTaskId, { attributes: ['title'] });
    const title = roadmapTask?.title || 'qualifying work';
    await orchestrator().dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_WORK_SUBMITTED,
      recipients: reviewers.map((userId) => ({ userId })),
      payload: {
        title: `${who} ${version > 1 ? 'resubmitted' : 'submitted'} ${kind === 'quiz' ? 'a quiz' : 'work'} in ${member.pool.name}`,
        message: `“${title}” is waiting for review.`,
        actionUrl: poolUrl(member.pool.id, 'review'),
        actionLabel: 'Review',
        relatedEntityType: 'task_submission',
        relatedEntityId: submissionId,
      },
      dedupe: { relatedEntityType: 'pool_work_submitted', relatedEntityId: submissionId },
    });
  } catch (error) {
    console.error('[pool] submission notification failed:', error.message);
  }
}

/** Work was reviewed: the candidate hears, with a link into the candidate area. */
async function onReviewed(task, { submissionId, isApproved, title } = {}) {
  if (!task.poolMemberId) return;
  await refreshMemberStatus(task.poolMemberId);
  try {
    await orchestrator().dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_WORK_REVIEWED,
      recipients: [{ userId: task.menteeId }],
      payload: {
        title: isApproved ? `“${title}” was approved` : `Changes requested on “${title}”`,
        message: isApproved
          ? 'Your qualifying work was reviewed and approved.'
          : 'A reviewer asked for another pass. Read the notes and resubmit before the deadline.',
        actionUrl: candidateTaskUrl(task.id),
        actionLabel: isApproved ? 'See review' : 'View notes & resubmit',
        relatedEntityType: 'task_submission',
        relatedEntityId: submissionId,
        emailSubject: isApproved ? `Approved: “${title}”` : `Changes requested: “${title}”`,
      },
      dedupe: { relatedEntityType: 'pool_work_reviewed', relatedEntityId: submissionId },
    });
  } catch (error) {
    console.error('[pool] review notification failed:', error.message);
  }
}

module.exports = {
  candidateTaskUrl,
  poolUrl,
  holdersOf,
  refreshMemberStatus,
  onSubmitted,
  onReviewed,
};
