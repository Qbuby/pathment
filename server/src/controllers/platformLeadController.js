const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const platformLeadService = require('../services/platformLeadService');

// Public: the marketing site's buyer-interest form forwards here.
const createPublic = catchAsync(async (req, res) => {
  res.status(202).json(successResponse('Thanks - we will be in touch shortly', await platformLeadService.createPublic(req.body), 202));
});

const list = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Leads retrieved', await platformLeadService.list(req.query)));
});

const update = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Lead updated', { lead: await platformLeadService.update(req.user, req.params.id, req.body) }));
});

module.exports = { createPublic, list, update };
