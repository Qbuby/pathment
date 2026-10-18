const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');

const AUDIENCE_TYPES = ['all', 'mentors', 'mentees', 'program', 'clan'];
/** Clan roles that mean "I mentor this clan" — mirrors the client's picker. */
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

/**
 * Announcements with audience targeting + per-viewer visibility.
 *  - Admin can target: all | mentors | mentees | program:<id> | clan:<id>
 *  - Mentor can target: clan:<id> for a clan they lead (reaches the clan's mentees + co-mentors)
 * A viewer sees an announcement when it's 'all', a role they hold, or a
 * program/clan they belong to (admins see everything for oversight).
 */
class AnnouncementService {
  /**
   * What this person can actually do, derived now.
   *
   * This read `user.capabilities` and fell back to `user.role` — both legacy,
   * and `authzService.getAssignments` says so in as many words: elevated access
   * comes from RoleAssignments and memberships, "NOT the stored `capabilities`
   * array, which is legacy and no longer authoritative".
   *
   * The cost was real. A workspace owner whose account signed up as a mentor
   * resolved to ['mentor'], so composing an announcement took the mentor branch
   * and was refused with "Mentors can only announce to a clan they lead" — on
   * their own workspace, from the admin portal, with the audience picker in
   * front of them offering All mentors.
   *
   * `getCapabilities` adds 'admin' through `hasAdminAccess`, which reads the
   * org membership and the role assignments, so it covers both a base-role
   * admin and a workspace owner or admin of any account type.
   */
  async _caps(user) {
    if (!user) return [];
    return authzService.getCapabilities(user);
  }

  /**
   * The roles that count while the caller is wearing a particular hat.
   *
   * Somebody can be an admin, a mentor of two clans and a mentee of a third.
   * In the mentor portal only the mentor memberships are part of the question;
   * in the mentee portal only the mentee ones. Without this, switching the tab
   * changed nothing about what came back.
   */
  _membershipRolesFor(portalRole) {
    if (portalRole === 'mentee') return ['mentee'];
    if (portalRole === 'mentor') return MENTOR_CLAN_ROLES;
    return null; // no portal stated: every membership counts, as before
  }

  /** Clans + programs the viewer belongs to (for visibility filtering). */
  async _scope(user, portalRole = null) {
    const caps = await this._caps(user);
    const roles = this._membershipRolesFor(portalRole);
    const memberships = await models.ClanMembership.findAll({
      where: { userId: user.id, status: 'active', ...(roles ? { role: { [Op.in]: roles } } : {}) },
      include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
    });
    const clanIds = memberships.map((m) => m.clanId);
    const programIds = new Set(memberships.map((m) => m.clan?.programId).filter(Boolean));

    if (caps.includes('mentee') && portalRole !== 'mentor') {
      const enrollments = await models.Enrollment.findAll({ where: { menteeId: user.id }, attributes: ['programId'] });
      enrollments.forEach((e) => programIds.add(e.programId));
    }
    if (caps.includes('mentor') && portalRole !== 'mentee') {
      const matches = await models.MentorMenteeMatch.findAll({
        where: { mentorId: user.id, status: 'active' },
        include: [{ model: models.Enrollment, as: 'enrollment', attributes: ['programId'] }]
      });
      matches.forEach((m) => m.enrollment?.programId && programIds.add(m.enrollment.programId));
    }
    return { caps, clanIds, programIds: [...programIds] };
  }

