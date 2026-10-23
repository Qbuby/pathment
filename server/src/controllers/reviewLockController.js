const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const lockService = require('../services/cohortReviewLockService');
const { requestedClanId } = require('../middlewares/portalScope');

// ── Admin ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/review-lock → { locked, pendingRequests, activeGrants } */
const overview = catchAsync(async (req, res) => {
  const data = await lockService.lockOverview();
  res.status(200).json(successResponse('Review lock state', data));
});

/**
 * PATCH /api/admin/review-lock { locked, scopeType?, scopeId? }
 *
 * No scope means the organisation, which is what this endpoint always did.
 * `scopeType: 'program' | 'clan'` with an id locks or unlocks that one place.
 */
const setLock = catchAsync(async (req, res) => {
  const { locked, scopeType, scopeId } = req.body || {};
  if (scopeType && scopeType !== 'organization') {
    const result = await lockService.setScopeLock(
      { scopeType, scopeId, locked: Boolean(locked) }, req.user.id,
    );
    res.status(200).json(successResponse('Review lock updated', result));
    return;
  }
  const value = await lockService.setDeleteLock(Boolean(locked), req.user.id);
  res.status(200).json(successResponse('Review lock updated', { locked: value }));
});

/** GET /api/admin/review-lock/requests?status=pending|all → { requests } */
const listRequests = catchAsync(async (req, res) => {
  const requests = await lockService.listRequests({ status: req.query.status || 'pending' });
  res.status(200).json(successResponse('Unlock requests', { requests }));
});

/** POST /api/admin/review-lock/requests/:id/respond { approve, durationHours?, expiresAt?, note? } → { request, grant } */
const respondToRequest = catchAsync(async (req, res) => {
  const { approve, durationHours, expiresAt, note, scopeType, scopeId } = req.body || {};
  const result = await lockService.respondToRequest(req.params.id, req.user.id, {
    approve: Boolean(approve),
    durationHours,
    expiresAt,
    note,
    scopeType,
    scopeId,
  });
  res.status(200).json(successResponse('Request handled', result));
});

/** GET /api/admin/review-lock/grants?active=true → { grants } */
const listGrants = catchAsync(async (req, res) => {
  const grants = await lockService.listGrants({ active: req.query.active });
  res.status(200).json(successResponse('Unlock grants', { grants }));
});

/** DELETE /api/admin/review-lock/grants/:id → { revoked:true } */
const revokeGrant = catchAsync(async (req, res) => {
  const result = await lockService.revokeGrant(req.params.id, req.user.id);
  res.status(200).json(successResponse('Grant revoked', result));
});

/** GET /api/admin/review-lock/logs?page=&limit= → { logs, total, page, limit } */
const logs = catchAsync(async (req, res) => {
  const result = await lockService.recentLogs({ page: req.query.page, limit: req.query.limit });
  res.status(200).json(successResponse('Review lock logs', result));
});

// ── Mentor ──────────────────────────────────────────────────────────────────

/** GET /api/mentor/review/lock-state → { locked, hasActiveGrant, grantExpiresAt, pendingRequest } */
const lockState = catchAsync(async (req, res) => {
  const data = await lockService.getLockStateForMentor(req.user.id, requestedClanId(req));
  res.status(200).json(successResponse('Lock state', data));
});

/** POST /api/mentor/review/unlock-request { sessionId?, reason } → { request } */
const requestUnlock = catchAsync(async (req, res) => {
  const request = await lockService.requestUnlock(req.user.id, req.body || {});
  res.status(201).json(successResponse('Unlock requested', { request }, 201));
});

module.exports = {
  overview, setLock, listRequests, respondToRequest, listGrants, revokeGrant, logs,
  lockState, requestUnlock,
};
