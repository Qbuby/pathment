const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const platformUserService = require('../services/platformUserService');
const platformOpsService = require('../services/platformOpsService');

// ── Account lookup & support actions ─────────────────────────────────────────

const searchUsers = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Accounts found', { users: await platformUserService.search(req.query.q, req.query.limit) }));
});

const userDetail = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Account retrieved', { user: await platformUserService.detail(req.params.id) }));
});

const forceSignOut = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Account signed out everywhere', await platformUserService.forceSignOut(req.user, req.params.id, req.body?.reason)));
});

const setAccountStatus = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Account status updated', await platformUserService.setStatus(req.user, req.params.id, req.body)));
});

const resetTwoFactor = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Two-factor reset', await platformUserService.resetTwoFactor(req.user, req.params.id, req.body?.reason)));
});

const unsuppressEmail = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Email unsuppressed', await platformUserService.unsuppressEmail(req.user, req.params.id, req.body?.reason)));
});

// ── Operational health ───────────────────────────────────────────────────────

const opsOverview = catchAsync(async (_req, res) => {
  res.status(200).json(successResponse('Operational overview', await platformOpsService.overview()));
});

const retryEmail = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Email requeued', await platformOpsService.retryEmail(req.user, req.params.id)));
});

const toggleJob = catchAsync(async (req, res) => {
  const job = await platformOpsService.setJobActive(req.user, req.params.id, req.body.isActive);
  res.status(200).json(successResponse('Job updated', { job }));
});

module.exports = { searchUsers, userDetail, forceSignOut, setAccountStatus, resetTwoFactor, unsuppressEmail, opsOverview, retryEmail, toggleJob };