  /**
   * Translate the audience rules into a WHERE clause.
   *
   * This used to be a JS `.filter()` over every announcement in the org, which
   * meant each request loaded the whole table — plus each row's author and its
   * full reactions array — to then discard most of it. Expressed as SQL, the
   * database returns only what this person may see, and LIMIT actually limits.
   *
   * Returns undefined in the ADMIN portal, where everything is visible for
   * oversight.
   *
   * It used to return undefined for anyone who merely *held* admin, whatever
   * screen they were on. A mentor who also administers the workspace therefore
   * opened their own announcements page and got every clan in the organisation
   * — switching to the mentor or mentee tab changed nothing, because the tab
   * was never part of the query. `actsAsAdmin` is the portal-aware form of the
   * same question and already exists for exactly this: it answers false while
   * the caller is in the mentor or mentee portal, so the hat they are wearing
   * decides the scope while their abilities stay intact.
   */
  async _visibilityWhere(user, { portalRole = null, clanId = null } = {}) {
    if (await authzService.actsAsAdmin(user)) {
      /**
       * An admin saw everything, full stop — `undefined` is no WHERE clause.
       * That is right for an org-tier admin and wrong for a programme one:
       * somebody granted a single fellowship was shown every clan broadcast
       * in the workspace, other programmes' mentors and clans named in them.
       *
       * Org-wide posts stay visible deliberately. "Everyone", "all mentors"
       * and "all mentees" reached this programme's people too, so hiding
       * them would misreport what their own members have been told.
       */
      const scope = await authzService.adminProgramScope(user);
      if (!Array.isArray(scope)) return undefined;
      const clansInScope = scope.length
        ? await models.Clan.findAll({ where: { programId: { [Op.in]: scope } }, attributes: ['id'], raw: true })
        : [];
      return {
        [Op.or]: [
          { authorId: user.id },
          { audience: { [Op.in]: ['all', 'mentors', 'mentees'] } },
          { audience: 'program', audienceId: { [Op.in]: scope } },
          { audience: 'clan', audienceId: { [Op.in]: clansInScope.map((c) => c.id) } },
        ],
      };
    }

    const caps = await this._caps(user);
    const { clanIds, programIds } = await this._scope(user, portalRole);

    // A clan selected in the sidebar narrows the clan-targeted announcements to
    // that clan. It can only ever subtract: a clan they are not in cannot widen
    // this, because the intersection with their own memberships is empty.
    const visibleClanIds = clanId ? clanIds.filter((id) => id === clanId) : clanIds;

    const or = [
      { authorId: user.id },      // you always see your own
      { audience: 'all' }
    ];
    if (caps.includes('mentor') && portalRole !== 'mentee') or.push({ audience: 'mentors' });
    if (caps.includes('mentee') && portalRole !== 'mentor') or.push({ audience: 'mentees' });
    if (programIds.length) or.push({ audience: 'program', audienceId: { [Op.in]: programIds } });
    if (visibleClanIds.length) or.push({ audience: 'clan', audienceId: { [Op.in]: visibleClanIds } });

    return { [Op.or]: or };
  }

