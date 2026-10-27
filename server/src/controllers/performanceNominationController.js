const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const service = require('../services/performanceNominationService');
const { requestedClanId } = require('../middlewares/portalScope');

/** The data's own ranking for a clan or a whole programme. */
const evidence = catchAsync(async (req, res) => {
  res.json(successResponse('Completed work evidence', await service.evidence(req.params.id, req.user, req.query.page)));
});

const getRanking = catchAsync(async (req, res) => {
  const data = await service.ranking({
    // The caller decides the scope. Without this the service ranked whatever
    // clan the query string named, for anybody signed in.
    user: req.user,
    programId: req.query.programId,
    clanId: req.query.clanId || requestedClanId(req) || null,
    limit: Number(req.query.limit) || 50
  });
  res.status(200).json(successResponse('Performance ranking', data));
});

const list = catchAsync(async (req, res) => {
  const data = await service.list({
    user: req.user,
    programId: req.query.programId || null,
    status: req.query.status || null,
    // An explicit clan wins; otherwise the portal's own selected clan, which
    // is the one the mentor is looking at.
    clanId: req.query.clanId || requestedClanId(req) || null
  });
  res.status(200).json(successResponse('Nominations retrieved', data));
});

const nominate = catchAsync(async (req, res) => {
  const data = await service.nominate(req.params.menteeId, req.body, req.user);
  res.status(201).json(successResponse('Nomination submitted', data, 201));
});

const draft = catchAsync(async (req, res) => {
  const data = await service.aiDraft(req.params.menteeId, req.body, req.user);
  res.status(200).json(successResponse('Draft ready', data));
});

const decide = catchAsync(async (req, res) => {
  const data = await service.decide(req.params.id, req.body, req.user);
  res.status(200).json(successResponse('Decision recorded', data));
});

module.exports = { evidence, getRanking, list, nominate, draft, decide };
