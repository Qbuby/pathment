const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');

const AUDIENCE_TYPES = ['all', 'mentors', 'mentees', 'program', 'clan'];
/** Clan roles that mean "I mentor this clan" — mirrors the client's picker. */
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

/**
 * Enrolment statuses that mean this person's run of the programme is over, so
 * the window on its announcements closes. 'program_completed' is in here: an
 * alumnus keeps what they could already read and stops receiving what is
 * posted after they finished.
 */
const ENDED_ENROLMENT_STATUSES = ['rejected', 'dropped', 'program_completed'];

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

  /**
   * Clans + programmes the viewer belongs to, and WHEN they joined each.
   *
   * The dates are the point of this. Visibility used to be pure set membership
   * - "are you in programme X right now?" - so somebody who enrolled this
   * morning opened Announcements onto eight months of another cohort's
   * logistics, "Demo Day is complete, well done everyone" included. The same
   * query had no status filter at all, so a mentee who dropped out kept
   * receiving new posts for ever.
   *
   * A programme's anchor is the EARLIEST moment this person was connected to
   * it. A clan reads on its programme's anchor, never on the clan join date: a
   * mentee moved into a standing clan gets a fresh clan_memberships row, so
   * anchoring on the clan would hide months of their own clan's history on the
   * day an admin approves the move.
   */
  async _scope(user, portalRole = null) {
    const caps = await this._caps(user);
    const roles = this._membershipRolesFor(portalRole);
    const memberships = await models.ClanMembership.findAll({
      // A PAUSED member still belongs to the clan - the whole point of a pause
      // is that somebody brings them back - so they keep reading its posts.
      where: {
        userId: user.id,
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        ...(roles ? { role: { [Op.in]: roles } } : {}),
      },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'programId'] }]
    });

    const programFrom = new Map();
    const programTo = new Map();
    const clanFrom = new Map();
    const clanJoinedAt = new Map();
    const programIds = new Set();
    // Which clans, kept separate from WHEN they joined each. A membership row
    // with no join date on record still puts them in the clan - folding the
    // two together dropped those clans out of the result entirely.
    const clanIds = new Set();
    const earliest = (map, key, at) => {
      if (!key || !at) return;
      const when = new Date(at);
      const prev = map.get(key);
      if (!prev || when < prev) map.set(key, when);
    };

    for (const m of memberships) {
      if (m.clanId) clanIds.add(m.clanId);
      earliest(clanJoinedAt, m.clanId, m.joinedAt || m.createdAt);
      if (m.clan?.programId) {
        programIds.add(m.clan.programId);
        earliest(programFrom, m.clan.programId, m.joinedAt || m.createdAt);
      }
    }

    if (caps.includes('mentee') && portalRole !== 'mentor') {
      const enrollments = await models.Enrollment.findAll({
        where: { menteeId: user.id },
        attributes: ['programId', 'status', 'enrolledAt', 'completedAt', 'droppedAt', 'createdAt', 'updatedAt']
      });
      const byProgram = new Map();
      for (const e of enrollments) {
        if (!e.programId) continue;
        if (!byProgram.has(e.programId)) byProgram.set(e.programId, []);
        byProgram.get(e.programId).push(e);
      }
      for (const [programId, rows] of byProgram) {
        programIds.add(programId);
        rows.forEach((r) => earliest(programFrom, programId, r.enrolledAt || r.createdAt));
        /**
         * A ceiling, and only when EVERY enrolment in the programme has ended.
         * One live enrolment means they are current, whatever the older rows
         * say: somebody who dropped a cohort and joined the next one is not an
         * alumnus.
         *
         * Their CLAN posts are deliberately unaffected. A standing clan is
         * where alumni live, and membership of it is a live relationship that
         * has nothing to do with an enrolment's status.
         */
        if (!rows.some((r) => !ENDED_ENROLMENT_STATUSES.includes(r.status))) {
          const ends = rows
            .map((r) => r.droppedAt || r.completedAt || r.updatedAt)
            .filter(Boolean)
            .map((d) => new Date(d).getTime());
          if (ends.length) programTo.set(programId, new Date(Math.max(...ends)));
        }
      }
    }

    if (caps.includes('mentor') && portalRole !== 'mentee') {
      const matches = await models.MentorMenteeMatch.findAll({
        where: { mentorId: user.id, status: 'active' },
        include: [{ model: models.Enrollment, as: 'enrollment', attributes: ['programId'] }]
      });
      matches.forEach((m) => {
        const programId = m.enrollment?.programId;
        if (!programId) return;
        programIds.add(programId);
        earliest(programFrom, programId, m.createdAt);
      });
    }

    for (const m of memberships) {
      const viaProgram = m.clan?.programId ? programFrom.get(m.clan.programId) : null;
      clanFrom.set(m.clanId, viaProgram || clanJoinedAt.get(m.clanId) || null);
    }

    return {
      caps,
      clanIds: [...clanIds],
      programIds: [...programIds],
      programFrom,
      programTo,
      clanFrom,
      orgFrom: await this._orgJoinedAt(user),
    };
  }

  /**
   * When this person joined the workspace: the floor for the org-wide
   * audiences. An announcement to "Everyone" from last March is no more
   * relevant to somebody who signed up in October than a programme one is.
   *
   * Null when neither date is on record, which leaves the org-wide audiences
   * unbounded - the behaviour before any of this, and the safe way to fail.
   */
  async _orgJoinedAt(user) {
    const membership = await models.OrganizationMembership.findOne({
      where: { userId: user.id },
      attributes: ['joinedAt']
    });
    const at = membership?.joinedAt || user.createdAt || null;
    return at ? new Date(at) : null;
  }

  /**
   * One audience branch, bounded to the viewer's own window on that audience.
   *
   * `pinned` escapes the floor, and that is the whole design. The pin already
   * exists, already sorts first and already means "this outlives the moment",
   * so it is what carries the handbook posts - code of conduct, how to submit
   * work, office hours are on Thursdays - to everybody who joins later, while
   * the perishable ones stay with the cohort they were written for. No new
   * field, no new column, and nothing new for an admin to learn.
   *
   * The ceiling is not escapable: somebody whose run of the programme has ended
   * should not receive what was posted afterwards, pinned or not.
   */
  _within(match, from, to) {
    const and = [];
    if (from) and.push({ [Op.or]: [{ pinned: true }, { createdAt: { [Op.gte]: from } }] });
    if (to) and.push({ createdAt: { [Op.lte]: to } });
    if (!and.length) return match;
    return { ...match, [Op.and]: and };
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
   * Every non-admin branch is also bounded in TIME, by the viewer's own join
   * date for that audience - see `_scope` and `_within`. Membership alone was
   * the wrong question: it handed a mentee who enrolled this morning every
   * announcement the programme has ever had.
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
      const scope = await authzService.programScopeFor(user, 'admin');
      if (scope.unrestricted) return undefined;
      /**
       * No join-date window for an admin, on purpose. A mentee reads
       * announcements to know what is happening; an admin reads them to know
       * what their programme's people have been told, and that is a record,
       * which means all of it.
       */
      return {
        [Op.or]: [
          { authorId: user.id },
          { audience: { [Op.in]: ['all', 'mentors', 'mentees'] } },
          { audience: 'program', audienceId: { [Op.in]: scope.programIds } },
          { audience: 'clan', audienceId: { [Op.in]: scope.clanIds } },
        ],
      };
    }

    const { caps, clanIds, programIds, programFrom, programTo, clanFrom, orgFrom } =
      await this._scope(user, portalRole);

    // A clan selected in the sidebar narrows the clan-targeted announcements to
    // that clan. It can only ever subtract: a clan they are not in cannot widen
    // this, because the intersection with their own memberships is empty.
    const visibleClanIds = clanId ? clanIds.filter((id) => id === clanId) : clanIds;

    // One branch per audience this person can see, each carrying its own
    // window, rather than one list of audiences with no sense of time.
    const or = [{ authorId: user.id }]; // you always see your own, whenever it was
    or.push(this._within({ audience: 'all' }, orgFrom, null));
    if (caps.includes('mentor') && portalRole !== 'mentee') {
      or.push(this._within({ audience: 'mentors' }, orgFrom, null));
    }
    if (caps.includes('mentee') && portalRole !== 'mentor') {
      or.push(this._within({ audience: 'mentees' }, orgFrom, null));
    }
    for (const programId of programIds) {
      or.push(this._within(
        { audience: 'program', audienceId: programId },
        programFrom.get(programId) || null,
        programTo.get(programId) || null
      ));
    }
    for (const id of visibleClanIds) {
      or.push(this._within({ audience: 'clan', audienceId: id }, clanFrom.get(id) || null, null));
    }

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
