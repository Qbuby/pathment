const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { models } = require('../db');
const platformBillingService = require('../services/platformBillingService');

/** The FULL catalog - every limit and feature key, inactive plans included.
 *  This is the operator view; the public projection stays in /organizations/plans. */
const listPlans = catchAsync(async (_req, res) => {
  const plans = await models.Plan.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] });
  res.status(200).json(successResponse('Plans retrieved', { plans }));
});

const subscription = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Subscription retrieved', { subscription: await platformBillingService.subscriptionView(req.params.id) }));
});

const setOverrides = catchAsync(async (req, res) => {
  const result = await platformBillingService.setOverrides(req.user, req.params.id, req.body);
  res.status(200).json(successResponse('Overrides updated', { subscription: result }));
});

const overridesReport = catchAsync(async (_req, res) => {
  res.status(200).json(successResponse('Overrides report', { workspaces: await platformBillingService.overridesReport() }));
});

module.exports = { listPlans, subscription, setOverrides, overridesReport };
