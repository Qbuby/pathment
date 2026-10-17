const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const platformAudit = require('./platformAuditService');
const { GATES } = require('../middlewares/platformAdmin');

const ROLES = Object.keys(GATES);

const serialize = (row) => ({
  id: row.id,
  userId: row.userId,
  role: row.role,
  grantedBy: row.grantedBy,
  revokedAt: row.revokedAt,
  lastSeenAt: row.lastSeenAt,
  createdAt: row.createdAt,
  user: row.user ? {
    id: row.user.id,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    email: row.user.email,
  } : null,
});

class PlatformAdminService {
  async list({ includeRevoked = false } = {}) {
    const where = includeRevoked ? {} : { revokedAt: null };
    const rows = await models.PlatformAdmin.findAll({
      where,
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'ASC']],
    });
    return rows.map(serialize);
  }

  async grant(actor, { email, role }) {
    if (!ROLES.includes(role)) throw new ValidationError('Choose a valid platform role');
    const normalized = String(email || '').trim().toLowerCase();
    const user = await models.User.findOne({ where: { email: normalized } });
    if (!user) throw new NotFoundError('No Pathment account exists with that email. The person must have an account first');
    const existing = await models.PlatformAdmin.findOne({ where: { userId: user.id } });
    if (existing && !existing.revokedAt) throw new ConflictError('That person already holds a platform role');

    let row;
    if (existing) {
      // Re-granting a revoked admin reuses the row so history stays in one place.
      await existing.update({ role, grantedBy: actor.id, revokedAt: null, revokedBy: null });
      row = existing;
    } else {
      row = await models.PlatformAdmin.create({ userId: user.id, role, grantedBy: actor.id });
    }
    await platformAudit.record({
      action: 'PLATFORM_ADMIN_GRANTED', targetType: 'PlatformAdmin', targetId: user.email,
      newValues: { role }, actor,
    });
    row.user = user;
    return serialize(row);
  }

  async update(actor, id, { role }) {
    if (!ROLES.includes(role)) throw new ValidationError('Choose a valid platform role');
    const row = await models.PlatformAdmin.findByPk(id, {
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    });
    if (!row || row.revokedAt) throw new NotFoundError('Platform admin not found');
    if (row.userId === actor.id) throw new ValidationError('You cannot change your own platform role');
    const previous = row.role;
    if (previous === role) return serialize(row);
    await row.update({ role });
    await platformAudit.record({
      action: 'PLATFORM_ADMIN_ROLE_CHANGED', targetType: 'PlatformAdmin', targetId: row.user?.email || row.userId,
      oldValues: { role: previous }, newValues: { role }, actor,
    });
    return serialize(row);
  }

  async revoke(actor, id) {
    const row = await models.PlatformAdmin.findByPk(id, {
      include: [{ model: models.User, as: 'user', attributes: ['id', 'email'] }],
    });
    if (!row || row.revokedAt) throw new NotFoundError('Platform admin not found');
    // Locking yourself out is never the intention; the last owner goes via env bootstrap only.
    if (row.userId === actor.id) throw new ValidationError('You cannot revoke your own platform access');
    await row.update({ revokedAt: new Date(), revokedBy: actor.id });
    await platformAudit.record({
      action: 'PLATFORM_ADMIN_REVOKED', targetType: 'PlatformAdmin', targetId: row.user?.email || row.userId,
      oldValues: { role: row.role }, actor,
    });
    return { revoked: true };
  }
}

module.exports = new PlatformAdminService();
