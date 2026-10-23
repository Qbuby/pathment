const { AuthenticationError, AuthorizationError } = require('../utils/errors/errorTypes');
const { catchAsync } = require('./errorHandler');
const { models } = require('../db');

/**
 * Platform-console authorization.
 *
 * Platform actions span every workspace, so no workspace role, custom role or
 * permission may ever grant them - this gate reads platform_admins only. It is
 * the successor of the PLATFORM_ADMIN_EMAILS allow-list; the env var still
 * works, as a bootstrap: an address named there acts as a platform OWNER, so a
 * fresh deployment (or a locked-out one) can always reach the console and
 * grant real rows. Unset env + empty table = nobody, closed by default.
 *
 * Tiers open gates:
 *   owner    -> read, support, billing, lifecycle, owner
 *   billing  -> read, billing
 *   support  -> read, support
 *   readonly -> read
 *
 * `lifecycle` (suspending/archiving a whole workspace, account suspension) is
 * deliberately owner-only: those are the actions that take a paying customer
 * offline.
 */
const GATES = {
  owner: new Set(['read', 'support', 'billing', 'lifecycle', 'owner']),
  billing: new Set(['read', 'billing']),
  support: new Set(['read', 'support']),
  readonly: new Set(['read']),
};

function envOwnerEmails() {
  return String(process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

/** Resolve the caller's platform role, or null. Exported for /platform/me. */
async function resolvePlatformRole(user) {
  if (!user?.id) return null;
  const row = await models.PlatformAdmin.findOne({ where: { userId: user.id, revokedAt: null } });
  if (row) {
    // Fire-and-forget presence marker; a failed write must not fail the request.
    row.update({ lastSeenAt: new Date() }).catch(() => {});
    return { role: row.role, via: 'grant', grantedAt: row.createdAt };
  }
  if (envOwnerEmails().includes(String(user.email || '').toLowerCase())) {
    return { role: 'owner', via: 'env', grantedAt: null };
  }
  return null;
}

/** requirePlatform('read' | 'support' | 'billing' | 'lifecycle' | 'owner') */
function requirePlatform(gate = 'read') {
  return catchAsync(async (req, _res, next) => {
    if (!req.user) throw new AuthenticationError('You must be logged in to access this resource');
    const admin = await resolvePlatformRole(req.user);
    if (!admin) throw new AuthorizationError('Platform admin access is required');
    if (!GATES[admin.role]?.has(gate)) {
      throw new AuthorizationError('Your platform role does not allow this action');
    }
    req.platformAdmin = admin;
    next();
  });
}

module.exports = { requirePlatform, resolvePlatformRole, GATES };
