const express = require('express');
const router = express.Router();
const c = require('../controllers/externalAppController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePlatformAdmin } = require('../middlewares/authz');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate');
const { externalAppSchemas } = require('../validations/externalAppValidation');
const { PERMISSIONS } = require('../config/permissions');

router.use(authenticate);

// Catalog authoring is a PLATFORM action (the catalog is shared by every
// workspace), so it is not gated on any workspace permission. Until the
// platform super-admin role exists, PLATFORM_ADMIN_EMAILS names who may do it.
router.get('/catalog', requirePlatformAdmin, validateQuery(externalAppSchemas.listQuery), c.listCatalog);
router.post('/catalog', requirePlatformAdmin, validateBody(externalAppSchemas.createApp), c.create);
router.patch('/catalog/:id', requirePlatformAdmin, validateParams(externalAppSchemas.idParam), validateBody(externalAppSchemas.updateApp), c.update);
router.delete('/catalog/:id', requirePlatformAdmin, validateParams(externalAppSchemas.idParam), c.remove);

// A workspace's own view + connections — gated on system.settings (org admins hold it).
router.get('/', requirePermission(PERMISSIONS.SYSTEM_SETTINGS), validateQuery(externalAppSchemas.listQuery), c.list);
router.post('/:id/connect', requirePermission(PERMISSIONS.SYSTEM_SETTINGS), validateParams(externalAppSchemas.idParam), validateBody(externalAppSchemas.connect), c.connect);
router.post('/:id/test', requirePermission(PERMISSIONS.SYSTEM_SETTINGS), validateParams(externalAppSchemas.idParam), c.test);
router.delete('/:id/connect', requirePermission(PERMISSIONS.SYSTEM_SETTINGS), validateParams(externalAppSchemas.idParam), c.disconnect);

module.exports = router;