  /**
   * @param {Object} user
   * @param {Object} [options]
   * @param {number} [options.limit=30]  capped at 100
   * @param {number} [options.offset=0]
   * @param {'admin'|'mentor'|'mentee'|null} [options.portalRole]  which hat the caller is wearing
   * @param {string|null} [options.clanId]  the sidebar clan selection, when one is made
   */
  async list(user, { limit = 30, offset = 0, portalRole = null, clanId = null } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = await this._visibilityWhere(user, { portalRole, clanId });

    const { rows: visible, count: totalItems } = await models.Announcement.findAndCountAll({
      where,
      include: [
        { model: models.User, as: 'author', attributes: ['firstName', 'lastName', 'role', 'profilePictureUrl'] },
        { model: models.AnnouncementReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ],
      order: [['pinned', 'DESC'], ['created_at', 'DESC']],
      limit: safeLimit,
      offset: safeOffset,
      // `reactions` is a hasMany, so the join multiplies rows: without distinct,
      // COUNT returns reaction rows rather than announcements. Sequelize also
      // needs its default subQuery behaviour here so LIMIT applies to
      // announcements — forcing subQuery:false would cut a page off mid-way
      // through one announcement's reactions.
      distinct: true
    });

    // Resolve names for program/clan audience labels.
    const progIds = [...new Set(visible.filter((a) => a.audience === 'program').map((a) => a.audienceId).filter(Boolean))];
    const clanIdsLbl = [...new Set(visible.filter((a) => a.audience === 'clan').map((a) => a.audienceId).filter(Boolean))];
    const [programs, clans] = await Promise.all([
      progIds.length ? models.Program.findAll({ where: { id: progIds }, attributes: ['id', 'name'] }) : [],
      clanIdsLbl.length ? models.Clan.findAll({ where: { id: clanIdsLbl }, attributes: ['id', 'name'] }) : []
    ]);
    const progName = Object.fromEntries(programs.map((p) => [p.id, p.name]));
    const clanName = Object.fromEntries(clans.map((c) => [c.id, c.name]));
    const label = (a) => {
      switch (a.audience) {
        case 'all': return 'Everyone';
        case 'mentors': return 'All mentors';
        case 'mentees': return 'All mentees';
        case 'program': return progName[a.audienceId] || 'Program';
        case 'clan': return clanName[a.audienceId] || 'Clan';
        default: return a.audience;
      }
    };

    const announcements = visible.map((a) => {
      const reactions = a.reactions || [];
      const count = (t) => reactions.filter((r) => r.type === t).length;
      const mine = reactions.filter((r) => r.userId === user.id).map((r) => r.type);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        audienceId: a.audienceId,
        audienceLabel: label(a),
        pinned: a.pinned,
        at: a.createdAt,
        author: a.author ? {
          name: `${a.author.firstName} ${a.author.lastName}`.trim(),
          role: a.author.role,
          avatarUrl: a.author.profilePictureUrl || null,
        } : null,
        mine: a.authorId === user.id,
        reactions: { acknowledged: count('acknowledged'), helpful: count('helpful') },
        myReactions: mine
      };
    });

    return {
      items: announcements,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        totalItems,
        hasMore: safeOffset + announcements.length < totalItems
      }
    };
  }

  /** Clans a mentor leads (for the mentor compose dropdown). */
  async ledClans(userId) {
    const memberships = await models.ClanMembership.findAll({
      where: { userId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }]
    });
    return memberships.filter((m) => m.clan).map((m) => ({ id: m.clanId, name: m.clan.name }));
  }

  async create({ title, body, audience, audienceId }, author) {
    if (!title || !title.trim() || !body || !body.trim()) throw new ValidationError('title and body are required');
    if (!AUDIENCE_TYPES.includes(audience)) throw new ValidationError('Invalid audience');
    const caps = await this._caps(author);

    if (caps.includes('admin')) {
      if ((audience === 'program' || audience === 'clan') && !audienceId) {
        throw new ValidationError(`A ${audience} must be selected`);
      }
    } else if (caps.includes('mentor')) {
      // Mentors may only announce to a clan they lead.
      if (audience !== 'clan' || !audienceId) throw new ForbiddenError('Mentors can only announce to a clan they lead');
      const leads = await this.ledClans(author.id);
      if (!leads.some((c) => c.id === audienceId)) throw new ForbiddenError('You do not lead that clan');
    } else {
      throw new ForbiddenError('You cannot post announcements');
    }

    return models.Announcement.create({
      title: title.trim(),
      body: body.trim(),
      audience,
      audienceId: (audience === 'program' || audience === 'clan') ? audienceId : null,
      pinned: false,
      authorId: author.id
    });
  }

  async _assertCanManage(id, user) {
    const a = await models.Announcement.findByPk(id);
    if (!a) throw new NotFoundError('Announcement not found');
    const caps = await this._caps(user);
    if (!caps.includes('admin') && a.authorId !== user.id) {
      throw new ForbiddenError('You can only manage your own announcements');
    }
    return a;
  }

  async togglePin(id, user) {
    const a = await this._assertCanManage(id, user);
    a.pinned = !a.pinned;
    await a.save();
    return a;
  }

  async toggleReaction(id, userId, type) {
    if (!['acknowledged', 'helpful'].includes(type)) throw new ValidationError('Invalid reaction type');
    const existing = await models.AnnouncementReaction.findOne({ where: { announcementId: id, userId, type } });
    if (existing) { await existing.destroy(); return { reacted: false }; }
    await models.AnnouncementReaction.create({ announcementId: id, userId, type });
    return { reacted: true };
  }

  async remove(id, user) {
    const a = await this._assertCanManage(id, user);
    await models.AnnouncementReaction.destroy({ where: { announcementId: id } });
    await a.destroy();
    return { removed: true };
  }
}

module.exports = new AnnouncementService();
