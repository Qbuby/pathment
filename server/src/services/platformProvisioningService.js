const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { runWithRequestContext } = require('../utils/auditContext');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const organizationService = require('./organizationService');
const platformAudit = require('./platformAuditService');
const notificationOrchestrator = require('./notificationOrchestrator');

const SKIP = { skipOrganizationScope: true };
const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72h: nobody is waiting with the app open.

/**
 * Operator-assisted workspace provisioning - the path PLANS-RELEASE-REVIEW.md
 * left open ("define the operator-assisted first-owner provisioning process").
 *
 * Unlike public signup this chooses the plan at creation, and unlike the old
 * flow the owner never receives a password: they receive a single-use
 * activation link (the sign-in-link pattern) and set their own. Nothing
 * secret is ever stored in plaintext or sent twice.
 */
class PlatformProvisioningService {
  async checkSlug(slug) {
    const normalized = organizationService.normalizeSlug(slug);
    if (!normalized) return { slug: null, available: false, reason: 'invalid' };
    const existing = await models.Organization.findOne({ ...SKIP, where: { slug: normalized }, paranoid: false, attributes: ['id'] });
    return { slug: normalized, available: !existing, reason: existing ? 'taken' : null };
  }

  async provision(actor, input) {
    const name = String(input.name || '').trim();
    const slug = organizationService.normalizeSlug(input.slug);
    const timezone = String(input.timezone || 'UTC').trim() || 'UTC';
    const trialDays = Math.max(0, parseInt(input.trialDays, 10) || 0);
    const billingInterval = input.billingInterval === 'annual' ? 'annual' : 'monthly';
    const ownerEmail = String(input.owner?.email || '').trim().toLowerCase();
    const ownerFirst = String(input.owner?.firstName || '').trim();
    const ownerLast = String(input.owner?.lastName || '').trim();

    if (name.length < 2 || name.length > 160) throw new ValidationError('Organization name must be between 2 and 160 characters');
    if (!slug) throw new ValidationError('Workspace URL must use lowercase letters, numbers, and single hyphens');
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { throw new ValidationError('Choose a valid IANA timezone'); }
    if (!ownerEmail || !ownerFirst || !ownerLast) throw new ValidationError('Owner name and email are required');

    const plan = await models.Plan.findOne({ where: { key: String(input.planKey || ''), active: true } });
    if (!plan) throw new NotFoundError('Plan not found');

    if (await models.Organization.findOne({ ...SKIP, where: { slug }, paranoid: false, attributes: ['id'] })) {
      throw new ConflictError('That workspace URL is already in use');
    }

    const existingOwner = await models.User.findOne({ where: { email: ownerEmail } });
    const activationToken = existingOwner ? null : generateRandomToken();
    const now = new Date();

    const result = await sequelize.transaction(async (transaction) => {
      const organization = await models.Organization.create({
        name, slug, timezone, status: trialDays > 0 ? 'trial' : 'active',
        createdBy: actor.id,
        settings: { onboardingSource: 'operator_provisioned' },
      }, { transaction, ...SKIP });

      // Everything the new workspace owns is written inside ITS context, so
      // the tenant hooks stamp and validate exactly as they would in product.
      const provisioned = await runWithRequestContext(
        { organizationId: organization.id, organizationSlug: organization.slug, userId: actor.id },
        async () => {
          let owner = existingOwner;
          if (!owner) {
            owner = await models.User.create({
              email: ownerEmail, firstName: ownerFirst, lastName: ownerLast,
              // No usable password until activation: a random secret nobody
              // knows. emailVerified stays false, so the account cannot sign
              // in at all before the link proves inbox ownership.
              passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
              role: 'admin', status: 'active', emailVerified: false,
            }, { transaction });
            await models.UserSettings.create({ userId: owner.id }, { transaction });
          }

          // The User.afterCreate hook already creates a membership in this
          // context; make the row an OWNER either way (and attach existing
          // accounts that had no row here).
          await models.OrganizationMembership.findOrCreate({
            where: { organizationId: organization.id, userId: owner.id },
            defaults: {
              role: 'owner', status: existingOwner ? 'active' : 'invited',
              joinedAt: existingOwner ? now : null, invitedBy: actor.id,
            },
            transaction, ...SKIP,
          });
          await models.OrganizationMembership.update(
            { role: 'owner' },
            { where: { organizationId: organization.id, userId: owner.id }, transaction, ...SKIP },
          );

          await models.AdminProfile.findOrCreate({ where: { userId: owner.id }, defaults: { userId: owner.id }, transaction });

          await models.OrganizationSubscription.create({
            organizationId: organization.id, planId: plan.id,
            status: trialDays > 0 ? 'trialing' : 'active',
            billingInterval,
            provider: 'platform_operator',
            currentPeriodStart: now,
            trialEndsAt: trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null,
          }, { transaction, ...SKIP });

          if (activationToken) {
            await models.WorkspaceOwnerInvite.create({
              organizationId: organization.id, userId: owner.id,
              tokenHash: hashToken(activationToken),
              expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
              createdBy: actor.id,
            }, { transaction });
          }

          return { organization, owner };
        },
      );

      if (input.leadId) {
        await models.BuyerLead.update(
          { status: 'provisioned', provisionedOrganizationId: organization.id },
          { where: { id: input.leadId }, transaction },
        );
      }

      // Billing-grade evidence: the provisioning commits with its record.
      await platformAudit.record({
        action: 'PLATFORM_WORKSPACE_PROVISIONED',
        targetType: 'Organization', targetId: organization.slug, organizationId: organization.id,
        newValues: {
          name, slug, timezone, planKey: plan.key, billingInterval, trialDays,
          owner: ownerEmail, ownerAccount: existingOwner ? 'existing' : 'created',
          leadId: input.leadId || null,
        },
        reason: input.reason || null, actor, transaction,
      });

      return provisioned;
    });

    // Email after commit - a rolled-back workspace must never be announced.
    if (activationToken) {
      notificationOrchestrator.sendWorkspaceOwnerActivationEmail(result.owner, result.organization, activationToken)
        .catch((error) => console.warn('owner activation email failed:', error.message));
    } else {
      notificationOrchestrator.sendWorkspaceReadyEmail(result.owner, result.organization)
        .catch((error) => console.warn('workspace ready email failed:', error.message));
    }

    return {
      organization: {
        id: result.organization.id, name: result.organization.name,
        slug: result.organization.slug, status: result.organization.status,
      },
      owner: { id: result.owner.id, email: result.owner.email, account: existingOwner ? 'existing' : 'created' },
      activation: activationToken ? 'email_sent' : 'not_needed',
    };
  }

