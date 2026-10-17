const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const platformOrganizationService = require('../services/platformOrganizationService');
const featureUsageService = require('../services/featureUsageService');

const metrics = catchAsync(async (_req, res) => {
  res.status(200).json(successResponse('Platform metrics retrieved', await platformOrganizationService.metrics()));
});

const directory = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Workspaces retrieved', await platformOrganizationService.directory(req.query)));
});

const detail = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Workspace retrieved', await platformOrganizationService.detail(req.params.id)));
});

const members = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Members retrieved', await platformOrganizationService.members(req.params.id, req.query)));
});

const audit = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Workspace audit retrieved', await platformOrganizationService.organizationAudit(req.params.id, req.query)));
});

const setStatus = catchAsync(async (req, res) => {
  const result = await platformOrganizationService.setStatus(req.user, req.params.id, req.body);
  res.status(200).json(successResponse('Workspace status updated', result));
});

/**
 * Which screens this workspace's people actually open - counts per page shape,
 * per role, with the honest start of the record. Moved here from the workspace
 * admin surface: "what can we delete" is a product question for the operator,
 * not a tenant one. The service's raw SQL takes an explicit organizationId, so
 * no workspace context is needed.
 */
const featureUsage = catchAsync(async (req, res) => {
  await platformOrganizationService.byId(req.params.id); // 404 before an empty report
  const data = await featureUsageService.overview({ organizationId: req.params.id, days: req.query.days });
  res.status(200).json(successResponse('Feature usage retrieved', data));
});

module.exports = { metrics, directory, detail, members, audit, setStatus, featureUsage };
