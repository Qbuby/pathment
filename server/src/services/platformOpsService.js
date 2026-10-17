const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError } = require('../utils/errors/errorTypes');
const platformAudit = require('./platformAuditService');

const SKIP = { skipOrganizationScope: true };

/**
 * Operational health: the queues and background jobs that, until now, could
 * only be inspected with SQL or the email-admin DLQ page inside one tenant.
 * Reads are platform-wide; the only writes are a single-row email retry and a
 * scheduled-job toggle, both audited.
 */
async function countsByStatus(model) {
  const rows = await model.findAll({
    ...SKIP, raw: true,
    attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']],
    group: ['status'],
  });
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

class PlatformOpsService {
  async overview() {
    const [emailCounts, aiCounts, oldestPending, recentFailures, jobs] = await Promise.all([
      countsByStatus(models.EmailQueue),
      models.AIEvaluationQueue ? countsByStatus(models.AIEvaluationQueue) : {},
      models.EmailQueue.findOne({
        ...SKIP, where: { status: 'pending' }, order: [['createdAt', 'ASC']],
        attributes: ['createdAt'],
      }),
      models.EmailQueue.findAll({
        ...SKIP,
        where: { status: { [Op.in]: ['failed', 'dead'] } },
        order: [['updatedAt', 'DESC']],
        limit: 10,
        attributes: ['id', 'recipientEmail', 'subject', 'emailType', 'status', 'attemptCount', 'errorCategory', 'lastError', 'updatedAt'],
      }),
      models.ScheduledJob.findAll({ ...SKIP, order: [['jobName', 'ASC']] }).catch(() => []),
    ]);

    // The kill switches and rollout gates operators keep asking about, read
    // from the environment (never secrets - names and booleans only).
    const flags = [
      { key: 'MULTI_TENANT_WORKSPACES_ENABLED', value: process.env.MULTI_TENANT_WORKSPACES_ENABLED === 'true', description: 'Non-default workspace traffic (the big rollout gate)' },
      { key: 'PUBLIC_ORGANIZATION_SIGNUP_ENABLED', value: process.env.PUBLIC_ORGANIZATION_SIGNUP_ENABLED !== 'false', description: 'Self-serve first-workspace signup' },
      { key: 'NOTIFICATION_SCHEDULER_DISABLED', value: process.env.NOTIFICATION_SCHEDULER_DISABLED === 'true', description: 'Pauses the notification scheduler' },
      { key: 'CERTIFICATE_WORKER_DISABLED', value: process.env.CERTIFICATE_WORKER_DISABLED === 'true', description: 'Pauses certificate evaluation' },
      { key: 'AI_EVAL_WORKER_DISABLED', value: process.env.AI_EVAL_WORKER_DISABLED === 'true', description: 'Pauses AI evaluation batches' },
      { key: 'RESEND_API_KEY', value: Boolean(process.env.RESEND_API_KEY), description: 'Email provider configured (unset = outbound mail dead-letters)' },
    ];

    return {
      email: {
        countsByStatus: emailCounts,
        oldestPendingAt: oldestPending?.createdAt || null,
        recentFailures,
      },
      aiEvaluation: { countsByStatus: aiCounts },
      jobs: jobs.map((job) => ({
        id: job.id, jobName: job.jobName, jobType: job.jobType,
        cronExpression: job.cronExpression, isActive: job.isActive,
        lastRunAt: job.lastRunAt, nextRunAt: job.nextRunAt || null,
      })),
      flags,
    };
  }

  /** Requeue one failed email (mirrors the tenant email-admin retry). */
  async retryEmail(actor, id) {
    const row = await models.EmailQueue.findByPk(id, SKIP);
    if (!row) throw new NotFoundError('Email queue row not found');
    await row.update({ status: 'pending', nextAttemptAt: new Date(), attemptCount: 0, failedAt: null, errorCategory: null }, SKIP);
    await platformAudit.record({
      action: 'PLATFORM_EMAIL_RETRIED', targetType: 'EmailQueue', targetId: row.id,
      newValues: { recipient: row.recipientEmail, emailType: row.emailType }, actor,
    });
    return { requeued: true };
  }

  async setJobActive(actor, id, isActive) {
    const job = await models.ScheduledJob.findByPk(id, SKIP);
    if (!job) throw new NotFoundError('Scheduled job not found');
    if (job.isActive === isActive) return job;
    await job.update({ isActive }, SKIP);
    await platformAudit.record({
      action: 'PLATFORM_JOB_TOGGLED', targetType: 'ScheduledJob', targetId: job.jobName,
      oldValues: { isActive: !isActive }, newValues: { isActive }, actor,
    });
    return job;
  }
}

module.exports = new PlatformOpsService();
