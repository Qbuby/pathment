const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const platformOrganizationService = require('../services/platformOrganizationService');

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

module.exports = { metrics, directory, detail, members, audit, setStatus };
