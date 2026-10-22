/**
 * poolReminderService — nudges for System Pool candidates.
 *
 * Runs inside notificationScheduler's per-workspace pass (hourly by default).
 * Three kinds, each configured on the pool's reminderPolicy:
 *
 *   invite_pending  the invitation has not been accepted     → resend it
 *   due_soon        a piece of work is due within N hours    → in-app + email
 *   inactivity      nothing has happened for N days          → in-app + email
 *
 * Stop conditions are checked when sending, not when scheduling, so a reminder
 * can never go out after the candidate handed the work in, withdrew, received
 * a decision, or the pool closed.
 *
 * Each reminder is CLAIMED before anything is sent: one conditional UPDATE
 * adds its key to the member's `reminders` JSON only if the key is not there
 * yet. Exactly one pass can win that update, so two passes racing — or a pass
 * re-run after a crash — never send the same reminder twice.
 */
const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { models, sequelize } = require('../db');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const poolService = require('./poolService');
const poolWorkEvents = require('./poolWorkEvents');

const DAY = 86400000;
const OPEN_TASK = ['assigned', 'not_started', 'in_progress', 'revision_needed'];
// Pools whose candidates are still working.
const REMINDING_STATUSES = ['open', 'qualifying'];

class PoolReminderService {
  /** Claim a reminder for a member. True only for the one caller that wins. */
  async _claim(member, key) {
    const rows = await sequelize.query(
      `UPDATE candidate_pool_members
          SET reminders = reminders || jsonb_build_object(CAST(:key AS text), CAST(:at AS text)), updated_at = NOW()
        WHERE id = :id AND organization_id = :org AND (reminders -> CAST(:key AS text)) IS NULL
        RETURNING id`,
      { replacements: { key, at: new Date().toISOString(), id: member.id, org: member.organizationId }, type: QueryTypes.SELECT }
    );
    return rows.length === 1;
  }

  async _notify(member, { title, message, actionUrl }) {
    // A fresh entity per reminder: notification dedupe is permanent per entity,
    // and the claim above already guarantees this one is sent once.
    const relatedEntityId = crypto.randomUUID();
    await require('./notificationOrchestrator').dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_REMINDER,
      recipients: [{ userId: member.userId }],
      payload: { title, message, actionUrl, actionLabel: 'Open', relatedEntityType: 'pool_reminder', relatedEntityId, emailSubject: title },
      dedupe: { relatedEntityType: 'pool_reminder', relatedEntityId },
    });
  }

  /** One pass over every reminding pool in the current workspace. */
  async tick(now = new Date()) {
    const pools = await models.CandidatePool.findAll({
      where: {
        status: { [Op.in]: REMINDING_STATUSES },
        archivedAt: null,
        [Op.or]: [{ closesAt: null }, { closesAt: { [Op.gt]: now } }],
      },
    });
    const sent = { invite_pending: 0, due_soon: 0, inactivity: 0 };
    for (const pool of pools) {
      const policy = { ...poolService.REMINDER_DEFAULTS, ...(pool.reminderPolicy || {}) };
      if (policy.enabled === false) continue;
      try {
        sent.invite_pending += await this._invites(pool, policy, now);
        sent.due_soon += await this._dueSoon(pool, policy, now);
        sent.inactivity += await this._inactive(pool, policy, now);
      } catch (error) {
        console.error(`[pool] reminders failed for pool ${pool.id}:`, error.message);
      }
    }
    return sent;
  }

  /** Not accepted after N days → resend the invitation (at most `inviteMaxCount` times). */
  async _invites(pool, policy, now) {
    if (!policy.inviteAfterDays || !policy.inviteMaxCount) return 0;
    const members = await models.PoolMember.findAll({
      where: { poolId: pool.id, userId: null, decision: null, status: 'invited' },
    });
    let sent = 0;
    for (const member of members) {
      const n = Math.floor((now - new Date(member.createdAt)) / (policy.inviteAfterDays * DAY));
      if (n < 1 || n > policy.inviteMaxCount) continue;
      if (!(await this._claim(member, `invite:${n}`))) continue;
      try {
        // The original link's token is not stored (only its hash), so the
        // reminder is a fresh invitation — the old link stops working.
        await require('./poolMemberService')._ensureInvite(member, pool, pool.createdById, { forceNew: true });
        sent += 1;
      } catch (error) {
        console.error('[pool] invite reminder failed:', error.message);
      }
    }
    return sent;
  }

  /** Work due within `dueSoonHours` and not handed in → one reminder per piece of work. */
  async _dueSoon(pool, policy, now) {
    if (!policy.dueSoonHours) return 0;
    const tasks = await models.AssignedTask.scope('withPoolWork').findAll({
      where: {
        status: { [Op.in]: OPEN_TASK },
        dueDate: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + policy.dueSoonHours * 3600000) },
      },
      include: [
        { model: models.PoolMember, as: 'poolMember', required: true, where: { poolId: pool.id, decision: null, userId: { [Op.ne]: null } } },
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] },
      ],
    });
    let sent = 0;
    for (const task of tasks) {
      if (!(await this._claim(task.poolMember, `due:${task.id}`))) continue;
      const title = task.roadmapTask?.title || 'Your qualifying work';
      await this._notify(task.poolMember, {
        title: `Due soon: ${title}`,
        message: `“${title}” for ${pool.name} is due ${new Date(task.dueDate).toUTCString().replace(/:\d\d GMT$/, ' UTC')}.`,
        actionUrl: poolWorkEvents.candidateTaskUrl(task.id),
      });
      sent += 1;
    }
    return sent;
  }

  /** Open work and no activity for `inactivityDays` → a nudge (at most `inactivityMaxCount`). */
  async _inactive(pool, policy, now) {
    if (!policy.inactivityDays || !policy.inactivityMaxCount) return 0;
    const members = await models.PoolMember.findAll({
      where: { poolId: pool.id, decision: null, userId: { [Op.ne]: null } },
    });
    if (!members.length) return 0;
    const tasks = await models.AssignedTask.scope('withPoolWork').findAll({
      where: { poolMemberId: { [Op.in]: members.map((m) => m.id) }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['poolMemberId', 'status', 'updatedAt'],
    });
    let sent = 0;
    for (const member of members) {
      const mine = tasks.filter((t) => t.poolMemberId === member.id);
      if (!mine.some((t) => OPEN_TASK.includes(t.status))) continue; // nothing left to do
      const last = Math.max(new Date(member.details?.activatedAt || member.createdAt).getTime(), ...mine.map((t) => new Date(t.updatedAt).getTime()));
      const n = Math.floor((now - last) / (policy.inactivityDays * DAY));
      if (n < 1 || n > policy.inactivityMaxCount) continue;
      // The key carries the last-activity time: a candidate who does something
      // and then goes quiet again is a new episode, not a repeat.
      if (!(await this._claim(member, `idle:${last}:${n}`))) continue;
      await this._notify(member, {
        title: `Still with us? ${pool.name}`,
        message: 'You have qualifying work waiting. Pick it up when you can — the deadline still applies.',
        actionUrl: '/candidate',
      });
      sent += 1;
    }
    return sent;
  }
}

module.exports = new PoolReminderService();