  /** Spend outstanding links and send a fresh one - at most one live link per owner. */
  async resendActivation(actor, organizationId) {
    const organization = await models.Organization.findByPk(organizationId, { ...SKIP, paranoid: false });
    if (!organization) throw new NotFoundError('Workspace not found');
    const previous = await models.WorkspaceOwnerInvite.findOne({
      ...SKIP, where: { organizationId }, order: [['createdAt', 'DESC']],
    });
    if (!previous) throw new NotFoundError('This workspace has no pending owner activation');
    if (previous.usedAt) throw new ValidationError('The owner already activated their account');
    const owner = await models.User.findByPk(previous.userId);
    if (!owner) throw new NotFoundError('Owner account not found');
    if (owner.emailVerified) throw new ValidationError('The owner already has working credentials');

    const token = generateRandomToken();
    await sequelize.transaction(async (transaction) => {
      await models.WorkspaceOwnerInvite.update(
        { revokedAt: new Date() },
        { where: { organizationId, usedAt: null, revokedAt: null }, transaction, ...SKIP },
      );
      await models.WorkspaceOwnerInvite.create({
        organizationId, userId: owner.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        createdBy: actor.id,
      }, { transaction, ...SKIP });
      await platformAudit.record({
        action: 'PLATFORM_OWNER_ACTIVATION_RESENT',
        targetType: 'Organization', targetId: organization.slug, organizationId,
        newValues: { owner: owner.email }, actor, transaction,
      });
    });

    notificationOrchestrator.sendWorkspaceOwnerActivationEmail(owner, organization, token)
      .catch((error) => console.warn('owner activation email failed:', error.message));
    return { resent: true, owner: owner.email };
  }

