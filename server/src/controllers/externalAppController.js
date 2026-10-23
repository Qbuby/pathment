const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const externalAppService = require('../services/externalAppService');

// ── Workspace view (org admins) ───────────────────────────────────────────────

const list = catchAsync(async (req, res) => {
  const apps = await externalAppService.listForOrganization(req.organizationId, req.query);
  res.status(200).json(successResponse('Apps retrieved', { apps }));
});

const connect = catchAsync(async (req, res) => {
  const app = await externalAppService.connect(req.user, req.organizationId, req.params.id, req.body.credentials);
  res.status(200).json(successResponse('App connected', { app }));
});

const test = catchAsync(async (req, res) => {
  const result = await externalAppService.test(req.organizationId, req.params.id);
  res.status(200).json(successResponse('Connection tested', result));
});

const disconnect = catchAsync(async (req, res) => {
  const result = await externalAppService.disconnect(req.organizationId, req.params.id);
  res.status(200).json(successResponse('App disconnected', result));
});

// ── Catalog authoring (platform admins) ───────────────────────────────────────

const listCatalog = catchAsync(async (req, res) => {
  const apps = await externalAppService.listCatalog(req.query);
  res.status(200).json(successResponse('App catalog retrieved', { apps }));
});

const create = catchAsync(async (req, res) => {
  const app = await externalAppService.create(req.body, req.user);
  res.status(201).json(successResponse('App created', { app }, 201));
});

const update = catchAsync(async (req, res) => {
  const app = await externalAppService.update(req.params.id, req.body);
  res.status(200).json(successResponse('App updated', { app }));
});

const remove = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('App deleted', await externalAppService.remove(req.params.id)));
});

module.exports = { list, connect, test, disconnect, listCatalog, create, update, remove };
