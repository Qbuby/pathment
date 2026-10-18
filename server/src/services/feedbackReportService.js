const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { runWithRequestContext } = require('../utils/auditContext');

/** Cross-workspace reads for the platform console. */
const SKIP = { skipOrganizationScope: true };

/**
 * Which lane a report belongs to, decided from what it is ABOUT.
 *
 * Derived here and never read from the request: a client that could name its
 * own lane could route a product bug into a workspace inbox, or the reverse.
 */
const LANE_BY_TYPE = { bug: 'product', suggestion: 'product', other: 'workspace' };
const VALID_LANES = ['product', 'workspace'];

/**
 * Statuses only the platform may set, because only the platform can make them
 * true. A workspace admin triaging their own lane can open, review and decline;
 * "planned", "fixed" and "added" are statements about the software.
 */
const PLATFORM_ONLY_STATUSES = ['planned', 'fixed', 'added'];

const STATUS_LABELS = {
  open: 'Open', in_review: 'In review', planned: 'Planned',
  fixed: 'Fixed', added: 'Added', declined: 'Declined',
};
const VALID_STATUSES = Object.keys(STATUS_LABELS);
const TYPE_LABELS = { bug: 'Bug', suggestion: 'Suggestion', other: 'Feedback' };

const PLATFORM_LABELS = { web: 'Web', android: 'Android', ios: 'iPhone' };
const VALID_PLATFORMS = Object.keys(PLATFORM_LABELS);

/**
 * Where a report came from, believing the client only as far as the whitelist.
 *
 * A client that says nothing gets sniffed rather than defaulted, because an
 * older web build will never send this and guessing 'web' for a phone would be
 * worse than guessing nothing: it would file mobile bugs in the web pile and
 * nobody would notice for weeks.
 */
function resolvePlatform(claimed, userAgent) {
  const said = String(claimed || '').trim().toLowerCase();
  if (VALID_PLATFORMS.includes(said)) return said;

  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}

/**
 * feedbackReportService - in-app feedback / bug reports. Anyone submits (with an
 * optional screenshot/clip + auto-captured page context); admins triage through
 * a status and reply; the reporter is notified on every change.
 */