  async revokeActivation(actor, organizationId) {
    const organization = await models.Organization.findByPk(organizationId, { ...SKIP, paranoid: false });
    if (!organization) throw new NotFoundError('Workspace not found');
    const [count] = await models.WorkspaceOwnerInvite.update(
      { revokedAt: new Date() },
      { where: { organizationId, usedAt: null, revokedAt: null }, ...SKIP },
    );
    if (!count) throw new NotFoundError('No live activation link to revoke');
    await platformAudit.record({
      action: 'PLATFORM_OWNER_ACTIVATION_REVOKED',
      targetType: 'Organization', targetId: organization.slug, organizationId, actor,
    });
    return { revoked: true };
  }

  async _liveInvite(token) {
    const invite = await models.WorkspaceOwnerInvite.findOne({
      ...SKIP,
      where: { tokenHash: hashToken(String(token || '')), usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
      include: [{ model: models.Organization, as: 'organization', paranoid: false }],
    });
    if (!invite || !invite.organization) throw new ValidationError('This activation link is invalid or has expired');
    return invite;
  }

  /** Public: tell the activation page what it is activating, nothing more. */
  async validateActivation(token) {
    const invite = await this._liveInvite(token);
    const owner = await models.User.findByPk(invite.userId, { attributes: ['email', 'firstName'] });
    return {
      organization: { name: invite.organization.name, slug: invite.organization.slug },
      owner: { email: owner?.email || '', firstName: owner?.firstName || '' },
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * Public: spend the link, set the owner's own password, verify the inbox.
   * Deliberately does NOT hand back a session: the owner signs in through the
   * normal workspace login (2FA and session rules apply unchanged), which the
   * client redirects to with one field left to fill.
   */
  async consumeActivation({ token, password }) {
    if (String(password || '').length < 8) throw new ValidationError('Password must be at least 8 characters');
    const invite = await this._liveInvite(token);

    const result = await sequelize.transaction(async (transaction) => {
      // Spent first, exactly like sign-in links: two taps on the same link
      // must not both come back with credentials set.
      const [spent] = await models.WorkspaceOwnerInvite.update(
        { usedAt: new Date() },
        { where: { id: invite.id, usedAt: null }, transaction, ...SKIP },
      );
      if (!spent) throw new ValidationError('This activation link is invalid or has expired');

      const owner = await models.User.findByPk(invite.userId, { transaction });
      if (!owner) throw new ValidationError('This activation link is invalid or has expired');
      if (owner.status !== 'active') throw new ValidationError('This account is unavailable. Contact support');

      await owner.update({
        passwordHash: await bcrypt.hash(password, 12),
        emailVerified: true,
        emailVerifiedAt: new Date(),
      }, { transaction });

      await models.OrganizationMembership.update(
        { status: 'active', joinedAt: new Date() },
        { where: { organizationId: invite.organizationId, userId: owner.id, status: 'invited' }, transaction, ...SKIP },
      );

      await platformAudit.record({
        action: 'PLATFORM_OWNER_ACTIVATED',
        targetType: 'Organization', targetId: invite.organization.slug, organizationId: invite.organizationId,
        newValues: { owner: owner.email }, actor: { id: null, email: owner.email }, transaction,
      });

      return { email: owner.email };
    });

    return { workspace: { name: invite.organization.name, slug: invite.organization.slug }, email: result.email };
  }
}

module.exports = new PlatformProvisioningService();
