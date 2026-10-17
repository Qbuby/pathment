const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { withoutRedundant } = require('./manualBillingService');
const platformAudit = require('./platformAuditService');

const SKIP = { skipOrganizationScope: true };

/**
 * Operator billing: per-workspace overrides, operator plan assignment, and the
 * manual-invoice activation queue, all audited. The tenant-facing rule stays
 * untouched (a workspace still *requests* a plan from Settings); this is the
 * explicit operator path beside it, not a loosening of it.
 */
class PlatformBillingService {
  async _organization(organizationId) {
    const organization = await models.Organization.findByPk(organizationId, { ...SKIP, paranoid: false });
    if (!organization) throw new NotFoundError('Workspace not found');
    return organization;
  }

  async _subscription(organizationId, { transaction = null, lock = false } = {}) {
    const subscription = await models.OrganizationSubscription.findOne({
      ...SKIP,
      where: { organizationId },
      transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!subscription) throw new NotFoundError('Organization subscription not found');
    return subscription;
  }

  /** The serialized operator view: plan, effective limits, and what differs. */
  async subscriptionView(organizationId) {
    const subscription = await models.OrganizationSubscription.findOne({
      ...SKIP,
      where: { organizationId },
      include: [
        { model: models.Plan, as: 'plan' },
        { model: models.Plan, as: 'requestedPlan', required: false },
      ],
    });
    if (!subscription) throw new NotFoundError('Organization subscription not found');
    const plan = subscription.plan?.toJSON() || {};
    const published = plan.limits || {};
    const limits = { ...published, ...(subscription.overrides?.limits || {}) };
    const overriddenLimits = Object.keys(limits).filter((key) => String(limits[key]) !== String(published[key]));
    return {
      ...subscription.toJSON(),
      plan: {
        ...plan,
        limits,
        features: { ...(plan.features || {}), ...(subscription.overrides?.features || {}) },
        publishedLimits: published,
        publishedFeatures: plan.features || {},
      },
      overriddenLimits,
    };
  }

  /**
   * Every limit/feature key any plan publishes - the vocabulary an override
   * may use. Prevents a typo ("member") silently enforcing nothing.
   */
  async _knownKeys() {
    const plans = await models.Plan.findAll({ attributes: ['limits', 'features'], raw: true });
    const limits = new Set();
    const features = new Set();
    for (const plan of plans) {
      Object.keys(plan.limits || {}).forEach((key) => limits.add(key));
      Object.keys(plan.features || {}).forEach((key) => features.add(key));
    }
    return { limits, features };
  }

  /**
   * Set (or clear, via null) per-workspace limit/feature overrides.
   * Values identical to what the plan already publishes are dropped - an
   * override that changes nothing must not show up as a custom arrangement.
   */
  async setOverrides(actor, organizationId, { limits = {}, features = {}, reason }) {
    const organization = await this._organization(organizationId);
    const known = await this._knownKeys();

    for (const key of Object.keys(limits)) {
      if (!known.limits.has(key)) throw new ValidationError(`Unknown limit "${key}". Known: ${[...known.limits].join(', ')}`);
      const value = limits[key];
      if (value !== null && (!Number.isInteger(value) || value < -1)) {
        throw new ValidationError(`Limit "${key}" must be a whole number (-1 = unlimited) or null to clear`);
      }
    }
    for (const key of Object.keys(features)) {
      if (!known.features.has(key)) throw new ValidationError(`Unknown feature "${key}". Known: ${[...known.features].join(', ')}`);
      const value = features[key];
      if (value !== null && typeof value !== 'boolean') {
        throw new ValidationError(`Feature "${key}" must be true, false, or null to clear`);
      }
    }

    await sequelize.transaction(async (transaction) => {
      const subscription = await this._subscription(organizationId, { transaction, lock: true });
      const plan = await models.Plan.findByPk(subscription.planId, { transaction });
      const current = subscription.overrides || {};
      const oldValues = { limits: current.limits || {}, features: current.features || {} };

      const mergedLimits = { ...(current.limits || {}) };
      for (const [key, value] of Object.entries(limits)) {
        if (value === null) delete mergedLimits[key];
        else mergedLimits[key] = value;
      }
      const mergedFeatures = { ...(current.features || {}) };
      for (const [key, value] of Object.entries(features)) {
        if (value === null) delete mergedFeatures[key];
        else mergedFeatures[key] = value;
      }

      const overrides = {
        ...current,
        limits: withoutRedundant(mergedLimits, plan?.limits || {}),
        features: withoutRedundant(mergedFeatures, plan?.features || {}),
        meta: {
          reason: reason || null,
          updatedBy: actor.email,
          updatedAt: new Date().toISOString(),
        },
      };

      await subscription.update({ overrides }, { transaction, ...SKIP });
      await platformAudit.record({
        action: 'PLATFORM_OVERRIDES_CHANGED',
        targetType: 'OrganizationSubscription', targetId: organization.slug, organizationId,
        oldValues, newValues: { limits: overrides.limits, features: overrides.features },
        reason, actor, transaction,
      });
    });

    return this.subscriptionView(organizationId);
  }

  /**
   * Every workspace currently carried by a custom arrangement, so none of
   * them get lost. Redundant entries are already pruned at write time; the
   * report simply shows what differs and why.
   */
  async overridesReport() {
    const subscriptions = await models.OrganizationSubscription.findAll({
      ...SKIP,
      where: {
        [Op.or]: [
          sequelize.literal(`("OrganizationSubscription"."overrides" -> 'limits') <> '{}'::jsonb`),
          sequelize.literal(`("OrganizationSubscription"."overrides" -> 'features') <> '{}'::jsonb`),
        ],
      },
      include: [
        { model: models.Plan, as: 'plan' },
        { model: models.Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'], paranoid: false },
      ],
      order: [['updatedAt', 'DESC']],
    });

    return subscriptions
      .filter((row) => Object.keys(row.overrides?.limits || {}).length || Object.keys(row.overrides?.features || {}).length)
      .map((row) => ({
        organization: row.organization,
        plan: row.plan ? { key: row.plan.key, name: row.plan.name } : null,
        limits: Object.entries(row.overrides?.limits || {}).map(([key, value]) => ({
          key, value, planValue: row.plan?.limits?.[key] ?? null,
        })),
        features: Object.entries(row.overrides?.features || {}).map(([key, value]) => ({
          key, value, planValue: row.plan?.features?.[key] ?? null,
        })),
        meta: row.overrides?.meta || null,
      }));
  }
}

module.exports = new PlatformBillingService();