class FeedbackReportService {
  _name(u) { return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Someone' : 'Someone'; }

  /** Active workspace admins (who triage), for the "new report" ping. */
  async _adminRecipientIds() {
    const admins = await require('./workspaceRecipients').admins();
    return admins.map((a) => a.id);
  }

  _shape(r) {
    return {
      id: r.id,
      type: r.type, typeLabel: TYPE_LABELS[r.type] || r.type,
      lane: r.lane || 'product',
      // Only populated by the platform inbox, which spans workspaces and has
      // to say which one each report came from.
      organization: r.organization
        ? { id: r.organization.id, name: r.organization.name, slug: r.organization.slug }
        : null,
      handledBy: r.handledBy || null,
      title: r.title, description: r.description,
      status: r.status, statusLabel: STATUS_LABELS[r.status] || r.status,
      priority: r.priority,
      platform: r.platform, platformLabel: PLATFORM_LABELS[r.platform] || r.platform,
      appVersion: r.appVersion, device: r.device,
      pageUrl: r.pageUrl, userAgent: r.userAgent,
      attachmentUrl: r.attachmentUrl, attachmentType: r.attachmentType, attachmentName: r.attachmentName,
      resolutionNote: r.resolutionNote,
      reporter: r.reporter ? { id: r.reporter.id, name: this._name(r.reporter), email: r.reporter.email, role: r.reporterRole } : null,
      handledAt: r.handledAt,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  // ── create (any authenticated user) ───────────────────────────────────────
  async create(reporter, data = {}) {
    const title = String(data.title || '').trim().slice(0, 200);
    if (!title) throw new ValidationError('A short title is required');
    const type = ['bug', 'suggestion', 'other'].includes(data.type) ? data.type : 'bug';
    const lane = LANE_BY_TYPE[type] || 'product';

    const report = await models.FeedbackReport.create({
      reporterId: reporter.id,
      reporterRole: reporter.role || null,
      type,
      lane,
      title,
      description: data.description ? String(data.description).slice(0, 5000) : null,
      status: 'open',
      priority: 'normal',
      platform: resolvePlatform(data.platform, data.userAgent),
      appVersion: data.appVersion ? String(data.appVersion).trim().slice(0, 32) : null,
      device: data.device ? String(data.device).trim().slice(0, 120) : null,
      // On the phone this is the route the person was on, not a URL. Same
      // question either way: where were you when it happened.
      pageUrl: data.pageUrl ? String(data.pageUrl).slice(0, 500) : null,
      userAgent: data.userAgent ? String(data.userAgent).slice(0, 500) : null,
      attachmentUrl: data.attachmentUrl || null,
      attachmentType: data.attachmentType || null,
      attachmentName: data.attachmentName || null,
    });

    // Tell whoever can actually act on it. Both are non-fatal: a report that
    // was filed is filed, whatever happened to the ping.
    try {
      if (lane === 'workspace') await this._notifyWorkspaceAdmins(reporter, report);
      else await this._notifyPlatformAdmins(reporter, report);
    } catch (e) {
      console.error('[feedback] notify failed (non-fatal):', e.message);
    }

    return this._shape(report);
  }

  /**
   * A workspace-lane report: the workspace's own admins, in-app, as before.
   */
  async _notifyWorkspaceAdmins(reporter, report) {
    const adminIds = await this._adminRecipientIds();
    if (!adminIds.length) return;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.FEEDBACK_SUBMITTED,
      recipients: adminIds.map((userId) => ({ userId })),
      payload: {
        title: `New ${TYPE_LABELS[report.type].toLowerCase()}: ${report.title}`,
        message: `${this._name(reporter)} asked for help with their programme. Open the feedback board to review.`,
        actionUrl: '/admin/feedback',
        actionLabel: 'Open feedback',
      },
    });
  }

  /**
   * A product-lane report: the people who run Pathment, by EMAIL.
   *
   * Not in-app, and that is a limitation rather than a preference. A
   * Notification row is workspace-owned, and `dispatch` filters its recipients
   * down to active members of the workspace in context - so a platform admin
   * who is not a member of the reporting workspace would be dropped from the
   * list, silently, which is most of them most of the time. Email is the
   * channel that crosses workspaces, and an operator alert is the kind of thing
   * email is for.
   *
   * Idempotent per (report, admin), so a retried submit cannot mail twice.
   */
  async _notifyPlatformAdmins(reporter, report) {
    if (!models.PlatformAdmin) return;
    const grants = await models.PlatformAdmin.findAll({
      ...SKIP,
      where: { revokedAt: null },
      attributes: ['userId'],
    });
    const ids = [...new Set(grants.map((g) => g.userId).filter(Boolean))];
    if (!ids.length) return;

    const admins = await models.User.findAll({
      ...SKIP,
      where: { id: { [Op.in]: ids }, status: 'active' },
      attributes: ['id', 'email', 'firstName'],
    });
    if (!admins.length) return;

    const organization = report.organizationId && models.Organization
      ? await models.Organization.findByPk(report.organizationId, { ...SKIP, attributes: ['name'], paranoid: false })
      : null;
    const where = [
      organization?.name,
      PLATFORM_LABELS[report.platform] || report.platform,
      report.appVersion && `v${report.appVersion}`,
    ].filter(Boolean).join(' · ');

    const emailService = require('./emailService');
    // Spread rather than filtered: a blank entry here is a paragraph break, and
    // filtering the empty strings out to drop the absent fields took the breaks
    // with them and left one wall of text.
    const lines = [
      `${this._name(reporter)} (${reporter.email || 'no email'}) filed a ${TYPE_LABELS[report.type].toLowerCase()}.`,
      '',
      report.title,
      ...(report.description ? ['', report.description] : []),
      '',
      ...(where ? [where] : []),
      ...(report.pageUrl ? [`Where: ${report.pageUrl}`] : []),
      ...(report.device ? [`Device: ${report.device}`] : []),
      '',
      'Triage it in the platform console under Product > Feedback.',
    ];

    await Promise.all(admins.map((admin) => emailService.enqueue({
      to: admin.email,
      recipientId: admin.id,
      subject: `[${TYPE_LABELS[report.type]}] ${report.title}`,
      text: lines.join('\n'),
      emailType: 'system',
      idempotencyKey: `feedback-product:${report.id}:${admin.id}`,
      priority: 4,
    })));
  }

  // ── reporter's own reports ────────────────────────────────────────────────
  async listMine(userId) {
    const rows = await models.FeedbackReport.findAll({
      where: { reporterId: userId },
      order: [['created_at', 'DESC']],
    });
    return rows.map((r) => this._shape(r));
  }

  // ── admin triage list ─────────────────────────────────────────────────────
  async listAll({ status, type, platform, lane, page = 1, limit = 25 } = {}) {
    const where = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (type && ['bug', 'suggestion', 'other'].includes(type)) where.type = type;
    // A workspace admin still SEES both lanes - what their own people filed is
    // theirs to read, and the status the platform set on a product report is
    // the answer to "did anybody do anything about this?". What changes is that
    // they can no longer pretend to resolve one. Visibility is not ownership.
    if (lane && VALID_LANES.includes(lane)) where.lane = lane;
    // Triage happens per platform more often than per anything else: a crash on
    // Android is one person's morning and a web layout bug is another's.
    if (platform && VALID_PLATFORMS.includes(platform)) where.platform = platform;
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const parsedPage = Math.max(1, Number(page) || 1);
    const { rows, count } = await models.FeedbackReport.findAndCountAll({
      where,
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
    // Open/unresolved counts for the header chips.
    const openCount = await models.FeedbackReport.count({ where: { status: { [Op.in]: ['open', 'in_review'] } } });
    // Counted per platform so the board can say how the pile splits before
    // anybody filters it.
    const byPlatform = {};
    for (const name of VALID_PLATFORMS) {
      byPlatform[name] = await models.FeedbackReport.count({
        where: { platform: name, status: { [Op.in]: ['open', 'in_review'] } },
      });
    }

    return {
      reports: rows.map((r) => this._shape(r)),
      total: count, page: parsedPage, limit: parsedLimit, openCount, byPlatform,
    };
  }

  // ── admin: update status / reply ──────────────────────────────────────────
  async updateStatus(adminUser, id, { status, resolutionNote, priority } = {}, { scope = 'workspace' } = {}) {
    const report = await models.FeedbackReport.findByPk(id, {
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      ...(scope === 'platform' ? SKIP : {}),
    });
    if (!report) throw new NotFoundError('Feedback report not found');

    /**
     * A workspace admin owns their own lane and reads the other one.
     *
     * Refused here rather than hidden in the UI, because the UI is not the
     * boundary: the PATCH is as reachable as any other request.
     */
    if (scope !== 'platform' && (report.lane || 'product') === 'product') {
      throw new AuthorizationError(
        'This is a Pathment bug report — the Pathment team owns it. You can read it and its status here.'
      );
    }
    if (scope !== 'platform' && status && PLATFORM_ONLY_STATUSES.includes(status)) {
      throw new AuthorizationError(`Only the Pathment team can mark something "${STATUS_LABELS[status]}"`);
    }

    const prevStatus = report.status;
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) throw new ValidationError('Invalid status');
      report.status = status;
    }
    if (priority !== undefined && ['low', 'normal', 'high'].includes(priority)) report.priority = priority;
    if (resolutionNote !== undefined) report.resolutionNote = resolutionNote ? String(resolutionNote).slice(0, 5000) : null;
    report.handledBy = adminUser.id;
    report.handledAt = new Date();
    await report.save();

    // Notify the reporter when the status actually changed (in-app + email).
    const statusChanged = status !== undefined && status !== prevStatus;
    if (statusChanged && report.reporter) {
      try {
        const label = STATUS_LABELS[report.status];
        const note = report.resolutionNote ? ` — "${report.resolutionNote}"` : '';
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.FEEDBACK_STATUS_UPDATED,
          recipients: [{ userId: report.reporterId }],
          payload: {
            title: `Your feedback is now: ${label}`,
            message: `"${report.title}" was updated to ${label}${note}. Thanks for helping us improve Pathment.`,
            emailSubject: `Update on your feedback: ${label}`,
            // No relatedEntityId so each status change notifies (not deduped).
          },
        });
      } catch (e) {
        console.error('[feedback] reporter notify failed (non-fatal):', e.message);
      }
    }

