const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const platformAudit = require('./platformAuditService');

/**
 * Buyer leads: the marketing site's "talk to us" enquiries, stored where the
 * operator who can actually provision a workspace will see them. The public
 * intake accepts exactly the shape pathment-marketing/lib/buyer-lead.ts
 * validates, so the marketing API route can forward its payload unchanged.
 */
class PlatformLeadService {
  /**
   * Public intake. The marketing form carries a honeypot (`website`) and a
   * render timestamp (`startedAt`); a filled honeypot or an instant submit is
   * accepted-and-dropped rather than rejected, so a bot learns nothing.
   */
  async createPublic(input) {
    const email = String(input.email || '').trim().toLowerCase();
    const fullName = String(input.fullName || '').trim();
    const organizationName = String(input.organizationName || '').trim();
    if (!email || !fullName || !organizationName) throw new ValidationError('Email, name and organization are required');

    const honeypot = Boolean(String(input.website || '').trim());
    const tooFast = typeof input.startedAt === 'number' && Date.now() - input.startedAt < 2000;
    if (honeypot || tooFast) {
      /**
       * Dropped, and the caller is told it worked, because a bot that is told
       * it failed tries something else.
       *
       * Logged because the cost of that silence falls on real people: a
       * browser autofilling a hidden field called "website" makes somebody's
       * enquiry disappear behind a success screen. With no record anywhere, a
       * lost customer and a blocked bot were indistinguishable from both ends,
       * which is exactly how a form can look like it works while delivering
       * nothing. The line below is the recovery path.
       */
      console.warn('[leads] dropped as bot-like', {
        reason: honeypot ? 'honeypot' : 'submitted-too-fast',
        email, organizationName, source: input.source || 'marketing',
      });
      return { received: true };
    }

    await models.BuyerLead.create({
      email, fullName, organizationName,
      organizationSize: input.organizationSize || null,
      participants: input.participants || null,
      programType: input.programType || null,
      launchTimeframe: input.launchTimeframe || null,
      planInterest: input.planInterest || null,
      message: input.message || null,
      website: null,
      source: input.source || 'marketing',
    });
    return { received: true };
  }

  async list({ status, page = 1, limit = 25 } = {}) {
    const where = {};
    if (status) where.status = status;
    const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const current = Math.max(1, parseInt(page, 10) || 1);
    const { rows, count } = await models.BuyerLead.findAndCountAll({
      where,
      include: [{ model: models.Organization, as: 'provisionedOrganization', attributes: ['id', 'name', 'slug'], required: false, paranoid: false }],
      order: [['createdAt', 'DESC']],
      limit: size, offset: (current - 1) * size,
    });
    const counts = await models.BuyerLead.findAll({
      raw: true,
      attributes: ['status', [models.BuyerLead.sequelize.fn('COUNT', '*'), 'count']],
      group: ['status'],
    });
    return {
      leads: rows,
      countsByStatus: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])),
      total: count, page: current, pages: Math.ceil(count / size) || 1,
    };
  }

  async update(actor, id, { status, notes }) {
    const lead = await models.BuyerLead.findByPk(id);
    if (!lead) throw new NotFoundError('Lead not found');
    const oldValues = { status: lead.status };
    const patch = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (!Object.keys(patch).length) throw new ValidationError('Nothing to change');
    await lead.update(patch);
    if (status && status !== oldValues.status) {
      await platformAudit.record({
        action: 'PLATFORM_LEAD_STATUS_CHANGED', targetType: 'BuyerLead', targetId: lead.email,
        oldValues, newValues: { status }, actor,
      });
    }
    return lead;
  }
}

module.exports = new PlatformLeadService();
