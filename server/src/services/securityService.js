const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { models, Sequelize } = require('../db');
const { NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors/errorTypes');
const { Op } = Sequelize;

// Best-effort "Chrome on Mac" from a user-agent string (no dependency).
const parseDevice = (ua) => {
  if (!ua) return null;
  const browser =
    /edg/i.test(ua) ? 'Edge' :
    /opr|opera/i.test(ua) ? 'Opera' :
    /chrome|crios/i.test(ua) ? 'Chrome' :
    /firefox|fxios/i.test(ua) ? 'Firefox' :
    /safari/i.test(ua) ? 'Safari' : null;
  const os =
    /iphone|ipad|ipod/i.test(ua) ? 'iOS' :
    /android/i.test(ua) ? 'Android' :
    /mac os x|macintosh/i.test(ua) ? 'Mac' :
    /windows/i.test(ua) ? 'Windows' :
    /linux/i.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || null;
};

// "PROGRAM_CREATED" -> "Program created"
const titleCase = (s) => {
  const t = String(s || '').replace(/_/g, ' ').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

// Nicer labels for the few actions where the auto title-case reads awkwardly.
const AUDIT_LABELS = {
  REGISTRATION_INVITE_CREATED: 'Invite sent',
  BULK_REGISTRATION_INVITES_CREATED: 'Bulk invites sent',
  REGISTRATION_INVITE_REVOKED: 'Invite revoked',
  ACCESS_INVITE_CREATED: 'Access invite sent',
  ROLE_GRANTED: 'Role granted',
  ROLE_REVOKED: 'Role revoked',
  ADMIN_CREATED: 'Admin created',
  ADMIN_PERMISSIONS_UPDATED: 'Admin permissions updated',
  APPLICATIONS_IMPORTED: 'Applications imported',
  PROGRAM_CREATED: 'Program created',
  PROGRAM_UPDATED: 'Program updated',
  PROGRAM_DELETED: 'Program deleted',
  PROGRAM_CLONED: 'Program cloned',
  PROGRAM_ENROLLED: 'Program enrollment',
};

/**
 * Turning a request line into something a person can read.
 *
 * `auditTrail` records every state-changing request as `POST /api/...`, which
 * is the right thing to store and the wrong thing to show: the access log read
 * as a web-server log, full of lines like
 * `Post /api/messaging/conversations/8d1e58c5-…/read`. An admin is a person,
 * not a log parser.
 *
 * Each entry below matches a path and says what the person DID. Order matters
 * — the first match wins — and anything unmatched falls back to a tidied
 * resource name rather than the raw line, so a new endpoint degrades to
 * "Updated messaging" instead of leaking its URL.
 */
const REQUEST_PHRASES = [
  { re: /^\/api\/activity\/session/, verb: () => 'Was active in the app', noise: true },
  { re: /^\/api\/messaging\/conversations\/[^/]+\/read$/, verb: () => 'Opened a conversation', noise: true },
  { re: /^\/api\/notifications\/.*read/, verb: () => 'Read a notification', noise: true },
  { re: /^\/api\/auth\/refresh/, verb: () => 'Renewed their session', noise: true },
  { re: /^\/api\/auth\/login/, verb: () => 'Signed in' },
  { re: /^\/api\/auth\/logout/, verb: () => 'Signed out' },
  { re: /^\/api\/messaging/, verb: (m) => (m === 'POST' ? 'Sent a message' : 'Changed a conversation') },
  { re: /^\/api\/tasks/, verb: (m) => (m === 'POST' ? 'Assigned a task' : m === 'DELETE' ? 'Removed a task' : 'Changed a task') },
  { re: /^\/api\/clans/, verb: (m) => (m === 'POST' ? 'Created or joined a clan' : m === 'DELETE' ? 'Removed somebody from a clan' : 'Changed a clan') },
  { re: /^\/api\/programs/, verb: (m) => (m === 'POST' ? 'Created a programme' : m === 'DELETE' ? 'Deleted a programme' : 'Changed a programme') },
  { re: /^\/api\/admin\/review-lock/, verb: () => 'Changed the review lock' },
  { re: /^\/api\/admin/, verb: () => 'Changed an admin setting' },
  { re: /^\/api\/organizations/, verb: () => 'Changed the workspace' },
  { re: /^\/api\/certificates/, verb: () => 'Worked on certificates' },
  { re: /^\/api\/community/, verb: (m) => (m === 'POST' ? 'Posted in the community' : 'Changed a community post') },
  { re: /^\/api\/meetings/, verb: () => 'Changed their calendar' },
  { re: /^\/api\/profile|^\/api\/users\/me/, verb: () => 'Updated their profile' },
];

/**
 * The action patterns that are background activity, for filtering in SQL.
 *
 * Kept beside `REQUEST_PHRASES` on purpose: a phrase marked `noise: true`
 * there must have a pattern here, or the screen would hide a row the query
 * still returned (or the reverse) and the counts would not add up.
 */
const NOISE_PATTERNS = [
  '%/api/activity/session%',
  '%/api/messaging/conversations/%/read',
  '%/api/notifications/%read%',
  '%/api/auth/refresh%',
];

/** `POST /api/x/y` → a sentence, a section, and whether it is background noise. */
function describeRequest(action) {
  const match = String(action || '').match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)$/i);
  if (!match) return null;
  const method = match[1].toUpperCase();
  const path = match[2];
  const hit = REQUEST_PHRASES.find((p) => p.re.test(path));
  const resource = path.split('/').filter(Boolean)[1] || 'the workspace';
  return {
    label: hit ? hit.verb(method) : `${method === 'DELETE' ? 'Removed' : method === 'POST' ? 'Added' : 'Updated'} ${String(resource).replace(/-/g, ' ')}`,
    /**
     * Heartbeats, read receipts and token refreshes are the app working, not
     * the person acting. They are still recorded — an audit trail with holes
     * in it is not an audit trail — but they are marked so the screen can
     * keep them out of the way by default.
     */
    noise: Boolean(hit?.noise),
  };
}

