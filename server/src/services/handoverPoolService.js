const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const {
  NotFoundError, ForbiddenError, ValidationError, ConflictError,
} = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const clanService = require('./clanService');
const clanLifecycleService = require('./clanLifecycleService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { createAuditLog } = require('../utils/auditContext');
const { mirrorPriorWork } = require('./standingWorkMirror');
const { PERMISSIONS: P } = require('../config/permissions');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');

// 'active' and 'paused'. A paused mentee is still in their clan, so they can
// still be handed over - being paused is often exactly why.
const VISIBLE = VISIBLE_MEMBERSHIP_STATUSES;

/**
 * handoverPoolService — mentees offered from one clan to any other.
 *
 * The only existing route between two clans is `clanService.reassignMentee`,
 * which needs one named mentor to have agreed in advance. That is the wrong
 * shape for the case this exists for: a mentor who has to hand somebody on and
 * does not know who will take them, and above all a whole clan at once when its
 * programme closes and its mentor is not continuing. Asking twenty mentors in
 * turn is not a workflow.
 *
 * So: push, then pull.
 *
 * ── A push is an offer, not a removal ──────────────────────────────────────
 *
 * Nothing about the mentee's placement changes when they are pushed. They stay
 * in their clan, with their mentor, doing their work, until somebody claims
 * them. That one decision is what makes the rest safe: no mentee is ever
 * stranded in a pool with no clan, no tasks and no mentor; withdrawing an offer
 * costs nothing because nothing has happened yet; and a push can sit for a
 * month without harming the person it is about. The entire move is inside the
 * claim, where it is one transaction.
 *
 * ── Exactly one puller wins ────────────────────────────────────────────────
 *
 * Two mentors opening the pool see the same rows, and the pool is most useful
 * at exactly the moment a cohort closes and several mentors are shopping at
 * once. The claim is therefore a single conditional UPDATE on
 * (id, status = 'open'): Postgres serialises the row, the winner gets one row
 * back, and every loser gets zero and is told plainly that somebody got there
 * first. No advisory locks, no SELECT ... FOR UPDATE, no window in which two
 * transactions both believe they own the mentee.
 *
 * The claim is taken FIRST, before any of the work it authorises. Everything
 * after it — the capacity check, the roster change, the mirror — is then
 * uncontended by construction, because only one transaction is ever past it.
 *
 * ── The work comes too ─────────────────────────────────────────────────────
 *
 * A transfer that loses somebody's history is why mentors avoid transfers. The
 * claim reuses the same mirror the standing clans use, so the new mentor
 * inherits the tasks with their statuses, submissions, feedback and day log,
 * and the old clan's record is left exactly as it was. Within one programme
 * only: across programmes the roadmaps differ and copied work would be
 * meaningless, so that case is a clean start and says so.
 */
class HandoverPoolService {
  // ── authority ─────────────────────────────────────────────────────────────

  /**
   * May this person hand mentees out of / take mentees into this clan?
   *
   * `mentee.transfer` already means "ask another clan to take a mentee, and
   * accept incoming moves" — the one-to-one version of this exact act — so the
   * pool reuses it rather than minting a permission that would have to be
   * granted everywhere before the feature worked at all.
   */
  async _mayHandOver(user, clanId) {
    const scope = await authzService.scopeOfClan(clanId);
    if (!scope) throw new NotFoundError('Clan not found');
    if (await authzService.can(user, P.MENTEE_TRANSFER, scope)) return true;
    throw new ForbiddenError('You do not have permission to hand mentees over for this clan');
  }

  /**
   * The programmes whose offers this person may see.
   *
   * Portal-aware: the same account gets a different answer in /admin and in
   * /mentor, and both are right. In /admin it is their programme scope; in
   * /mentor it is only the programmes they actually mentor a clan in.
   * Hardcoding the mentor hat showed an admin who mentors nothing an empty
   * pool; hardcoding the admin one would turn a mentor's pool into a directory
   * of the organisation's learners.
   *
   * The hat is derived from `actsAsAdmin`, which already returns false under
   * the mentor and mentee portals, rather than read straight off the request
   * context. Passing the context's own value through means passing `null`
   * wherever there is no request — a job, a test — and `programScopeFor` reads
   * a null hat as "wear every hat", which handed a plain mentor an
   * unrestricted scope. Naming one of the two is always correct.
   *
   * `null` means every programme — an unrestricted admin.
   */
  async _hat(user) {
    return (await authzService.actsAsAdmin(user)) ? 'admin' : 'mentor';
  }

  async _visibleProgramIds(user) {
    const scope = await authzService.programScopeFor(user, await this._hat(user));
    if (scope.unrestricted) return null;
    if (Array.isArray(scope.programIds) && scope.programIds.length) return scope.programIds;

    // No programme-tier scope: fall back to where they actually mentor. This is
    // the ordinary mentor's path.
    const clanIds = await authzService.mentoredClanIds(user.id);
    if (!clanIds.length) return [];
    const clans = await models.Clan.findAll({
      where: { id: { [Op.in]: clanIds } }, attributes: ['programId'], raw: true,
    });
    return [...new Set(clans.map((c) => c.programId).filter(Boolean))];
  }

  // ── push ──────────────────────────────────────────────────────────────────

  /**
   * Offer one mentee out of a clan.
   *
   * Deliberately NOT gated on `assertClanWritable`. The commonest reason to
   * push is that the programme has closed and the clan is frozen — refusing
   * the push there would block the feature in the exact case it was built for.
   * Freezing protects the clan's RECORD, and a push writes nothing to it.
   */
  async push(user, { menteeId, clanId, reason = null, handoverNote = null }) {
    if (!menteeId || !clanId) throw new ValidationError('menteeId and clanId are required');
    await this._mayHandOver(user, clanId);

    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId', 'name', 'kind'] });
    if (!clan) throw new NotFoundError('Clan not found');

    const membership = await models.ClanMembership.findOne({
      where: { clanId, userId: menteeId, role: 'mentee', status: { [Op.in]: VISIBLE } },
    });
    if (!membership) throw new NotFoundError('That mentee is not in this clan');

    if (reason && !models.HandoverPoolEntry.REASONS.includes(reason)) {
      throw new ValidationError(`reason must be one of: ${models.HandoverPoolEntry.REASONS.join(', ')}`);
    }

    /*
     * A second push of the same mentee is the same offer, not a new one — two
     * co-mentors of one clan both reaching for it is normal. Return the live
     * row and let them update the note, rather than failing on the partial
     * unique index and showing an error for something that is already true.
     */
    const open = await models.HandoverPoolEntry.findOne({
      where: { menteeId, programId: clan.programId, status: 'open' },
    });
    if (open) {
      if (handoverNote && handoverNote !== open.handoverNote) await open.update({ handoverNote });
      return { entry: this._shape(open), alreadyOpen: true };
    }

    const entry = await models.HandoverPoolEntry.create({
      menteeId,
      fromClanId: clanId,
      programId: clan.programId,
      pushedBy: user.id,
      reason: reason || null,
      handoverNote: handoverNote || null,
      status: 'open',
    });

    await createAuditLog({
      userId: user.id, action: 'HANDOVER_PUSHED', entityType: 'HandoverPoolEntry', entityId: entry.id,
      newValues: { menteeId, fromClanId: clanId, programId: clan.programId, reason },
    }).catch(() => {});

    await this._notifyPushed(entry, clan).catch(() => {});
    return { entry: this._shape(entry), alreadyOpen: false };
  }

  /**
   * Offer a whole clan at once — the closing-cohort case.
   *
   * Per-mentee failures are collected rather than thrown: one mentee already in
   * the pool from another clan must not stop the other nineteen being offered.
   */
  async pushClan(user, { clanId, reason = 'program_closed', handoverNote = null }) {
    await this._mayHandOver(user, clanId);
    const members = await models.ClanMembership.findAll({
      where: { clanId, role: 'mentee', status: { [Op.in]: VISIBLE } },
      attributes: ['userId'], raw: true,
    });
    if (!members.length) throw new ValidationError('This clan has no mentees to hand over');

    const pushed = [];
    const skipped = [];
    for (const { userId: menteeId } of members) {
      try {
        const { entry, alreadyOpen } = await this.push(user, { menteeId, clanId, reason, handoverNote });
        (alreadyOpen ? skipped : pushed).push(entry.id);
      } catch (error) {
        skipped.push({ menteeId, error: error.message });
      }
    }
    return { pushed: pushed.length, skipped: skipped.length, total: members.length };
  }

  // ── withdraw ──────────────────────────────────────────────────────────────

  /** Take an offer back. Only ever possible while it is still open. */
  async withdraw(user, entryId) {
    const entry = await models.HandoverPoolEntry.findByPk(entryId);
    if (!entry) throw new NotFoundError('Pool entry not found');
    if (entry.status !== 'open') {
      throw new ConflictError(entry.status === 'claimed'
        ? 'That mentee has already been taken into another clan'
        : 'That offer was already withdrawn');
    }
    const isAdmin = await authzService.actsAsAdmin(user);
    if (!isAdmin && entry.pushedBy !== user.id) await this._mayHandOver(user, entry.fromClanId);

    await entry.update({ status: 'withdrawn', withdrawnBy: user.id, withdrawnAt: new Date() });
    await createAuditLog({
      userId: user.id, action: 'HANDOVER_WITHDRAWN', entityType: 'HandoverPoolEntry', entityId: entry.id,
      newValues: { menteeId: entry.menteeId },
    }).catch(() => {});
    return this._shape(entry);
  }

  // ── claim ─────────────────────────────────────────────────────────────────

  /**
   * Take a mentee out of the pool and into one of your clans, with their work.
   *
   * Order matters here and is the whole correctness argument:
   *
   *  1. check authority and the target clan BEFORE the claim, so a mentor who
   *     was never going to be allowed does not burn somebody else's offer;
   *  2. CLAIM the row with a conditional UPDATE — this is the one and only
   *     serialisation point, and from here on this transaction is alone;
   *  3. do the move inside one transaction, re-reading the target's roster
   *     under a row lock so two claims into the same clan cannot both fit
   *     through its last free place;
   *  4. roll the claim back with everything else if any of it fails, which
   *     returns the offer to the pool rather than losing the mentee.
   */
  async claim(user, { entryId, toClanId }) {
    if (!entryId || !toClanId) throw new ValidationError('entryId and toClanId are required');
    await this._mayHandOver(user, toClanId);

    const entry = await models.HandoverPoolEntry.findByPk(entryId);
    if (!entry) throw new NotFoundError('Pool entry not found');
    if (entry.status !== 'open') throw new ConflictError('Somebody else has already taken that mentee');

    const toClan = await models.Clan.findByPk(toClanId, { attributes: ['id', 'programId', 'name', 'kind', 'maxMentees'] });
    if (!toClan) throw new NotFoundError('Target clan not found');
    if (toClan.id === entry.fromClanId) throw new ValidationError('That mentee is already in this clan');
    /*
     * A standing clan is never offered by `claimableClans`, and refusing it
     * here rather than trusting that is the difference between an error and a
     * silent loss: a standing clan carries no programme, so `sameProgram`
     * would come out false and the mentee would arrive with none of the work
     * this whole feature exists to bring with them. Standing clans have their
     * own route for taking people on.
     */
    if (toClan.kind === 'standing') {
      throw new ValidationError('Add mentees to a standing clan from the standing clan itself, not the pool');
    }
    // The target has to be somewhere work can actually happen.
    await clanLifecycleService.assertClanWritable(toClanId);

    const alreadyHere = await models.ClanMembership.findOne({
      where: { clanId: toClanId, userId: entry.menteeId, role: 'mentee', status: { [Op.in]: VISIBLE } },
    });
    if (alreadyHere) throw new ConflictError('That mentee is already in this clan');

    const sameProgram = !!toClan.programId && toClan.programId === entry.programId;
    let carried = { tasks: 0, submissions: 0, feedback: 0, progress: 0 };

    await sequelize.transaction(async (transaction) => {
      /*
       * The claim. One UPDATE, guarded on the status we read above, so the
       * winner is decided by the database rather than by who checked first.
       * Zero rows means another mentor got here between our read and this
       * write — the exact race this whole design is shaped around.
       */
      const [claimed] = await models.HandoverPoolEntry.update(
        { status: 'claimed', claimedBy: user.id, claimedClanId: toClanId, claimedAt: new Date() },
        { where: { id: entryId, status: 'open' }, transaction },
      );
      // The count, not the rows: Sequelize only returns rows on Postgres when
      // asked, and all this needs to know is whether it was one or none.
      if (claimed !== 1) throw new ConflictError('Somebody else has already taken that mentee');

      /*
       * Capacity, under a lock on the clan row. Checking it before the claim
       * would let two claims into one free place; checking it here means the
       * second waits for the first and then sees the true count.
       */
      if (toClan.maxMentees) {
        await models.Clan.findByPk(toClanId, { lock: transaction.LOCK.UPDATE, transaction, attributes: ['id'] });
        const seated = await models.ClanMembership.count({
          where: { clanId: toClanId, role: 'mentee', status: { [Op.in]: VISIBLE } }, transaction,
        });
        if (seated >= toClan.maxMentees) {
          throw new ConflictError(`${toClan.name || 'That clan'} is full (${seated}/${toClan.maxMentees}). Raise its limit or pick another clan.`);
        }
      }

      // Out of the old clan. Their work stays on it, untouched — the mirror
      // copies rather than moves, so the old programme's record still reads
      // the way the certificates issued on it say it does.
      if (entry.fromClanId) {
        await models.ClanMembership.update(
          { status: 'removed', leftAt: new Date() },
          { where: { clanId: entry.fromClanId, userId: entry.menteeId, role: 'mentee', status: { [Op.in]: VISIBLE } }, transaction },
        );
      }

      // Into the new one. No actor passed: authority was settled above against
      // the pool's own permission, and addMember would re-check a different one.
      await clanService.addMember(toClanId, { userId: entry.menteeId, role: 'mentee' }, null, { transaction });

      if (sameProgram) {
        /*
         * The copies have to hang off the TARGET's enrolment, which addMember
         * has just created or reactivated. A cohort task with no enrolment is
         * one taskService would refuse to create, it is missing from every
         * enrolment-filtered read, and the enrolment is where the task stats
         * live — so a mirror that left it NULL (correct for a standing clan,
         * which has no enrolment) would hand the new mentor work that half the
         * product cannot see.
         */
        const seat = await models.ClanMembership.findOne({
          where: { clanId: toClanId, userId: entry.menteeId, role: 'mentee' },
          attributes: ['enrollmentId'], transaction,
        });
        carried = await mirrorPriorWork(sequelize, {
          clanId: toClanId, menteeId: entry.menteeId, enrollmentId: seat?.enrollmentId || null, transaction,
        });
      }

      await models.HandoverPoolEntry.update({ carried }, { where: { id: entryId }, transaction });
    });

    await createAuditLog({
      userId: user.id, action: 'HANDOVER_CLAIMED', entityType: 'HandoverPoolEntry', entityId: entryId,
      newValues: { menteeId: entry.menteeId, fromClanId: entry.fromClanId, toClanId, carried, sameProgram },
    }).catch(() => {});

    await this._notifyClaimed(entry, toClan, user).catch(() => {});

    const fresh = await models.HandoverPoolEntry.findByPk(entryId);
    return { entry: this._shape(fresh), carried, freshStart: !sameProgram };
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * The pool, as a mentor or admin sees it.
   *
   * Each row carries enough for the decision it exists to support: who they
   * are, how far they got, who is handing them over and why, how long the
   * offer has been sitting, and what would come across with them.
   */
  async list(user, { programId = null, status = 'open', limit = 100 } = {}) {
    const visible = await this._visibleProgramIds(user);
    if (visible && !visible.length) return { entries: [], programIds: [] };

    const where = { status };
    if (visible) where.programId = { [Op.in]: visible };
    if (programId) {
      if (visible && !visible.includes(programId)) return { entries: [], programIds: visible };
      where.programId = programId;
    }

    const rows = await models.HandoverPoolEntry.findAll({
      where,
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'] },
        { model: models.User, as: 'pusher', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.Clan, as: 'fromClan', attributes: ['id', 'name', 'kind', 'frozenAt'] },
        { model: models.Clan, as: 'claimedClan', attributes: ['id', 'name'] },
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'ASC']], // oldest first: waiting longest, needs a home most
      limit: Math.min(Number(limit) || 100, 300),
    });

    const history = await this._workSummary(rows.map((r) => r.menteeId));
    return {
      entries: rows.map((r) => ({
        ...this._shape(r),
        waitingDays: Math.max(0, Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86_400_000)),
        mentee: r.mentee ? {
          id: r.mentee.id,
          name: `${r.mentee.firstName || ''} ${r.mentee.lastName || ''}`.trim() || r.mentee.email,
          email: r.mentee.email,
          avatarUrl: r.mentee.profilePictureUrl || null,
        } : null,
        pushedByName: r.pusher ? `${r.pusher.firstName || ''} ${r.pusher.lastName || ''}`.trim() : null,
        fromClan: r.fromClan ? { id: r.fromClan.id, name: r.fromClan.name, kind: r.fromClan.kind, frozen: !!r.fromClan.frozenAt } : null,
        claimedClan: r.claimedClan ? { id: r.claimedClan.id, name: r.claimedClan.name } : null,
        program: r.program ? { id: r.program.id, name: r.program.name } : null,
        /** What a puller would inherit. The reason to take this one. */
        work: history.get(r.menteeId) || { tasks: 0, completed: 0, lastActiveAt: null },
      })),
      programIds: visible,
    };
  }

  /**
   * One cheap grouped count per mentee, instead of a metrics preload per row.
   * The pool is a shopping list: it needs "16 tasks, 11 done, last seen
   * Tuesday", not a full risk model. The detail is one click away on the
   * mentee's own page.
   */
  async _workSummary(menteeIds) {
    const out = new Map();
    if (!menteeIds.length) return out;
    const [rows] = await sequelize.query(`
      SELECT mentee_id,
             COUNT(*)::int AS tasks,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             MAX(GREATEST(COALESCE(submitted_at, 'epoch'::timestamptz),
                          COALESCE(started_at, 'epoch'::timestamptz))) AS last_active_at
        FROM assigned_tasks
       WHERE mentee_id IN (:menteeIds)
         AND pool_member_id IS NULL
         AND status <> 'cancelled'
       GROUP BY mentee_id`, { replacements: { menteeIds } });
    for (const r of rows) {
      const last = r.last_active_at && new Date(r.last_active_at).getFullYear() > 1970 ? r.last_active_at : null;
      out.set(r.mentee_id, { tasks: r.tasks, completed: r.completed, lastActiveAt: last });
    }
    return out;
  }

  /**
   * The admin read: the pool as a queue with an age, not a list.
   *
   * An offer nobody takes is the failure state of this feature — a mentee with
   * no mentor and nobody noticing — so what the admin needs on sight is the
   * oldest thing in there and how many have been sitting too long.
   */
  async overview(user, { programId = null } = {}) {
    const { entries } = await this.list(user, { programId, status: 'open', limit: 300 });
    const stale = entries.filter((e) => e.waitingDays >= 7);
    const byProgram = new Map();
    for (const e of entries) {
      const key = e.program?.id || 'none';
      const row = byProgram.get(key) || { programId: e.program?.id || null, programName: e.program?.name || 'No programme', open: 0, oldestDays: 0 };
      row.open += 1;
      row.oldestDays = Math.max(row.oldestDays, e.waitingDays);
      byProgram.set(key, row);
    }
    const [claimedRows, withdrawnRows] = await Promise.all([
      this.list(user, { programId, status: 'claimed', limit: 50 }),
      this.list(user, { programId, status: 'withdrawn', limit: 50 }),
    ]);
    return {
      open: entries.length,
      waitingTooLong: stale.length,
      oldestDays: entries.length ? Math.max(...entries.map((e) => e.waitingDays)) : 0,
      byProgram: [...byProgram.values()].sort((a, b) => b.oldestDays - a.oldestDays),
      entries,
      recentlyClaimed: claimedRows.entries,
      recentlyWithdrawn: withdrawnRows.entries,
    };
  }

  /**
   * The clans this person could pull into: open cohort clans they can write to.
   *
   * Portal-aware for the same reason as the read above. An admin in /admin may
   * place somebody into any clan in their programme scope; a mentor may only
   * place into a clan they mentor. Frozen and standing clans are excluded
   * because neither can take new cohort work.
   */
  async claimableClans(user) {
    const scope = await authzService.programScopeFor(user, await this._hat(user));
    const where = { kind: 'cohort', frozenAt: null };
    if (!scope.unrestricted) {
      /*
       * `clanIds`, not `programIds`. A scope carries both and they answer
       * different questions: the programmes are where this person may LOOK,
       * the clans are where they may ACT. A mentor's scope names their whole
       * programme because they mentor a clan inside it — bounding on that
       * offered them every other mentor's clan in the programme as somewhere
       * to place a mentee. For an admin the two agree, since their clan list
       * is derived from their programmes, so this is right under both hats.
       */
      const clanIds = Array.isArray(scope.clanIds) ? scope.clanIds : [];
      if (!clanIds.length) return [];
      where.id = { [Op.in]: clanIds };
    }
    const clans = await models.Clan.findAll({
      where, attributes: ['id', 'name', 'programId', 'maxMentees'],
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
    });
    const counts = clans.length
      ? await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clans.map((c) => c.id) }, role: 'mentee', status: { [Op.in]: VISIBLE } },
          attributes: ['clanId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
          group: ['clanId'], raw: true,
        })
      : [];
    const seated = new Map(counts.map((c) => [c.clanId, Number(c.n)]));
    return clans.map((c) => ({
      id: c.id,
      name: c.name,
      programId: c.programId,
      programName: c.program?.name || null,
      seated: seated.get(c.id) || 0,
      maxMentees: c.maxMentees || null,
      full: !!c.maxMentees && (seated.get(c.id) || 0) >= c.maxMentees,
    }));
  }

  // ── notifications ─────────────────────────────────────────────────────────

  /**
   * Tell the mentee nothing on a push, and the programme's mentors that
   * somebody needs a clan.
   *
   * Deliberately silent towards the mentee. A push may be withdrawn, and it
   * changes nothing for them until it is claimed — "your mentor has put you up
   * for transfer" is a frightening message to send about something that has not
   * happened and may not. They are told when they actually move.
   */
  async _notifyPushed(entry, clan) {
    if (!entry.programId) return;
    const clanIds = (await models.Clan.findAll({
      where: { programId: entry.programId, kind: 'cohort', frozenAt: null }, attributes: ['id'], raw: true,
    })).map((c) => c.id);
    if (!clanIds.length) return;
    const mentors = await models.ClanMembership.findAll({
      where: {
        clanId: { [Op.in]: clanIds }, status: 'active',
        role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] },
      },
      attributes: ['userId'], raw: true,
    });
    const recipients = [...new Set(mentors.map((m) => m.userId))].filter((id) => id !== entry.pushedBy);
    if (!recipients.length) return;

    const mentee = await models.User.findByPk(entry.menteeId, { attributes: ['firstName', 'lastName'] });
    const who = mentee ? `${mentee.firstName || ''} ${mentee.lastName || ''}`.trim() || 'A mentee' : 'A mentee';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.HANDOVER_POOL_PUSHED,
      recipients: recipients.map((userId) => ({ userId })),
      payload: {
        title: `${who} is looking for a clan`,
        message: `${who} has been put in the handover pool from ${clan?.name || 'another clan'}. If you have room, you can take them into your clan with all of their work.`,
        actionUrl: '/mentor/pool',
        actionLabel: 'Open the pool',
        emailSubject: `${who} needs a clan`,
        // No relatedEntityId: a later push of the same person is its own notice.
      },
    });
  }

  /** On a claim, tell the mentee (it has happened now) and the old mentor. */
  async _notifyClaimed(entry, toClan, claimer) {
    const [mentee, who] = await Promise.all([
      models.User.findByPk(entry.menteeId, { attributes: ['firstName'] }),
      models.User.findByPk(claimer.id, { attributes: ['firstName', 'lastName'] }),
    ]);
    const claimerName = who ? `${who.firstName || ''} ${who.lastName || ''}`.trim() : 'A mentor';

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.HANDOVER_POOL_CLAIMED,
      recipients: [{ userId: entry.menteeId }],
      payload: {
        title: `You have moved to ${toClan.name || 'a new clan'}`,
        message: `Hi ${mentee?.firstName || 'there'}, ${claimerName} has taken you into ${toClan.name || 'their clan'}. Your tasks and everything you have finished came with you — pick up exactly where you left off.`,
        actionUrl: '/mentee/dashboard',
        actionLabel: 'Open my dashboard',
        emailSubject: `You are now in ${toClan.name || 'a new clan'}`,
      },
    });

    if (entry.pushedBy && entry.pushedBy !== claimer.id) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.HANDOVER_POOL_CLAIMED,
        recipients: [{ userId: entry.pushedBy }],
        payload: {
          title: 'Your handover was picked up',
          message: `${claimerName} has taken ${mentee?.firstName || 'your mentee'} into ${toClan.name || 'their clan'}.`,
          actionUrl: '/mentor/pool',
          actionLabel: 'View the pool',
        },
      });
    }
  }

  _shape(e) {
    return {
      id: e.id,
      menteeId: e.menteeId,
      fromClanId: e.fromClanId,
      programId: e.programId,
      pushedBy: e.pushedBy,
      reason: e.reason,
      handoverNote: e.handoverNote,
      status: e.status,
      claimedBy: e.claimedBy,
      claimedClanId: e.claimedClanId,
      claimedAt: e.claimedAt,
      withdrawnAt: e.withdrawnAt,
      carried: e.carried || {},
      createdAt: e.createdAt,
    };
  }
}

module.exports = new HandoverPoolService();
