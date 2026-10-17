const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { activateRequestedPlan, withoutRedundant } = require('./manualBillingService');
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
   * Plan catalog authoring. The catalog is live product surface - the
   * marketing pricing page reads it unauthenticated - so creation and edits
   * are owner-gated and audited, keys are immutable once created, and plans
   * deactivate rather than delete (subscriptions reference them forever).
   */
  async createPlan(actor, input) {
    const key = String(input.key || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(key)) throw new ValidationError('Plan key must be 2-40 lowercase letters, numbers, hyphens or underscores');
    if (await models.Plan.findOne({ where: { key } })) throw new ConflictError(`A plan with key "${key}" already exists`);
    const plan = await models.Plan.create({
      key,
      name: String(input.name || '').trim(),
      description: input.description || null,
      monthlyPriceCents: input.monthlyPriceCents,
      annualPriceCents: input.annualPriceCents,
      currency: (input.currency || 'USD').toUpperCase(),
      limits: input.limits || {},
      features: input.features || {},
      active: input.active !== false,
      sortOrder: input.sortOrder || 0,
    });
    await platformAudit.record({
      action: 'PLATFORM_PLAN_CREATED', targetType: 'Plan', targetId: key,
      newValues: plan.toJSON(), actor,
    });
    return plan;
  }

  async updatePlan(actor, id, patch) {
    const plan = await models.Plan.findByPk(id);
    if (!plan) throw new NotFoundError('Plan not found');
    const editable = ['name', 'description', 'monthlyPriceCents', 'annualPriceCents', 'currency', 'limits', 'features', 'active', 'sortOrder'];
    const oldValues = {};
    const newValues = {};
    for (const field of editable) {
      if (patch[field] === undefined) continue;
      const next = field === 'currency' ? String(patch[field]).toUpperCase() : patch[field];
      if (JSON.stringify(plan[field]) === JSON.stringify(next)) continue;
      oldValues[field] = plan[field];
      newValues[field] = next;
      plan[field] = next;
    }
    if (!Object.keys(newValues).length) return plan;
    await plan.save();
    await platformAudit.record({
      action: 'PLATFORM_PLAN_UPDATED', targetType: 'Plan', targetId: plan.key,
      oldValues, newValues, actor,
    });
    return plan;
  }

  /** How many subscriptions sit on each plan - shown before anyone edits one. */
  async planSubscriberCounts() {
    const rows = await sequelize.query(
      `SELECT plan_id AS "planId", COUNT(*)::int AS count FROM organization_subscriptions GROUP BY plan_id`,
      { type: sequelize.QueryTypes.SELECT },
    );
    return Object.fromEntries(rows.map((row) => [row.planId, row.count]));
  }

  /** The invoice queue: every workspace whose admin requested a plan change. */
  async pendingRequests() {
    const rows = await models.OrganizationSubscription.findAll({
      ...SKIP,
      where: { requestedPlanId: { [Op.ne]: null } },
      include: [
        { model: models.Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'], paranoid: false },
        { model: models.Plan, as: 'plan', attributes: ['key', 'name', 'monthlyPriceCents', 'annualPriceCents', 'currency'] },
        { model: models.Plan, as: 'requestedPlan', attributes: ['key', 'name', 'monthlyPriceCents', 'annualPriceCents', 'currency'] },
      ],
      order: [['requestedAt', 'ASC']],
    });
    return rows.map((row) => ({
      organization: row.organization,
      currentPlan: row.plan,
      requestedPlan: row.requestedPlan,
      requestedAt: row.requestedAt,
      billingInterval: row.billingInterval,
      subscriptionStatus: row.status,
    }));
  }

  /**
   * Activate a TENANT-REQUESTED plan after invoice confirmation. This goes
   * through manualBillingService unchanged, deliberately: the guard that
   * refuses to activate a plan nobody asked for is what stops an operator
   * silently changing a customer's plan under the invoice flow. The operator
   * path without a request is assignPlan below - a different, louder act.
   */
  async activateRequested(actor, { organizationId, planKey, invoiceReference, periodEnd }) {
    const organization = await this._organization(organizationId);
    const result = await activateRequestedPlan({
      workspace: organization.slug,
      planKey,
      invoiceReference,
      operator: actor.email,
      periodEnd,
    });
    await platformAudit.record({
      action: 'PLATFORM_PLAN_REQUEST_ACTIVATED',
      targetType: 'OrganizationSubscription', targetId: organization.slug, organizationId,
      newValues: { planKey, invoiceReference, periodEnd, alreadyActivated: result.alreadyActivated },
      actor,
    });
    return { ...result, subscription: await this.subscriptionView(organizationId) };
  }

  /**
   * Operator-initiated plan assignment - no tenant request required. The
   * explicit path for closing a deal by email or correcting a plan: it
   * demands a reason, pre-flights the downgrade against real usage, and
   * writes its own audit action so it can never be mistaken for the
   * invoice-confirmation flow.
   */
  async assignPlan(actor, organizationId, { planKey, billingInterval, periodEnd, reason, acknowledgeOverLimit = false }) {
    const organization = await this._organization(organizationId);
    const plan = await models.Plan.findOne({ where: { key: String(planKey || ''), active: true } });
    if (!plan) throw new NotFoundError('Plan not found');
    const endsAt = periodEnd ? new Date(periodEnd) : null;
    if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= new Date())) {
      throw new ValidationError('The period end must be a future date');
    }

    const result = await sequelize.transaction(async (transaction) => {
      const subscription = await this._subscription(organizationId, { transaction, lock: true });
      const interval = billingInterval || subscription.billingInterval;
      if (subscription.planId === plan.id && subscription.billingInterval === interval) {
        throw new ValidationError(`${plan.name} (${interval}) is already the active plan`);
      }

      // Pre-flight: would this move the workspace below what it already uses?
      const overrides = {
        ...(subscription.overrides || {}),
        limits: withoutRedundant(subscription.overrides?.limits, plan.limits),
        features: withoutRedundant(subscription.overrides?.features, plan.features),
      };
      const effective = { ...(plan.limits || {}), ...(overrides.limits || {}) };
      const usage = (await require('./platformOrganizationService')._usageFor([organizationId]))[organizationId]
        || { members: 0, programs: 0, clans: 0 };
      const overages = Object.entries(usage)
        .filter(([key, used]) => Number.isFinite(Number(effective[key])) && Number(effective[key]) >= 0 && used > Number(effective[key]))
        .map(([key, used]) => `${key}: ${used} in use, ${effective[key]} allowed`);
      if (overages.length && !acknowledgeOverLimit) {
        throw new ConflictError(`This plan is below current usage (${overages.join('; ')}). Existing data is kept but nothing new fits; acknowledge to proceed.`);
      }

      const oldValues = {
        planId: subscription.planId, billingInterval: subscription.billingInterval,
        status: subscription.status, requestedPlanId: subscription.requestedPlanId,
        overrides: subscription.overrides || {},
      };

      await subscription.update({
        planId: plan.id,
        billingInterval: interval,
        status: 'active',
        provider: 'platform_operator',
        requestedPlanId: null,
        requestedAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: endsAt,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        overrides,
      }, { transaction, ...SKIP });

      await platformAudit.record({
        action: 'PLATFORM_PLAN_ASSIGNED',
        targetType: 'OrganizationSubscription', targetId: organization.slug, organizationId,
        oldValues,
        newValues: { planKey: plan.key, billingInterval: interval, periodEnd: endsAt?.toISOString() || null, overages },
        reason, actor, transaction,
      });

      return { assigned: plan.key, overages };
    });

    return { ...result, subscription: await this.subscriptionView(organizationId) };
  }

  /** Subscription housekeeping: pause/cancel/reactivate, period and trial dates. */
  async patchSubscription(actor, organizationId, { status, cancelAtPeriodEnd, currentPeriodEnd, trialEndsAt, reason }) {
    const organization = await this._organization(organizationId);
    await sequelize.transaction(async (transaction) => {
      const subscription = await this._subscription(organizationId, { transaction, lock: true });
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (cancelAtPeriodEnd !== undefined) patch.cancelAtPeriodEnd = cancelAtPeriodEnd;
      if (currentPeriodEnd !== undefined) patch.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
      if (trialEndsAt !== undefined) patch.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
      if (!Object.keys(patch).length) throw new ValidationError('Nothing to change');
      const oldValues = {
        status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd, trialEndsAt: subscription.trialEndsAt,
      };
      await subscription.update(patch, { transaction, ...SKIP });
      await platformAudit.record({
        action: 'PLATFORM_SUBSCRIPTION_UPDATED',
        targetType: 'OrganizationSubscription', targetId: organization.slug, organizationId,
        oldValues, newValues: patch, reason, actor, transaction,
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
