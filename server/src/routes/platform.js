/**
 * The Pathment platform console - the OPERATOR surface, spanning every
 * workspace. Nothing here is reachable through a workspace role: every
 * authenticated route passes requirePlatform(gate), which reads
 * platform_admins (with PLATFORM_ADMIN_EMAILS as the bootstrap owner
 * allow-list). organizationContext deliberately skips /api/platform, so these
 * handlers run with NO workspace in context - cross-tenant reads are explicit
 * (skipOrganizationScope) and tenant-scoped writes enter the target
 * workspace's context on purpose.
 */
const express = require('express');
const router = express.Router();

const { authenticate } = require('../middlewares/auth');
const { requirePlatform } = require('../middlewares/platformAdmin');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate');
const { platformSchemas: s } = require('../validations/platformValidation');
const console_ = require('../controllers/platformConsoleController');

// ── Console identity & platform admins ───────────────────────────────────────
router.get('/me', authenticate, console_.me);
router.get('/admins', authenticate, requirePlatform('owner'), console_.listAdmins);
router.post('/admins', authenticate, requirePlatform('owner'), validateBody(s.grantAdmin), console_.grantAdmin);
router.patch('/admins/:id', authenticate, requirePlatform('owner'), validateParams(s.idParam), validateBody(s.updateAdmin), console_.updateAdmin);
router.delete('/admins/:id', authenticate, requirePlatform('owner'), validateParams(s.idParam), console_.revokeAdmin);

const organizations = require('../controllers/platformOrgController');

// ── Metrics & workspace directory ────────────────────────────────────────────
router.get('/metrics', authenticate, requirePlatform('read'), organizations.metrics);
router.get('/organizations', authenticate, requirePlatform('read'), validateQuery(s.organizationsQuery), organizations.directory);
router.get('/organizations/:id', authenticate, requirePlatform('read'), validateParams(s.idParam), organizations.detail);
router.get('/organizations/:id/members', authenticate, requirePlatform('read'), validateParams(s.idParam), validateQuery(s.membersQuery), organizations.members);
router.get('/organizations/:id/audit', authenticate, requirePlatform('read'), validateParams(s.idParam), organizations.audit);
router.post('/organizations/:id/status', authenticate, requirePlatform('lifecycle'), validateParams(s.idParam), validateBody(s.organizationStatus), organizations.setStatus);

// ── Platform audit trail ─────────────────────────────────────────────────────
router.get('/audit', authenticate, requirePlatform('read'), validateQuery(s.auditQuery), console_.listAudit);
router.get('/audit/actions', authenticate, requirePlatform('read'), console_.auditActions);

module.exports = router;
