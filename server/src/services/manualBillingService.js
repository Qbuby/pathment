const { sequelize, models } = require('../db');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors/errorTypes');

/**
 * Drop the overrides the new plan already makes true.
 *
 * Workspaces get moved up by hand long before the plan row catches up: give
 * somebody unlimited members while they sit on Growth and the override is the
 * only thing keeping them running. Then they buy Scale, which publishes
 * unlimited anyway — and the override survives, so the settings page goes on
 * saying "custom limit for this workspace" about a number that is simply what
 * the plan says. Every workspace that was ever carried by hand accumulates
 * these, and nothing ever removes them.
 *
 * Only redundant entries go. An override that still differs from the new plan
 * is a real arrangement and is left exactly as it is — this tidies the record,
 * it never changes what is enforced.
 */
function withoutRedundant(overrides, published) {
  const kept = {};
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!(key in (published || {}))) { kept[key] = value; continue; }
    if (String(value) !== String(published[key])) kept[key] = value;
  }
  return kept;
}

/** Operator-only service: deliberately has no HTTP route or workspace permission. */
async function activateRequestedPlan({ workspace, planKey, invoiceReference, operator, periodEnd }) {
  if (!invoiceReference?.trim() || !operator?.trim()) {
    throw new ValidationError('Invoice reference and operator identity are required');
  }
  const endsAt = new Date(periodEnd);
  if (!Number.isFinite(endsAt.getTime()) || endsAt <= new Date()) {
    throw new ValidationError('A future invoice coverage end date is required');
  }
  return sequelize.transaction(async transaction => {
    const organization = await models.Organization.findOne({ where: { slug: workspace }, transaction });
    if (!organization) throw new NotFoundError('Workspace not found');
    const subscription = await models.OrganizationSubscription.findOne({
      where: { organizationId: organization.id }, transaction,
      lock: transaction.LOCK.UPDATE, skipOrganizationScope: true,
    });
    const plan = await models.Plan.findOne({ where: { key: planKey, active: true }, transaction });
    if (!subscription || !plan) throw new NotFoundError('Subscription or plan not found');
    const previous = await models.AuditLog.findOne({
      where: { organizationId: organization.id, action: 'MANUAL_PLAN_ACTIVATED',
        newValues: { invoiceReference: invoiceReference.trim() } },
      transaction, skipOrganizationScope: true,
    });
    if (previous) {
      if (previous.newValues.planId !== plan.id || previous.newValues.periodEnd !== endsAt.toISOString()) {
        throw new ConflictError('This invoice reference was already used for a different activation');
      }
      return { workspace, plan: plan.key, alreadyActivated: true };
    }
    if (!subscription.requestedPlanId) {
      // The old message said the pending plan had "changed", which reads like
      // a race when in fact nobody asked for anything.
      throw new ConflictError(
        `${workspace} has not requested ${plan.key}. A workspace admin requests it from Settings → Plan & Usage, then this activates it`,
      );
    }
    if (subscription.requestedPlanId !== plan.id) {
      throw new ConflictError('The pending plan has changed. Review the workspace request before activation');
    }
    const oldValues = {
      planId: subscription.planId, status: subscription.status,
      overrides: subscription.overrides || {},
    };
    const overrides = {
      ...(subscription.overrides || {}),
      limits: withoutRedundant(subscription.overrides?.limits, plan.limits),
      features: withoutRedundant(subscription.overrides?.features, plan.features),
    };
    await subscription.update({
      planId: plan.id, status: 'active', provider: 'manual_invoice',
      requestedPlanId: null, requestedAt: null,
      currentPeriodStart: new Date(), currentPeriodEnd: endsAt,
      cancelAtPeriodEnd: false,
      overrides,
    }, { transaction, skipOrganizationScope: true });
    // Unlike best-effort product logs, this evidence must commit with billing.
    await models.AuditLog.create({
      organizationId: organization.id, userId: null,
      action: 'MANUAL_PLAN_ACTIVATED', entityType: 'OrganizationSubscription', entityId: subscription.id,
      oldValues, newValues: { planId: plan.id, invoiceReference: invoiceReference.trim(),
        operator: operator.trim(), periodEnd: endsAt.toISOString(), overrides },
    }, { transaction, skipOrganizationScope: true });
    return { workspace, plan: plan.key, alreadyActivated: false };
  });
}

module.exports = { activateRequestedPlan, withoutRedundant };
