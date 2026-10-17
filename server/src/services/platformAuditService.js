const { Op } = require('sequelize');
const { models } = require('../db');
const { getRequestContext } = require('../utils/auditContext');

/**
 * The single writer for platform_audit_logs.
 *
 * Two modes, chosen by whether the caller passes a transaction:
 *   - with one, the entry COMMITS WITH the action (billing-grade evidence -
 *     a plan change without its record must not exist);
 *   - without one, it is best-effort and never throws, like product audit.
 */
async function record({
  action, targetType, targetId = null, organizationId = null,
  oldValues = null, newValues = null, reason = null, actor = null, transaction = null,
}) {
  const ctx = getRequestContext();
  const payload = {
    actorId: actor?.id || ctx.userId || null,
    actorEmail: actor?.email || null,
    action,
    targetType,
    targetId: targetId == null ? null : String(targetId),
    targetOrganizationId: organizationId,
    oldValues,
    newValues,
    reason,
    ipAddress: ctx.ip || null,
    userAgent: ctx.userAgent || null,
  };
  if (transaction) return models.PlatformAuditLog.create(payload, { transaction });
  try {
    return await models.PlatformAuditLog.create(payload);
  } catch (error) {
    console.warn('platform audit failed:', error.message);
    return null;
  }
}

async function list({ action, organizationId, actorId, q, page = 1, limit = 50 } = {}) {
  const where = {};
  if (action) where.action = action;
  if (organizationId) where.targetOrganizationId = organizationId;
  if (actorId) where.actorId = actorId;
  if (q) {
    where[Op.or] = [
      { action: { [Op.iLike]: `%${q}%` } },
      { targetType: { [Op.iLike]: `%${q}%` } },
      { targetId: { [Op.iLike]: `%${q}%` } },
      { actorEmail: { [Op.iLike]: `%${q}%` } },
    ];
  }
  const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const current = Math.max(1, parseInt(page, 10) || 1);
  const { rows, count } = await models.PlatformAuditLog.findAndCountAll({
    where,
    include: [
      { model: models.User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'], required: false },
      { model: models.Organization, as: 'targetOrganization', attributes: ['id', 'name', 'slug'], required: false, paranoid: false },
    ],
    order: [['createdAt', 'DESC']],
    limit: size,
    offset: (current - 1) * size,
  });
  return { entries: rows, total: count, page: current, pages: Math.ceil(count / size) || 1 };
}

/** Distinct action names, for the console's filter dropdown. */
async function actions() {
  const rows = await models.PlatformAuditLog.findAll({
    attributes: [[models.PlatformAuditLog.sequelize.fn('DISTINCT', models.PlatformAuditLog.sequelize.col('action')), 'action']],
    order: [['action', 'ASC']],
    raw: true,
  });
  return rows.map((row) => row.action);
}

module.exports = { record, list, actions };
