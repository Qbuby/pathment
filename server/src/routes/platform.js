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

const provisioning = require('../controllers/platformProvisioningController');
const billing = require('../controllers/platformBillingController');
const { platformActivationLimiter } = require('../middlewares/rateLimiter');

// ── Owner activation (PUBLIC: this is how the first password gets set) ───────
router.post('/activation/validate', platformActivationLimiter, validateBody(s.activationValidate), provisioning.validateActivation);
router.post('/activation/consume', platformActivationLimiter, validateBody(s.activationConsume), provisioning.consumeActivation);

// ── Provisioning ─────────────────────────────────────────────────────────────
router.get('/slug-check', authenticate, requirePlatform('billing'), validateQuery(s.slugQuery), provisioning.checkSlug);
router.post('/organizations', authenticate, requirePlatform('billing'), validateBody(s.provision), provisioning.provision);
router.post('/organizations/:id/activation/resend', authenticate, requirePlatform('support'), validateParams(s.idParam), provisioning.resendActivation);
router.post('/organizations/:id/activation/revoke', authenticate, requirePlatform('support'), validateParams(s.idParam), provisioning.revokeActivation);

// ── Plan catalog (operator view + owner authoring) ───────────────────────────
router.get('/plans', authenticate, requirePlatform('read'), billing.listPlans);
router.post('/plans', authenticate, requirePlatform('owner'), validateBody(s.planCreate), billing.createPlan);
router.patch('/plans/:id', authenticate, requirePlatform('owner'), validateParams(s.idParam), validateBody(s.planUpdate), billing.updatePlan);

// ── Overrides (custom per-workspace arrangements) ────────────────────────────
router.get('/organizations/:id/subscription', authenticate, requirePlatform('read'), validateParams(s.idParam), billing.subscription);
router.put('/organizations/:id/overrides', authenticate, requirePlatform('billing'), validateParams(s.idParam), validateBody(s.overrides), billing.setOverrides);
router.get('/overrides', authenticate, requirePlatform('read'), billing.overridesReport);

// ── Billing: request queue, invoice activation, operator assignment ──────────
router.get('/billing/requests', authenticate, requirePlatform('read'), billing.pendingRequests);
router.post('/billing/requests/activate', authenticate, requirePlatform('billing'), validateBody(s.activateRequested), billing.activateRequested);
router.post('/organizations/:id/plan', authenticate, requirePlatform('billing'), validateParams(s.idParam), validateBody(s.assignPlan), billing.assignPlan);
router.patch('/organizations/:id/subscription', authenticate, requirePlatform('billing'), validateParams(s.idParam), validateBody(s.subscriptionPatch), billing.patchSubscription);

const leads = require('../controllers/platformLeadController');
const { buyerLeadLimiter } = require('../middlewares/rateLimiter');

// ── Buyer leads (public intake + operator inbox) ─────────────────────────────
router.post('/leads', buyerLeadLimiter, validateBody(s.leadCreate), leads.createPublic);
router.get('/leads', authenticate, requirePlatform('read'), validateQuery(s.leadsQuery), leads.list);
router.patch('/leads/:id', authenticate, requirePlatform('support'), validateParams(s.idParam), validateBody(s.leadUpdate), leads.update);

// ── Platform audit trail ─────────────────────────────────────────────────────
router.get('/audit', authenticate, requirePlatform('read'), validateQuery(s.auditQuery), console_.listAudit);
router.get('/audit/actions', authenticate, requirePlatform('read'), console_.auditActions);

module.exports = router;
