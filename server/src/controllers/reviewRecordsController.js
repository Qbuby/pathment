const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/reviewRecordsService');
const authzService = require('../services/authzService');

/** GET /api/admin/review-records?programId=&clanId=&mentorId=&from=&to= */
const list = catchAsync(async (req, res) => {
  const { programId, clanId, mentorId, from, to, limit } = req.query;
  const data = await svc.orgReviewRecords({
    programId, clanId, mentorId, from, to, limit,
    programScope: await authzService.adminProgramScope(req.user),
  });
  res.status(200).json(successResponse('Review records', data));
});

/** GET /api/admin/review-records/:id */
const detail = catchAsync(async (req, res) => {
  const session = await svc.sessionDetail(req.params.id);
  if (!session) return res.status(404).json(successResponse('Not found', null));
  // Hiding a session from the list and serving it on a guessed id is no bound.
  await authzService.assertProgramInScope(req.user, session.programId ?? null);
  res.status(200).json(successResponse('Review record', { session }));
});

module.exports = { list, detail };
