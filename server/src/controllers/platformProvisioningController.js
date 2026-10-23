const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const platformProvisioningService = require('../services/platformProvisioningService');

const checkSlug = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Slug checked', await platformProvisioningService.checkSlug(req.query.slug)));
});

const provision = catchAsync(async (req, res) => {
  const result = await platformProvisioningService.provision(req.user, req.body);
  res.status(201).json(successResponse('Workspace provisioned', result, 201));
});

const resendActivation = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Activation link resent', await platformProvisioningService.resendActivation(req.user, req.params.id)));
});

const revokeActivation = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Activation link revoked', await platformProvisioningService.revokeActivation(req.user, req.params.id)));
});

// Public: the activation page itself (no session exists yet).
const validateActivation = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Activation link valid', await platformProvisioningService.validateActivation(req.body.token)));
});

const consumeActivation = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Workspace activated', await platformProvisioningService.consumeActivation(req.body)));
});

module.exports = { checkSlug, provision, resendActivation, revokeActivation, validateActivation, consumeActivation };