class SecurityService {
  /**
   * Get user's active sessions
   */
  async getActiveSessions(userId) {
    const sessions = await models.UserSession.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'ipAddress',
        'deviceType',
        'userAgent',
        'createdAt',
        'lastActivityAt',
        'isActive'
      ]
    });

    return sessions;
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId, sessionId) {
    const session = await models.UserSession.findOne({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await session.destroy();
    return { success: true };
  }

  /**
   * Revoke all other sessions (keep current session active)
   */
  async revokeAllOtherSessions(userId, currentSessionId) {
    await models.UserSession.destroy({
      where: {
        userId,
        id: { [Op.ne]: currentSessionId }
      }
    });

    return { success: true };
  }

  /**
   * Get user's audit logs
   */
  /**
   * One person's audit trail, searchable and without the background chatter.
   *
   * `includeNoise` is off by default: session heartbeats, read receipts and
   * token refreshes are the application working rather than the person
   * acting, and they outnumbered everything else by enough that the screen
   * was unusable. They are still stored and still one toggle away.
   *
   * The noise filter runs in SQL on the ACTION, not after paging, so page two
   * is not half empty.
   */
  async getAuditLogs(userId, options = {}) {
    const { limit = 50, offset = 0, search = '', includeNoise = false } = options;

    const where = { userId };
    const and = [];
    if (!includeNoise) {
      /**
       * Every pattern has to miss, which is an AND of NOT ILIKE.
       * `NOT ILIKE ANY(array)` reads like "none of these" and is not: it is
       * true as soon as the row differs from ONE pattern, so it matched
       * practically everything and filtered nothing.
       */
      for (const pattern of NOISE_PATTERNS) {
        and.push({ action: { [Op.notILike]: pattern } });
      }
    }
    const term = String(search || '').trim();
    if (term) {
      and.push({
        [Op.or]: [
          { action: { [Op.iLike]: `%${term}%` } },
          { entityType: { [Op.iLike]: `%${term}%` } },
          { ipAddress: { [Op.iLike]: `%${term}%` } },
        ],
      });
    }
    if (and.length) where[Op.and] = and;

    const logs = await models.AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: [
        'id',
        'action',
        'entityType',
        'entityId',
        'oldValues',
        'newValues',
        'ipAddress',
        'userAgent',
        'createdAt'
      ]
    });

    return {
      total: logs.count,
      logs: logs.rows.map((l) => this._formatAuditLog(l))
    };
  }

  /**
   * Turn a raw audit row into something a human can read: a friendly label and a
   * one-line summary built from the recorded values (who/what), instead of an
   * ACTION_CONSTANT + an opaque UUID.
   */
  _formatAuditLog(l) {
    const nv = l.newValues || {};
    const ov = l.oldValues || {};
    // A raw request line is turned into a sentence; a semantic action keeps
    // the label it was given.
    const described = AUDIT_LABELS[l.action] ? null : describeRequest(l.action);
    const label = AUDIT_LABELS[l.action] || described?.label || titleCase(l.action);

    let summary = null;
    switch (l.action) {
      case 'REGISTRATION_INVITE_CREATED':
      case 'ACCESS_INVITE_CREATED':
        summary = `Invited ${nv.email || 'someone'}${nv.role ? ` as ${String(nv.role).replace(/_/g, ' ')}` : ''}`;
        break;
      case 'BULK_REGISTRATION_INVITES_CREATED':
        summary = `Created ${nv.totalCreated ?? 0} invite${(nv.totalCreated ?? 0) === 1 ? '' : 's'}` +
          (nv.totalSkipped ? `, skipped ${nv.totalSkipped}` : '');
        break;
      case 'REGISTRATION_INVITE_REVOKED':
        summary = nv.email || ov.email ? `Revoked invite for ${nv.email || ov.email}` : 'Revoked an invite';
        break;
      case 'PROGRAM_CREATED':
      case 'PROGRAM_UPDATED':
      case 'PROGRAM_CLONED':
      case 'PROGRAM_DELETED':
      case 'PROGRAM_ENROLLED':
        summary = nv.name || ov.name || null;
        break;
      case 'ROLE_GRANTED':
        summary = `Granted ${String(nv.role || 'a role').replace(/_/g, ' ')}${nv.scopeType ? ` (${nv.scopeType})` : ''}`;
        break;
      case 'ROLE_REVOKED':
        summary = `Revoked ${String(ov.role || 'a role').replace(/_/g, ' ')}`;
        break;
      case 'ADMIN_CREATED':
        summary = `Created admin ${nv.email || ''}`.trim();
        break;
      case 'APPLICATIONS_IMPORTED':
        summary = nv.count ? `Imported ${nv.count} application${nv.count === 1 ? '' : 's'}` : 'Imported applications';
        break;
      default:
        summary = nv.name || nv.email || null;
    }

    /** 2xx/3xx is fine; anything else is worth seeing at a glance. */
    const status = Number(nv.status) || null;
    return {
      id: l.id,
      action: l.action,
      label,
      summary,
      /** Background activity rather than something the person chose to do. */
      noise: Boolean(described?.noise),
      status,
      failed: Boolean(status && status >= 400),
      target: titleCase(l.entityType || ''),
      ipAddress: l.ipAddress || null,
      userAgent: l.userAgent || null,
      device: parseDevice(l.userAgent),
      createdAt: l.createdAt
    };
  }

  /**
   * Initiate 2FA setup
   */
  async setup2FA(userId) {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate secret for 2FA
    const secret = speakeasy.generateSecret({
      name: `Pathment (${user.email})`,
      issuer: 'Pathment',
      length: 32
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Store temporary secret (not yet confirmed)
    const temporarySecret = crypto.randomBytes(32).toString('hex');

    // Reuse existing row (including soft-deleted) to avoid unique constraint on user_id.
    const existingTwoFactor = await models.TwoFactorAuth.findOne({
      where: { userId },
      paranoid: false
    });

    if (existingTwoFactor) {
      if (existingTwoFactor.deletedAt) {
        await existingTwoFactor.restore();
      }

      existingTwoFactor.secret = secret.base32;
      existingTwoFactor.qrCode = qrCode;
      existingTwoFactor.backupCodes = this.generateBackupCodes();
      existingTwoFactor.isVerified = false;
      existingTwoFactor.enabledAt = null;
      existingTwoFactor.temporarySecret = temporarySecret;
      await existingTwoFactor.save();
    } else {
      await models.TwoFactorAuth.create({
        userId,
        secret: secret.base32,
        qrCode,
        backupCodes: this.generateBackupCodes(),
        isVerified: false,
        temporarySecret // For verification purposes
      });
    }

    return {
      secret: secret.base32,
      qrCode,
      manualEntryKey: secret.base32
    };
  }

  /**
   * Verify and enable 2FA
   */
  async verify2FA(userId, token, backupCode = null) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: false }
    });

    if (!twoFactorAuth) {
      throw new ValidationError('2FA setup not initiated. Please start setup first.');
    }

    // Verify the token
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!isValid) {
      throw new ValidationError('Invalid verification code. Please try again.');
    }

    // Mark as verified
    twoFactorAuth.isVerified = true;
    twoFactorAuth.enabledAt = new Date();
    await twoFactorAuth.save();

    // Update user's 2FA status
    await models.User.update(
      { twoFactorEnabled: true },
      { where: { id: userId } }
    );

    return {
      success: true,
      backupCodes: twoFactorAuth.backupCodes,
      message: 'Two-factor authentication enabled successfully'
    };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new NotFoundError('2FA is not enabled for this user');
    }

    // Do not soft-delete here because user_id is unique and would block future setup.
    twoFactorAuth.isVerified = false;
    twoFactorAuth.enabledAt = null;
    twoFactorAuth.temporarySecret = null;
    await twoFactorAuth.save();

    // Update user's 2FA status
    await models.User.update(
      { twoFactorEnabled: false },
      { where: { id: userId } }
    );

    return { success: true, message: '2FA disabled successfully' };
  }

  /**
   * Verify 2FA token during login
   */
  async verify2FAToken(userId, token) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new ValidationError('2FA not enabled for this user');
    }

    // Check if it's a backup code
    if (twoFactorAuth.backupCodes && twoFactorAuth.backupCodes.includes(token)) {
      // Remove used backup code
      twoFactorAuth.backupCodes = twoFactorAuth.backupCodes.filter(code => code !== token);
      await twoFactorAuth.save();
      return { success: true, type: 'backup_code' };
    }

    // Verify the TOTP token
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!isValid) {
      throw new UnauthorizedError('Invalid 2FA token');
    }

    return { success: true, type: 'totp' };
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: ['id', 'twoFactorEnabled']
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true },
      attributes: ['enabledAt', 'backupCodes']
    });

    return {
      enabled: user.twoFactorEnabled,
      enabledAt: twoFactorAuth?.enabledAt || null,
      remainingBackupCodes: twoFactorAuth?.backupCodes?.length || 0
    };
  }

  /**
   * Generate backup codes for 2FA
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Regenerate backup codes (when they run out)
   */
  async regenerateBackupCodes(userId) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new NotFoundError('2FA not enabled for this user');
    }

    // Generate new backup codes
    const newCodes = this.generateBackupCodes();
    twoFactorAuth.backupCodes = newCodes;
    await twoFactorAuth.save();

    return {
      success: true,
      backupCodes: newCodes,
      message: 'New backup codes generated successfully. Please save them in a safe place.'
    };
  }
}

module.exports = new SecurityService();
