const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { models } = require('../db');
const platformBillingService = require('../services/platformBillingService');

/** The FULL catalog - every limit and feature key, inactive plans included.
 *  This is the operator view; the public projection stays in /organizations/plans. */
const listPlans = catchAsync(async (_req, res) => {
  const [plans, subscriberCounts] = await Promise.all([
    models.Plan.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] }),
    platformBillingService.planSubscriberCounts(),
  ]);
  res.status(200).json(successResponse('Plans retrieved', { plans, subscriberCounts }));
});

const createPlan = catchAsync(async (req, res) => {
  const plan = await platformBillingService.createPlan(req.user, req.body);
  res.status(201).json(successResponse('Plan created', { plan }, 201));
});

const updatePlan = catchAsync(async (req, res) => {
  const plan = await platformBillingService.updatePlan(req.user, req.params.id, req.body);
  res.status(200).json(successResponse('Plan updated', { plan }));
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

const pendingRequests = catchAsync(async (_req, res) => {
  res.status(200).json(successResponse('Pending plan requests', { requests: await platformBillingService.pendingRequests() }));
});

const activateRequested = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Plan request activated', await platformBillingService.activateRequested(req.user, req.body)));
});

const assignPlan = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Plan assigned', await platformBillingService.assignPlan(req.user, req.params.id, req.body)));
});

const patchSubscription = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Subscription updated', { subscription: await platformBillingService.patchSubscription(req.user, req.params.id, req.body) }));
});

module.exports = { listPlans, createPlan, updatePlan, subscription, setOverrides, overridesReport, pendingRequests, activateRequested, assignPlan, patchSubscription };
