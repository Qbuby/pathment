const { Op } = require('sequelize');
const { models } = require('../db');
const { ForbiddenError, ValidationError, NotFoundError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const LOCK_KEY = 'cohort_review_delete_locked';

/**
 * cohortReviewLockService - the "deletion lock" for cohort review sessions.
 *
 * When the lock is ON, mentors can't delete or reopen review sessions unless
 * they hold an active, admin-issued grant. A mentor asks via an unlock
 * REQUEST; an admin approves (minting a time-boxed GRANT) or declines.
 * cohortReviewService delegates assertCanDelete() to this module and enforces
 * it in deleteSession/reopenSession.
 *
 * THE LOCK HAS A SCOPE. It used to be one boolean for the whole organisation,
 * which made it all-or-nothing: an admin protecting the records of a
 * programme that had just closed had to freeze deletion for every mentor in
 * every clan, including the ones mid-cohort. Deletion is locked for a session
 * when ANY of these holds:
 *
 *   • the organisation-wide flag is on   (`system_settings`, where it always was)
 *   • its CLAN is locked                 (`cohort_review_locks`)
 *   • its clan's PROGRAMME is locked     (`cohort_review_locks`)
 *
 * Locks only ever add. A grant only ever subtracts, and has the same three
 * scopes: an org-wide grant lifts any lock, a programme or clan grant lifts
 * only the locks that apply there. Every grant written before scopes existed
 * has no scope, which is exactly what org-wide means, so none of them changed.
 */
class CohortReviewLockService {
  // ── flag (system_settings) ───────────────────────────────────────────────
  async isDeleteLocked() {
    const row = await models.SystemSettings.findOne({ where: { settingKey: LOCK_KEY }, attributes: ['settingValue'] });
    return row?.settingValue === 'true';
  }

  async setDeleteLock(locked, adminId) {
    const value = locked ? 'true' : 'false';
    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: LOCK_KEY },
      defaults: {
        settingKey: LOCK_KEY, settingValue: value, settingType: 'boolean',
        category: 'cohort_review', isPublic: false, lastModifiedBy: adminId || null,
      },
    });
    if (row.settingValue !== value || row.lastModifiedBy !== (adminId || null)) {
      row.settingValue = value;
      row.lastModifiedBy = adminId || null;
      await row.save();
    }
    createAuditLog({
      userId: adminId,
      action: locked ? 'REVIEW_LOCK_ENABLED' : 'REVIEW_LOCK_DISABLED',
      entityType: 'system_settings',
      entityId: null,
      newValues: { locked },
    }).catch(() => {});
    return Boolean(locked);
  }

  // ── scoped locks ───────────────────────────────────────────────────────────
  /** The clan and the programme a session sits in. Either may be absent. */
  async _scopeOfClan(clanId) {
    if (!clanId) return { clanId: null, programId: null };
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId'] });
    return { clanId: clan ? clan.id : null, programId: clan?.programId || null };
  }

  /** Every scope that is locked right now, as `${type}:${id}` keys. */
  async _lockedScopeKeys() {
    const rows = await models.CohortReviewLock.findAll({
      attributes: ['scopeType', 'scopeId'], raw: true,
    });
    return new Set(rows.map((r) => `${r.scopeType}:${r.scopeId}`));
  }

  /**
   * Is deletion locked for this clan?
   *
   * No clan means "the question is not about one place" — the org flag alone
   * answers it, which is what every caller predating scopes was asking.
   */
  async isDeleteLockedFor(clanId) {
    if (await this.isDeleteLocked()) return { locked: true, by: 'organization' };
    if (!clanId) return { locked: false, by: null };
    const { programId } = await this._scopeOfClan(clanId);
    const locked = await this._lockedScopeKeys();
    if (locked.has(`clan:${clanId}`)) return { locked: true, by: 'clan' };
    if (programId && locked.has(`program:${programId}`)) return { locked: true, by: 'program' };
    return { locked: false, by: null };
  }

  /** List the locked programmes and clans, with their names, for the admin. */
  async listLockedScopes() {
    const rows = await models.CohortReviewLock.findAll({ order: [['created_at', 'DESC']] });
    if (!rows.length) return [];
    const programIds = rows.filter((r) => r.scopeType === 'program').map((r) => r.scopeId);
    const clanIds = rows.filter((r) => r.scopeType === 'clan').map((r) => r.scopeId);
    const [programs, clans] = await Promise.all([
      programIds.length
        ? models.Program.findAll({ where: { id: { [Op.in]: programIds } }, attributes: ['id', 'name'], raw: true })
        : [],
      clanIds.length
        ? models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'name'], raw: true })
        : [],
    ]);
    const nameOf = new Map([
      ...programs.map((p) => [`program:${p.id}`, p.name]),
      ...clans.map((c) => [`clan:${c.id}`, c.name]),
    ]);
    return rows.map((r) => ({
      id: r.id,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      // A scope whose programme or clan has since been deleted still shows,
      // so an admin can see the row and clear it rather than wonder.
      name: nameOf.get(`${r.scopeType}:${r.scopeId}`) || 'No longer exists',
      lockedBy: r.lockedBy,
      createdAt: r.createdAt,
    }));
  }

  /** Lock or unlock one programme or clan. Locking twice is the same state. */
  async setScopeLock({ scopeType, scopeId, locked }, adminId) {
    if (!['program', 'clan'].includes(scopeType)) {
      throw new ValidationError('A scope is a programme or a clan');
    }
    if (!scopeId) throw new ValidationError('Choose which programme or clan to lock');

    const target = scopeType === 'program'
      ? await models.Program.findByPk(scopeId, { attributes: ['id', 'name', 'organizationId'] })
      : await models.Clan.findByPk(scopeId, {
        attributes: ['id', 'name'],
        include: [{ model: models.Program, as: 'program', attributes: ['organizationId'] }],
      });
    if (!target) throw new NotFoundError('That programme or clan does not exist');
    const organizationId = scopeType === 'program' ? target.organizationId : target.program?.organizationId;
    if (!organizationId) throw new ValidationError('That clan is not attached to a programme');

    if (locked) {
      await models.CohortReviewLock.findOrCreate({
        where: { organizationId, scopeType, scopeId },
        defaults: { organizationId, scopeType, scopeId, lockedBy: adminId || null },
      });
    } else {
      await models.CohortReviewLock.destroy({ where: { organizationId, scopeType, scopeId } });
    }

    createAuditLog({
      userId: adminId,
      action: locked ? 'REVIEW_LOCK_ENABLED' : 'REVIEW_LOCK_DISABLED',
      entityType: scopeType === 'program' ? 'program' : 'clan',
      entityId: scopeId,
      newValues: { locked, scopeType, scopeId, name: target.name },
    }).catch(() => {});

    return { scopeType, scopeId, locked: Boolean(locked), name: target.name };
  }

  // ── grants ─────────────────────────────────────────────────────────────────
  /**
   * An active grant that covers this clan.
   *
   * A grant with no scope is org-wide and covers everything, which is what
   * every grant issued before scopes meant. A scoped one has to name the clan
   * or its programme.
   */
  async hasActiveGrant(mentorId, clanId = null) {
    const grants = await models.CohortReviewUnlockGrant.findAll({
      where: { mentorId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
      order: [['expires_at', 'DESC']],
    });
    if (!grants.length) return null;
    const orgWide = grants.find((g) => !g.scopeType);
    if (orgWide) return orgWide;
    if (!clanId) return null;
    const { programId } = await this._scopeOfClan(clanId);
    return grants.find((g) =>
      (g.scopeType === 'clan' && g.scopeId === clanId)
      || (g.scopeType === 'program' && programId && g.scopeId === programId)) || null;
  }

  /** Throw if deletion is locked where this session lives and nothing lifts it. */
  async assertCanDelete(mentorId, clanId = null) {
    const { locked, by } = await this.isDeleteLockedFor(clanId);
    if (!locked) return;
    const grant = await this.hasActiveGrant(mentorId, clanId);
    if (!grant) {
      const where = by === 'organization' ? 'by your organization'
        : by === 'program' ? 'for this programme'
          : 'for this clan';
      throw new ForbiddenError(`Deletion is locked ${where}. Request access from an admin.`);
    }
  }

  // ── mentor: request unlock ──────────────────────────────────────────────────
  async requestUnlock(mentorId, { sessionId, reason } = {}) {
    const existing = await models.CohortReviewUnlockRequest.findOne({
      where: { mentorId, status: 'pending' },
    });
    if (existing) throw new ValidationError('You already have a pending unlock request.');

    const request = await models.CohortReviewUnlockRequest.create({
      mentorId,
      sessionId: sessionId || null,
      reason: (reason || '').trim() || null,
      status: 'pending',
    });

    createAuditLog({
      userId: mentorId,
      action: 'REVIEW_UNLOCK_REQUESTED',
      entityType: 'cohort_review_unlock_request',
      entityId: request.id,
      newValues: { sessionId: sessionId || null, reason: request.reason },
    }).catch(() => {});

    this._notifyAdmins(mentorId, request).catch(() => {});
    return request;
  }

  async _notifyAdmins(mentorId, request) {
    const [mentor, admins] = await Promise.all([
      models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] }),
      require('./workspaceRecipients').admins(),
    ]);
    if (!admins.length) return;
    const who = mentor ? `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim() : 'A mentor';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.REVIEW_UNLOCK_REQUESTED,
      recipients: admins.map((a) => ({ userId: a.id })),
      payload: {
        title: 'Cohort-review change requested',
        message: `${who} requested access to edit or delete a locked cohort-review record. Approve or decline under Settings → Review Lock.`,
        actionUrl: '/admin/settings?tab=review-lock',
        actionLabel: 'Review request',
        relatedEntityType: 'cohort_review_unlock_request',
        relatedEntityId: request.id,
        emailSubject: `Pathment: ${who} requested to change a locked review`,
      },
      dedupe: { relatedEntityType: 'cohort_review_unlock_request', relatedEntityId: request.id },
    });
  }

  // ── admin: list / respond ────────────────────────────────────────────────────
  async _leadClanName(mentorId) {
    const m = await models.ClanMembership.findOne({
      where: { userId: mentorId, role: 'lead_mentor', status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['name'] }],
      order: [['joined_at', 'ASC']],
    });
    return m?.clan?.name || null;
  }

  async listRequests({ status } = {}) {
    const where = {};
    if (status && status !== 'all') where.status = status;
    const requests = await models.CohortReviewUnlockRequest.findAll({
      where,
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.CohortReviewSession, as: 'session', attributes: ['id', 'sessionDate'] },
      ],
      order: [['created_at', 'DESC']],
    });
    const out = [];
    for (const r of requests) {
      const clanName = r.mentor ? await this._leadClanName(r.mentor.id) : null;
      out.push({
        id: r.id,
        mentor: r.mentor
          ? { id: r.mentor.id, name: `${r.mentor.firstName || ''} ${r.mentor.lastName || ''}`.trim(), clanName }
          : null,
        sessionId: r.sessionId,
        sessionDate: r.session ? r.session.sessionDate : null,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        decisionNote: r.decisionNote,
      });
    }
    return out;
  }

  /**
   * What a grant should cover: what the admin said, else the clan of the
   * session the mentor asked about, else the whole organisation.
   */
  async _resolveGrantScope(request, scopeType, scopeId) {
    if (scopeType === 'organization') return { scopeType: null, scopeId: null };
    if (['program', 'clan'].includes(scopeType) && scopeId) return { scopeType, scopeId };
    if (request.sessionId) {
      const session = await models.CohortReviewSession.findByPk(request.sessionId, { attributes: ['clanId'] });
      if (session?.clanId) return { scopeType: 'clan', scopeId: session.clanId };
    }
    return { scopeType: null, scopeId: null };
  }

  async respondToRequest(requestId, adminId, { approve, durationHours = 48, expiresAt: expiresAtInput, note, scopeType, scopeId } = {}) {
    const request = await models.CohortReviewUnlockRequest.findByPk(requestId);
    if (!request) throw new NotFoundError('Unlock request not found');
    if (request.status !== 'pending') throw new ValidationError('This request has already been handled.');

    request.reviewedBy = adminId || null;
    request.reviewedAt = new Date();
    request.decisionNote = (note || '').trim() || null;

    if (approve) {
      request.status = 'approved';
      await request.save();

      // Either a preset duration OR an exact expiry (ISO instant from the admin's
      // local date/time picker). The instant is timezone-correct because the
      // client sends a UTC ISO string.
      let expiresAt;
      if (expiresAtInput) {
        expiresAt = new Date(expiresAtInput);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
          throw new ValidationError('The access window must end at a valid time in the future.');
        }
      } else {
        const hours = Number(durationHours) > 0 ? Number(durationHours) : 48;
        expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      }
      /**
       * Grant no more than was asked for.
       *
       * When the request names a session, the grant is scoped to that
       * session's clan by default: answering "yes, fix that one record"
       * should not also hand the mentor every other clan they run for two
       * days. An admin can still widen it by passing an explicit scope, and
       * `scopeType: 'organization'` is the old behaviour, named.
       */
      const scope = await this._resolveGrantScope(request, scopeType, scopeId);

      const grant = await models.CohortReviewUnlockGrant.create({
        mentorId: request.mentorId,
        grantedBy: adminId || null,
        requestId: request.id,
        reason: request.reason,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expiresAt,
      });

      createAuditLog({
        userId: adminId,
        action: 'REVIEW_UNLOCK_GRANTED',
        entityType: 'cohort_review_unlock_grant',
        entityId: grant.id,
        newValues: { mentorId: request.mentorId, requestId: request.id, expiresAt },
      }).catch(() => {});

      this._notifyMentor(request.mentorId, true, { grant, note: request.decisionNote }).catch(() => {});
      return { request, grant };
    }

    request.status = 'declined';
    await request.save();

    createAuditLog({
      userId: adminId,
      action: 'REVIEW_UNLOCK_DECLINED',
      entityType: 'cohort_review_unlock_request',
      entityId: request.id,
      newValues: { mentorId: request.mentorId, note: request.decisionNote },
    }).catch(() => {});

    this._notifyMentor(request.mentorId, false, { note: request.decisionNote }).catch(() => {});
    return { request };
  }

  async _notifyMentor(mentorId, approved, { grant, note } = {}) {
    // Format the expiry in the MENTOR's own timezone (with its label) so the
    // baked-in notification text is correct for them, not the server.
    let expiresText = '';
    if (grant?.expiresAt) {
      const tz = (await models.UserSettings.findOne({ where: { userId: mentorId }, attributes: ['timezone'] }))?.timezone || 'UTC';
      try {
        expiresText = new Date(grant.expiresAt).toLocaleString('en-US', {
          timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        });
      } catch { expiresText = new Date(grant.expiresAt).toISOString(); }
    }
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.REVIEW_UNLOCK_HANDLED,
      recipients: [{ userId: mentorId }],
      payload: {
        title: approved ? 'Review-edit access granted' : 'Review-edit request declined',
        message: approved
          ? `An admin granted you temporary access to edit or delete your cohort-review records${expiresText ? ` until ${expiresText}` : ''}.${note ? ` Note: ${note}` : ''}`
          : `An admin declined your request to edit or delete a cohort-review record.${note ? ` Note: ${note}` : ''}`,
        actionUrl: '/mentor/review',
        actionLabel: 'Open review',
        relatedEntityType: approved ? 'cohort_review_unlock_grant' : 'cohort_review_unlock_declined',
        relatedEntityId: approved ? grant?.id : mentorId,
      },
    });
  }

  // ── admin: grants ────────────────────────────────────────────────────────────
  async listGrants({ active } = {}) {
    const grants = await models.CohortReviewUnlockGrant.findAll({
      include: [{ model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['created_at', 'DESC']],
    });
    const now = Date.now();
    const mapped = [];
    for (const g of grants) {
      const isActive = !g.revokedAt && new Date(g.expiresAt).getTime() > now;
      const clanName = g.mentor ? await this._leadClanName(g.mentor.id) : null;
      mapped.push({
        id: g.id,
        mentor: g.mentor
          ? { id: g.mentor.id, name: `${g.mentor.firstName || ''} ${g.mentor.lastName || ''}`.trim(), clanName }
          : null,
        reason: g.reason,
        scopeType: g.scopeType || 'organization',
        scopeId: g.scopeId || null,
        scopeName: await this._scopeName(g.scopeType, g.scopeId),
        expiresAt: g.expiresAt,
        revokedAt: g.revokedAt,
        createdAt: g.createdAt,
        active: isActive,
      });
    }
    if (active === true || String(active) === 'true') return mapped.filter((g) => g.active);
    return mapped;
  }

  /** "Whole organisation", or the name of the programme / clan a scope names. */
  async _scopeName(scopeType, scopeId) {
    if (!scopeType || !scopeId) return 'Whole organisation';
    const row = scopeType === 'program'
      ? await models.Program.findByPk(scopeId, { attributes: ['name'] })
      : await models.Clan.findByPk(scopeId, { attributes: ['name'] });
    return row?.name || 'No longer exists';
  }

  async revokeGrant(grantId, adminId) {
    const grant = await models.CohortReviewUnlockGrant.findByPk(grantId);
    if (!grant) throw new NotFoundError('Grant not found');
    if (!grant.revokedAt) {
      grant.revokedAt = new Date();
      await grant.save();
    }
    createAuditLog({
      userId: adminId,
      action: 'REVIEW_UNLOCK_REVOKED',
      entityType: 'cohort_review_unlock_grant',
      entityId: grant.id,
      newValues: { mentorId: grant.mentorId },
    }).catch(() => {});
    return { revoked: true };
  }

  // ── views ────────────────────────────────────────────────────────────────────
  /**
   * What a mentor sees, for the clan they are looking at.
   *
   * Without a clan this answers for the organisation alone, which is what the
   * call meant before scopes — so a client that has not been updated gets the
   * same answer it always did.
   */
  async getLockStateForMentor(mentorId, clanId = null) {
    const [state, grant, pending] = await Promise.all([
      this.isDeleteLockedFor(clanId),
      this.hasActiveGrant(mentorId, clanId),
      models.CohortReviewUnlockRequest.findOne({
        where: { mentorId, status: 'pending' },
        attributes: ['id', 'createdAt'],
        order: [['created_at', 'DESC']],
      }),
    ]);
    return {
      locked: state.locked,
      /** 'organization' | 'program' | 'clan' — why it is locked, when it is. */
      lockedBy: state.by,
      hasActiveGrant: Boolean(grant),
      grantExpiresAt: grant ? grant.expiresAt : null,
      pendingRequest: pending ? { id: pending.id, createdAt: pending.createdAt } : null,
    };
  }

  async lockOverview() {
    const now = new Date();
    const [locked, pendingRequests, activeGrants, scopes, choices] = await Promise.all([
      this.isDeleteLocked(),
      models.CohortReviewUnlockRequest.count({ where: { status: 'pending' } }),
      models.CohortReviewUnlockGrant.count({ where: { revokedAt: null, expiresAt: { [Op.gt]: now } } }),
      this.listLockedScopes(),
      this.lockableScopes(),
    ]);
    return { locked, pendingRequests, activeGrants, scopes, choices };
  }

  /**
   * Everything an admin could lock: the programmes, and the clans inside them.
   *
   * Sent with the overview so the picker has names without a second call, and
   * so the page cannot offer a scope this organisation does not own.
   */
  async lockableScopes() {
    const programs = await models.Program.findAll({
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
      include: [{ model: models.Clan, as: 'clans', attributes: ['id', 'name', 'kind'], required: false }],
    });
    return {
      programs: programs.map((p) => ({ id: p.id, name: p.name })),
      clans: programs.flatMap((p) => (p.clans || []).map((c) => ({
        id: c.id, name: c.name, kind: c.kind, programId: p.id, programName: p.name,
      }))).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async recentLogs({ page = 1, limit = 10 } = {}) {
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 10));
    const parsedPage = Math.max(1, Number(page) || 1);
    const { rows, count } = await models.AuditLog.findAndCountAll({
      where: { action: { [Op.like]: 'REVIEW_%' } },
      include: [{ model: models.User, as: 'user', attributes: ['firstName', 'lastName'] }],
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
    const labels = {
      REVIEW_LOCK_ENABLED: 'Enabled deletion lock',
      REVIEW_LOCK_DISABLED: 'Disabled deletion lock',
      REVIEW_UNLOCK_REQUESTED: 'Requested unlock',
      REVIEW_UNLOCK_GRANTED: 'Granted unlock',
      REVIEW_UNLOCK_DECLINED: 'Declined unlock',
      REVIEW_UNLOCK_REVOKED: 'Revoked grant',
      REVIEW_SESSION_DELETED: 'Deleted review session',
    };
    const logs = rows.map((r) => ({
      action: r.action,
      userName: r.user ? `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() : 'System',
      detail: labels[r.action] || r.action,
      createdAt: r.createdAt,
    }));
    return { logs, total: count, page: parsedPage, limit: parsedLimit };
  }
}

module.exports = new CohortReviewLockService();
