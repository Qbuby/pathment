const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { resolvePlatformRole, GATES } = require('../middlewares/platformAdmin');
const platformAdminService = require('../services/platformAdminService');
const platformAudit = require('../services/platformAuditService');

/**
 * Who am I, to the console? Any authenticated user may ask; the answer for a
 * non-operator is a plain "no" rather than a 403, so the client can route to
 * a not-found page without an error toast.
 */
const me = catchAsync(async (req, res) => {
  const admin = await resolvePlatformRole(req.user);
  res.status(200).json(successResponse('Platform access resolved', {
    isPlatformAdmin: Boolean(admin),
    role: admin?.role || null,
    via: admin?.via || null,
    gates: admin ? Array.from(GATES[admin.role] || []) : [],
    user: { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email },
  }));
});

const listAdmins = catchAsync(async (req, res) => {
  const admins = await platformAdminService.list({ includeRevoked: req.query.includeRevoked === 'true' });
  res.status(200).json(successResponse('Platform admins retrieved', { admins }));
});

const grantAdmin = catchAsync(async (req, res) => {
  const admin = await platformAdminService.grant(req.user, req.body);
  res.status(201).json(successResponse('Platform admin granted', { admin }, 201));
});

const updateAdmin = catchAsync(async (req, res) => {
  const admin = await platformAdminService.update(req.user, req.params.id, req.body);
  res.status(200).json(successResponse('Platform admin updated', { admin }));
});

const revokeAdmin = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Platform admin revoked', await platformAdminService.revoke(req.user, req.params.id)));
});

const listAudit = catchAsync(async (req, res) => {
  const result = await platformAudit.list(req.query);
  res.status(200).json(successResponse('Audit entries retrieved', result));
});

const auditActions = catchAsync(async (_req, res) => {
  res.status(200).json(successResponse('Audit actions retrieved', { actions: await platformAudit.actions() }));
});

module.exports = { me, listAdmins, grantAdmin, updateAdmin, revokeAdmin, listAudit, auditActions };
