const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { models } = require('../db');

/** The FULL catalog - every limit and feature key, inactive plans included.
 *  This is the operator view; the public projection stays in /organizations/plans. */
const listPlans = catchAsync(async (_req, res) => {
  const plans = await models.Plan.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] });
  res.status(200).json(successResponse('Plans retrieved', { plans }));
});

module.exports = { listPlans };