    return this._shape(report);
  }

  // ── the platform inbox (every workspace at once) ──────────────────────────

  /**
   * Product feedback from every workspace, which is the whole point.
   *
   * Until now a bug report was only visible from inside the workspace that
   * filed it, so seeing it required logging into that workspace's admin area
   * and happening to look. With one customer that is merely awkward; with
   * twenty it is a guarantee of losing reports.
   *
   * `skipOrganizationScope` is the sanctioned crossing (see routes/platform.js)
   * and this is behind requirePlatform, which reads platform_admins only - no
   * workspace role can reach it.
   */
  async platformList({ status, type, platform, lane = 'product', organizationId, page = 1, limit = 25 } = {}) {
    const where = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (type && ['bug', 'suggestion', 'other'].includes(type)) where.type = type;
    if (platform && VALID_PLATFORMS.includes(platform)) where.platform = platform;
    // 'all' is a deliberate choice, not the default: a workspace-lane report is
    // somebody's question about their mentor, and reading it is support work.
    if (lane !== 'all' && VALID_LANES.includes(lane)) where.lane = lane;
    if (organizationId) where.organizationId = organizationId;

    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const parsedPage = Math.max(1, Number(page) || 1);

    const { rows, count } = await models.FeedbackReport.findAndCountAll({
      ...SKIP,
      where,
      include: [
        { model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'email'] },
        ...(models.Organization
          ? [{ model: models.Organization, as: 'organization', attributes: ['id', 'name', 'slug'], required: false, paranoid: false }]
          : []),
      ],
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });

    const unresolved = { status: { [Op.in]: ['open', 'in_review'] } };
    const [openCount, byStatus, byPlatform] = await Promise.all([
      models.FeedbackReport.count({ ...SKIP, where: { ...unresolved, lane: 'product' } }),
      this._countsBy('status', VALID_STATUSES, { lane: 'product' }),
      this._countsBy('platform', VALID_PLATFORMS, { ...unresolved, lane: 'product' }),
    ]);

    return {
      reports: rows.map((r) => this._shape(r)),
      total: count,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.max(1, Math.ceil(count / parsedLimit)),
      openCount,
      byStatus,
      byPlatform,
    };
  }

  /** One grouped count per value, across every workspace. */
  async _countsBy(column, values, extra = {}) {
    const rows = await models.FeedbackReport.findAll({
      ...SKIP,
      where: extra,
      attributes: [column, [models.FeedbackReport.sequelize.fn('COUNT', models.FeedbackReport.sequelize.col('id')), 'n']],
      group: [column],
      raw: true,
    });
    const counts = Object.fromEntries(values.map((value) => [value, 0]));
    for (const row of rows) counts[row[column]] = Number(row.n) || 0;
    return counts;
  }

  /**
   * Set a status from the platform console.
   *
   * Entered in the REPORT'S workspace context on purpose. The reporter has to
   * be told, the notification row that tells them is workspace-owned, and a
   * tenant-owned insert with no tenant in context is a NOT NULL violation
   * rather than a global row. Crossing into the workspace to write is the same
   * boundary platformOrganizationService.inOrganization draws.
   */
  async platformUpdateStatus(user, id, patch = {}) {
    const report = await models.FeedbackReport.findByPk(id, {
      ...SKIP,
      attributes: ['id', 'organizationId', 'status', 'lane'],
    });
    if (!report) throw new NotFoundError('Feedback report not found');

    const organization = report.organizationId && models.Organization
      ? await models.Organization.findByPk(report.organizationId, { ...SKIP, attributes: ['id', 'slug'], paranoid: false })
      : null;

    const apply = () => this.updateStatus(user, id, patch, { scope: 'platform' });
    const updated = organization
      ? await runWithRequestContext(
        { organizationId: organization.id, organizationSlug: organization.slug, userId: user.id },
        apply,
      )
      : await apply();

    try {
      await require('./platformAuditService').record({
        action: 'feedback.status_set',
        targetType: 'feedback_report',
        targetId: id,
        organizationId: report.organizationId || null,
        oldValues: { status: report.status },
        newValues: { status: updated.status, priority: updated.priority },
        reason: patch.resolutionNote || null,
        actor: user,
      });
    } catch (e) {
      console.error('[feedback] platform audit failed (non-fatal):', e.message);
    }

    return updated;
  }
}

module.exports = new FeedbackReportService();
