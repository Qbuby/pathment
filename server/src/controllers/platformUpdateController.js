const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const changelogService = require('../services/changelogService');
const platformAudit = require('../services/platformAuditService');

/**
 * "What's New" authoring, from the platform console. ProductUpdate rows are
 * GLOBAL - one entry reaches every workspace's role-filtered feed - so writing
 * them was never a tenant action, however long it lived on the workspace admin
 * screen. Reading the feed stays at /api/changelog for every signed-in user.
 */

const list = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Updates retrieved', await changelogService.listForAdmin(req.query)));
});

const create = catchAsync(async (req, res) => {
  const update = await changelogService.create(req.user.id, req.body);
  await platformAudit.record({
    action: 'PLATFORM_UPDATE_CREATED', targetType: 'ProductUpdate', targetId: update.title,
    newValues: { id: update.id, type: update.type, audience: update.audience, isMajor: update.isMajor, publishedAt: update.publishedAt },
    actor: req.user,
  });
  res.status(201).json(successResponse('Update created', { update }, 201));
});

const update = catchAsync(async (req, res) => {
  const result = await changelogService.update(req.params.id, req.body);
  await platformAudit.record({
    action: 'PLATFORM_UPDATE_EDITED', targetType: 'ProductUpdate', targetId: result.title,
    newValues: req.body,
    actor: req.user,
  });
  res.status(200).json(successResponse('Update saved', { update: result }));
});

const remove = catchAsync(async (req, res) => {
  await changelogService.remove(req.params.id);
  await platformAudit.record({
    action: 'PLATFORM_UPDATE_DELETED', targetType: 'ProductUpdate', targetId: req.params.id,
    actor: req.user,
  });
  res.status(200).json(successResponse('Update deleted', { removed: true }));
});

// Body: { updates: [...], publish?: boolean } OR a bare [...] array - the same
// contract the workspace route had, so an exported JSON file keeps importing.
const importMany = catchAsync(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : (req.body && req.body.updates);
  const publishAll = !Array.isArray(req.body) && Boolean(req.body && req.body.publish);
  const result = await changelogService.importMany(req.user.id, items, publishAll);
  await platformAudit.record({
    action: 'PLATFORM_UPDATE_IMPORTED', targetType: 'ProductUpdate',
    newValues: { created: result.created, total: result.total, publishAll },
    actor: req.user,
  });
  res.status(201).json(successResponse('Updates imported', result));
});

module.exports = { list, create, update, remove, importMany };
