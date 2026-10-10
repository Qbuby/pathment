const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { AuthorizationError } = require('../utils/errors/errorTypes');
const authzService = require('../services/authzService');
const menteeRecordService = require('../services/menteeRecordService');

/**
 * One mentee's record across every clan in the organisation.
 *
 * Deliberately NOT clan-scoped — see the comment on the authorization call,
 * which is the one thing on this route that is easy to "fix" into a bug.
 */

/** GET /api/mentor/mentee/:id/record */
const getRecord = catchAsync(async (req, res) => {
  /**
   * NO clanId — and this is deliberate, not an oversight.
   *
   * `canViewMentee` treats `opts.clanId` as a HARD GATE: when one is given,
   * access must come through THAT clan. Every neighbouring route passes
   * `requestedClanId(req)`, so adding it here looks like fixing an
   * inconsistency — and it would silently collapse this record to the active
   * clan, which is the entire thing it exists to escape.
   *
   * With no clanId, `canViewMentee` admits on `mentee.view` at ANY clan the
   * mentee is in, which is exactly the right admit set. The per-clan boundary
   * is not lost: it comes back inside the payload as each clan's `visibility`
   * tier. `tests/mentor/mentee-record-clan-header.test.js` guards this.
   */
  const allowed = await authzService.canViewMentee(req.user, req.params.id, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined,
  });
  if (!allowed) throw new AuthorizationError('You do not have access to this mentee');

  const record = await menteeRecordService.getMenteeRecord(req.params.id, req.user, {
    includeTasks: req.query.view !== 'compact',
  });
  if (!record) {
    return res.status(404).json({ success: false, message: 'Mentee not found', statusCode: 404 });
  }
  res.status(200).json(successResponse('Mentee record retrieved', { record }));
});

/** GET /api/mentor/mentee/:id/open-work-elsewhere?excludeClanId=… */
const getOpenWorkElsewhere = catchAsync(async (req, res) => {
  // Same reasoning as above: no clanId into the authorization check. The clan
  // being reviewed is an EXCLUSION on the data, not a gate on the access.
  const allowed = await authzService.canViewMentee(req.user, req.params.id, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined,
  });
  if (!allowed) throw new AuthorizationError('You do not have access to this mentee');

  const tasks = await menteeRecordService.openWorkElsewhere(req.params.id, req.user, {
    excludeClanId: req.query.excludeClanId || null,
  });
  res.status(200).json(successResponse('Open work in other clans', { tasks, count: tasks.length }));
});

module.exports = { getRecord, getOpenWorkElsewhere };
