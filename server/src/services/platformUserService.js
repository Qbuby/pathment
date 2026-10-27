const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const platformAudit = require('./platformAuditService');

const SKIP = { skipOrganizationScope: true };

/**
 * Account-level support. One Pathment account can belong to many workspaces;
 * workspace admins are deliberately denied these actions (403s in the product,
 * see docs/ADMIN_WORKSPACE_USER_LIFECYCLE.md), which until now meant NOBODY
 * could perform them. They live here, behind the platform support/lifecycle
 * gates, each one audited.
 */
const serializeUser = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  twoFactorEnabled: user.twoFactorEnabled,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

class PlatformUserService {
  async search(q, limit = 20) {
    const query = String(q || '').trim();
    if (query.length < 2) throw new ValidationError('Search needs at least two characters');
    const size = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const users = await models.User.findAll({
      ...SKIP,
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: `%${query}%` } },
          { firstName: { [Op.iLike]: `%${query}%` } },
          { lastName: { [Op.iLike]: `%${query}%` } },
          sequelize.where(
            sequelize.fn('concat', sequelize.col('first_name'), ' ', sequelize.col('last_name')),
            { [Op.iLike]: `%${query}%` },
          ),
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: size,
    });
    const ids = users.map((user) => user.id);
    const memberships = ids.length ? await models.OrganizationMembership.findAll({
      ...SKIP,
      where: { userId: ids },
      include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'], paranoid: false }],
    }) : [];
    const byUser = {};
    for (const membership of memberships) {
      (byUser[membership.userId] = byUser[membership.userId] || []).push({
        organizationId: membership.organizationId,
        organization: membership.organization,
        role: membership.role,
        status: membership.status,
      });
    }
    return users.map((user) => ({ ...serializeUser(user), memberships: byUser[user.id] || [] }));
  }

  async detail(id) {
    const user = await models.User.findByPk(id, SKIP);
    if (!user) throw new NotFoundError('Account not found');
    const [memberships, activeSessions, suppressed, platformAdmin] = await Promise.all([
      models.OrganizationMembership.findAll({
        ...SKIP, where: { userId: id },
        include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'], paranoid: false }],
        order: [['createdAt', 'ASC']],
      }),
      models.RefreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { [Op.gt]: new Date() } } }),
      models.SuppressedEmail.findOne({ where: { email: user.email } }),
      models.PlatformAdmin.findOne({ where: { userId: id, revokedAt: null } }),
    ]);
    return {
      ...serializeUser(user),
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        organization: membership.organization,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      })),
      activeSessions,
      suppressedEmail: suppressed ? { reason: suppressed.reason, detail: suppressed.detail, since: suppressed.createdAt } : null,
      platformRole: platformAdmin?.role || null,
    };
  }

  /** End every session everywhere: refresh tokens revoked, sockets dropped. */
  async forceSignOut(actor, id, reason) {
    const user = await models.User.findByPk(id, SKIP);
    if (!user) throw new NotFoundError('Account not found');
    const [revoked] = await models.RefreshToken.update(
      { revokedAt: new Date(), revokedReason: 'platform_force_sign_out' },
      { where: { userId: id, revokedAt: null } },
    );
    await models.UserSession.update({ isActive: false }, { where: { userId: id, isActive: true }, ...SKIP }).catch(() => {});
    this._disconnectEverywhere(id).catch(() => {});
    await platformAudit.record({
      action: 'PLATFORM_ACCOUNT_SIGNED_OUT', targetType: 'User', targetId: user.email,
      newValues: { revokedTokens: revoked }, reason, actor,
    });
    return { signedOut: true, revokedTokens: revoked };
  }

  /** Account-level suspension - distinct from any workspace membership status. */
  async setStatus(actor, id, { status, reason }) {
    if (!['active', 'suspended'].includes(status)) throw new ValidationError('Status must be active or suspended');
    const user = await models.User.findByPk(id, SKIP);
    if (!user) throw new NotFoundError('Account not found');
    if (user.id === actor.id) throw new ValidationError('You cannot change your own account status');
    if (status === 'suspended') {
      const admin = await models.PlatformAdmin.findOne({ where: { userId: id, revokedAt: null } });
      if (admin) throw new ValidationError('Revoke this account\'s platform role before suspending it');
    }
    if (user.status === status) throw new ValidationError(`This account is already ${status}`);
    const previous = user.status;
    await user.update({ status }, SKIP);
    if (status === 'suspended') {
      await models.RefreshToken.update(
        { revokedAt: new Date(), revokedReason: 'platform_account_suspended' },
        { where: { userId: id, revokedAt: null } },
      );
      this._disconnectEverywhere(id).catch(() => {});
    }
    await platformAudit.record({
      action: 'PLATFORM_ACCOUNT_STATUS_CHANGED', targetType: 'User', targetId: user.email,
      oldValues: { status: previous }, newValues: { status }, reason, actor,
    });
    return { id: user.id, status };
  }

  /** 2FA reset for a locked-out account. The next sign-in is password-only. */
  async resetTwoFactor(actor, id, reason) {
    const user = await models.User.findByPk(id, SKIP);
    if (!user) throw new NotFoundError('Account not found');
    if (!user.twoFactorEnabled) throw new ValidationError('Two-factor is not enabled on this account');
    await sequelize.transaction(async (transaction) => {
      await models.TwoFactorAuth.destroy({ where: { userId: id }, transaction });
      await user.update({ twoFactorEnabled: false }, { transaction, ...SKIP });
      await platformAudit.record({
        action: 'PLATFORM_ACCOUNT_2FA_RESET', targetType: 'User', targetId: user.email,
        reason, actor, transaction,
      });
    });
    return { reset: true };
  }

  /** Let a wrongly-suppressed address receive mail again. */
  async unsuppressEmail(actor, id, reason) {
    const user = await models.User.findByPk(id, SKIP);
    if (!user) throw new NotFoundError('Account not found');
    const suppressed = await models.SuppressedEmail.findOne({ where: { email: user.email } });
    if (!suppressed) throw new NotFoundError('This address is not suppressed');
    const oldValues = { reason: suppressed.reason, detail: suppressed.detail };
    await suppressed.destroy();
    await platformAudit.record({
      action: 'PLATFORM_EMAIL_UNSUPPRESSED', targetType: 'User', targetId: user.email,
      oldValues, reason, actor,
    });
    return { unsuppressed: true };
  }

  async _disconnectEverywhere(userId) {
    const { disconnectWorkspaceUser } = require('../socket');
    const memberships = await models.OrganizationMembership.findAll({
      ...SKIP, where: { userId }, attributes: ['organizationId'],
    });
    memberships.forEach((membership) => disconnectWorkspaceUser(userId, membership.organizationId));
  }
}

module.exports = new PlatformUserService();
