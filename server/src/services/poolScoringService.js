/**
 * poolScoringService — explainable scores, the proposed shortlist, and the
 * human decision.
 *
 * Every score is the sum of visible parts. A component takes its number from
 * reviewed work only:
 *   quiz / task_review / interview_review   the review rating of the work that
 *                                            feeds it (0–5, shown as 0–100).
 *                                            Quiz and interview reviews already
 *                                            store their percentage this way.
 *   manual                                   a score a reviewer entered by hand
 * Several pieces of work feeding one component are averaged. Work that was
 * never handed in scores 0 and is flagged; work handed in but not yet reviewed
 * stops the shortlist being confirmed — nobody is ranked on unreviewed work.
 *
 * The system PROPOSES; a person with pool.select DECIDES. A tie at the cutoff
 * is never broken silently, and any change to the proposal needs a reason.
 *
 * Shortlists are snapshots in the audit log, not a table of their own:
 *   POOL_SHORTLIST_GENERATED   { version, fingerprint, policy, quota, blockers, entries }
 *   POOL_SELECTION_CONFIRMED   { shortlistId, version, fingerprint, entries (with outcomes), overrides }
 * The fingerprint is a hash of everything the ranking was built from.
 * Generating with an unchanged fingerprint returns the existing snapshot (no
 * new version, nobody re-notified), and confirming re-checks it, so a
 * selection can never be confirmed on scores that have since moved. The
 * confirmed result itself is written onto each PoolMember (decision, score
 * components, total, rank) — the spec's auditable record.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const poolService = require('./poolService');
const poolWorkEvents = require('./poolWorkEvents');

const OUTCOMES = ['selected', 'waitlisted', 'not_selected'];
const GENERATED = 'POOL_SHORTLIST_GENERATED';
const CONFIRMED = 'POOL_SELECTION_CONFIRMED';
const round2 = (n) => Math.round(n * 100) / 100;

// Blockers that only a change to the work can clear (review it, fix the policy)
// versus one a person clears by deciding (a tie at the cutoff).
const HARD_BLOCKERS = ['policy_empty', 'component_without_work', 'reviews_outstanding'];

class PoolScoringService {
  /**
   * Score every candidate still in the running. Pure read — nothing is saved.
   * Returns rows sorted for display (highest first; ties in a stable order).
   */
  async compute(poolId) {
    const pool = await poolService.getPool(poolId);
    const policy = pool.scoringPolicy || { components: [] };
    const components = policy.components || [];
    const workItems = poolService.workItems(pool).filter((w) => !w.cancelledAt);
    const members = await models.PoolMember.findAll({
      where: { poolId, [Op.or]: [{ decision: null }, { decision: { [Op.notIn]: ['withdrawn', 'disqualified'] } }] },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const tasks = members.length ? await models.AssignedTask.scope('withPoolWork').findAll({
      where: { poolMemberId: { [Op.in]: members.map((m) => m.id) }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id', 'poolMemberId', 'roadmapTaskId', 'status'],
    }) : [];
    const feedback = tasks.length ? await models.TaskFeedback.findAll({
      where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) } },
      attributes: ['assignedTaskId', 'rating', 'isApproved', 'createdAt'],
      order: [['createdAt', 'DESC']],
    }) : [];
    const latestApproved = new Map();
    for (const f of feedback) {
      if (f.isApproved && !latestApproved.has(f.assignedTaskId)) latestApproved.set(f.assignedTaskId, f);
    }
    const taskFor = new Map(tasks.map((t) => [`${t.poolMemberId}:${t.roadmapTaskId}`, t]));

    const rows = members.map((member) => {
      let total = 0;
      let complete = true;
      const parts = components.map((c) => {
        let score = null;
        let status = 'missing';
        if (c.source === 'manual') {
          const entry = member.manualScores?.[c.key];
          if (entry && Number.isFinite(Number(entry.score))) { score = Number(entry.score); status = 'scored'; }
        } else {
          const feeding = workItems.filter((w) => w.componentKey === c.key);
          const scores = [];
          const states = [];
          for (const w of feeding) {
            const t = taskFor.get(`${member.id}:${w.roadmapTaskId}`);
            if (!t) { states.push('missing'); continue; }
            if (t.status === 'completed') {
              const f = latestApproved.get(t.id);
              const rating = f ? Number(f.rating) : NaN;
              if (Number.isFinite(rating)) { scores.push(Math.max(0, Math.min(100, rating * 20))); states.push('scored'); }
              else states.push('pending_review');
            } else if (t.status === 'submitted') states.push('pending_review');
            else if (t.status === 'revision_needed') states.push('changes_requested');
            else states.push('missing');
          }
          if (!feeding.length) status = 'no_work';
          else if (states.includes('pending_review')) status = 'pending_review';
          else if (states.every((s) => s === 'scored')) status = 'scored';
          else if (states.includes('changes_requested')) status = 'changes_requested';
          else status = 'missing';
          // Only what is final counts; unfinished pieces count as 0 (flagged).
          if (feeding.length && scores.length) score = scores.reduce((s, v) => s + v, 0) / feeding.length;
        }
        const weighted = score === null ? 0 : (score * c.weight) / 100;
        total += weighted;
        if (c.required && status !== 'scored') complete = false;
        return { key: c.key, label: c.label, weight: c.weight, source: c.source, required: c.required, max: 100, score: score === null ? null : round2(score), weighted: round2(weighted), status };
      });
      return {
        memberId: member.id,
        name: models.PoolMember.displayName(member),
        email: member.email,
        activated: Boolean(member.userId),
        decision: member.decision,
        createdAt: member.createdAt,
        components: parts,
        total: round2(total),
        complete,
      };
    });

    rows.sort((a, b) => (b.total - a.total)
      || (new Date(a.createdAt) - new Date(b.createdAt))
      || a.memberId.localeCompare(b.memberId));
    // Competition ranking: equal totals share a rank (1, 2, 2, 4).
    rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });
    return { pool, policy, workItems, rows };
  }

  /** The blockers and warnings for a computed ranking, plus proposed outcomes. */
  _propose(pool, policy, workItems, rows) {
    const quota = pool.selectionQuota;
    const waitlistSize = pool.settings?.waitlistSize ?? quota;
    const undecided = rows.filter((r) => !r.decision);
    const blockers = [];
    const warnings = [];

    if (!(policy.components || []).length) {
      blockers.push({ code: 'policy_empty', message: 'Set up the scoring components before generating a shortlist' });
    }
    for (const c of policy.components || []) {
      if (c.source !== 'manual' && !workItems.some((w) => w.componentKey === c.key)) {
        blockers.push({ code: 'component_without_work', message: `No work feeds “${c.label}” — link work to it, or change the scoring`, componentKey: c.key });
      }
    }
    const outstanding = undecided.filter((r) => r.components.some((c) => c.required && c.status === 'pending_review'));
    if (outstanding.length) {
      blockers.push({
        code: 'reviews_outstanding',
        message: `${outstanding.length} candidate${outstanding.length === 1 ? ' has' : 's have'} required work waiting for review`,
        memberIds: outstanding.map((r) => r.memberId),
      });
    }
    const missing = undecided.filter((r) => r.components.some((c) => c.required && ['missing', 'changes_requested'].includes(c.status)));
    if (missing.length) {
      warnings.push({
        code: 'missing_work',
        message: `${missing.length} candidate${missing.length === 1 ? ' is' : 's are'} missing required work; it counts as 0`,
        memberIds: missing.map((r) => r.memberId),
      });
    }
    if (pool.qualificationDueAt && new Date(pool.qualificationDueAt) > new Date()) {
      warnings.push({ code: 'deadline_not_passed', message: 'The qualification deadline has not passed yet' });
    }
    if (undecided.length < quota) {
      warnings.push({ code: 'fewer_candidates_than_quota', message: `Only ${undecided.length} candidate${undecided.length === 1 ? '' : 's'} for a quota of ${quota}` });
    }

    const proposed = new Map();
    undecided.forEach((r, i) => {
      proposed.set(r.memberId, i < quota ? 'selected' : i < quota + waitlistSize ? 'waitlisted' : 'not_selected');
    });
    if (undecided.length > quota) {
      const cutoff = undecided[quota - 1].total;
      if (undecided[quota].total === cutoff) {
        const tied = undecided.filter((r) => r.total === cutoff).map((r) => r.memberId);
        blockers.push({
          code: 'tie_at_cutoff',
          message: `${tied.length} candidates are tied on ${cutoff} at the cutoff — decide each of them`,
          memberIds: tied,
          total: cutoff,
        });
      }
    }
    return { quota, waitlistSize, blockers, warnings, proposed, undecided };
  }

  /** A hash of everything the ranking is built from. Same inputs → same fingerprint. */
  _fingerprint(policy, quota, waitlistSize, undecided) {
    const payload = JSON.stringify({
      policy, quota, waitlistSize,
      rows: [...undecided].sort((a, b) => a.memberId.localeCompare(b.memberId))
        .map((r) => [r.memberId, r.total, r.components.map((c) => [c.key, c.score, c.status])]),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /** The current ranking, with what would block or warn a shortlist made from it. */
  async _current(poolId) {
    const { pool, policy, workItems, rows } = await this.compute(poolId);
    const proposal = this._propose(pool, policy, workItems, rows);
    const fingerprint = this._fingerprint(policy, proposal.quota, proposal.waitlistSize, proposal.undecided);
    return { pool, policy, rows, ...proposal, fingerprint };
  }

  /** Live scores for the Scores tab — what a shortlist generated now would contain. */
  async liveScores(poolId) {
    const { policy, rows, blockers, warnings, proposed } = await this._current(poolId);
    return {
      policy,
      blockers,
      warnings,
      rows: rows.map((r) => ({ ...r, proposedOutcome: proposed.get(r.memberId) || null })),
    };
  }

  /** Every shortlist version, with its status read from the log. */
  async _versions(poolId) {
    const logs = await poolService.snapshots(poolId, [GENERATED, CONFIRMED]);
    const generated = logs.filter((l) => l.action === GENERATED);
    const confirmation = logs.find((l) => l.action === CONFIRMED) || null;
    const latestId = generated.length ? generated[generated.length - 1].id : null;
    return {
      confirmation,
      versions: generated.map((g) => {
        const v = g.newValues || {};
        const confirmed = confirmation && confirmation.newValues?.shortlistId === g.id;
        const status = confirmed ? 'confirmed'
          : (g.id === latestId && !confirmation) ? ((v.blockers || []).some((b) => b.severity === 'block') ? 'blocked' : 'draft')
            : 'superseded';
        return {
          id: g.id,
          version: v.version,
          status,
          quota: v.quota,
          blockers: v.blockers || [],
          fingerprint: v.fingerprint,
          createdAt: g.createdAt,
          confirmedAt: confirmed ? confirmation.createdAt : null,
          log: g,
        };
      }),
    };
  }

  async listShortlists(poolId) {
    const { versions } = await this._versions(poolId);
    return versions.reverse().map(({ log, ...v }) => v);
  }

  /** One version, with each candidate's components, rank and outcome. */
  async getShortlist(poolId, shortlistId) {
    const { versions, confirmation } = await this._versions(poolId);
    const found = versions.find((v) => v.id === shortlistId);
    if (!found) throw new NotFoundError('Shortlist not found');
    const { log, ...meta } = found;
    const entries = log.newValues?.entries || [];
    const finals = meta.status === 'confirmed'
      ? new Map((confirmation.newValues?.entries || []).map((e) => [e.poolMemberId, e]))
      : new Map();
    const members = entries.length ? await models.PoolMember.findAll({
      where: { id: { [Op.in]: entries.map((e) => e.poolMemberId) } },
      attributes: ['id', 'email', 'userId', 'decision', 'details'],
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    }) : [];
    const memberById = new Map(members.map((m) => [m.id, m]));
    return {
      ...meta,
      entries: entries.map((e) => {
        const m = memberById.get(e.poolMemberId);
        const final = finals.get(e.poolMemberId);
        return {
          ...e,
          id: e.poolMemberId,
          finalOutcome: final?.finalOutcome || null,
          overrideReason: final?.overrideReason || null,
          member: m ? {
            id: m.id, email: m.email, decision: m.decision,
            firstName: m.details?.firstName || null, lastName: m.details?.lastName || null,
            user: m.user ? { firstName: m.user.firstName, lastName: m.user.lastName } : null,
          } : null,
        };
      }),
    };
  }

  /**
   * Generate the proposed shortlist. Idempotent: if nothing that feeds it has
   * changed since the latest version, that version is returned and nobody is
   * notified again.
   */
  async generate(poolId, actor) {
    if (await poolService.isSelectionConfirmed(poolId)) {
      throw new ValidationError('A shortlist is already confirmed. Change individual decisions instead.');
    }
    const { pool, policy, rows, quota, waitlistSize, blockers, warnings, proposed, undecided, fingerprint } = await this._current(poolId);
    const { versions } = await this._versions(poolId);
    const latest = versions[versions.length - 1];
    if (latest && latest.fingerprint === fingerprint) {
      return { shortlist: await this.getShortlist(poolId, latest.id), reused: true };
    }
    const version = versions.length + 1;
    const ranked = new Map(rows.map((r) => [r.memberId, r]));
    const log = await poolService.snapshot(pool.id, actor.id, GENERATED, {
      version,
      fingerprint,
      policy: { ...policy, waitlistSize },
      quota,
      blockers: [...blockers.map((b) => ({ ...b, severity: 'block' })), ...warnings.map((w) => ({ ...w, severity: 'warn' }))],
      entries: undecided.map((r) => ({
        poolMemberId: r.memberId,
        rank: ranked.get(r.memberId).rank,
        totalScore: r.total,
        complete: r.complete,
        components: r.components,
        proposedOutcome: proposed.get(r.memberId),
      })),
    });
    await this._notifyOperators(pool, {
      title: blockers.length ? `${pool.name}: shortlist v${version} needs a decision` : `${pool.name}: shortlist v${version} is ready`,
      message: blockers.length ? blockers.map((b) => b.message).join(' · ') : `Top ${quota} proposed. Review and confirm the selection.`,
      relatedEntityId: log.id,
      dedupeType: 'pool_shortlist',
      exclude: actor.id,
    });
    return { shortlist: await this.getShortlist(poolId, log.id), reused: false };
  }

  /**
   * A person confirms the selection. `overrides` change a proposed outcome —
   * each needs a reason, and every candidate tied at the cutoff must be
   * decided explicitly. The scores are re-checked first: if anything moved
   * since this version was generated, it must be generated again.
   */
  async confirm(poolId, shortlistId, { overrides = [] } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'confirm a selection');
    const shortlist = await this.getShortlist(poolId, shortlistId);
    if (shortlist.status === 'confirmed') throw new ValidationError('This shortlist is already confirmed');
    if (shortlist.status === 'superseded') throw new ValidationError('A newer shortlist exists — confirm that one');

    const hard = (shortlist.blockers || []).filter((b) => b.severity === 'block' && HARD_BLOCKERS.includes(b.code));
    if (hard.length) throw new ValidationError(`Resolve these first, then generate the shortlist again: ${hard.map((b) => b.message).join('; ')}`);

    const current = await this._current(poolId);
    if (current.fingerprint !== shortlist.fingerprint) {
      throw new ValidationError('Scores or candidates changed since this shortlist was generated — generate it again');
    }

    const byMember = new Map();
    for (const o of Array.isArray(overrides) ? overrides : []) {
      if (!o?.memberId) continue;
      if (!OUTCOMES.includes(o.outcome)) throw new ValidationError(`Unknown outcome "${o.outcome}"`);
      byMember.set(o.memberId, { outcome: o.outcome, reason: String(o.reason || '').trim() });
    }
    const entryByMember = new Map(shortlist.entries.map((e) => [e.poolMemberId, e]));
    for (const memberId of byMember.keys()) {
      if (!entryByMember.has(memberId)) throw new ValidationError('An override names a candidate who is not on this shortlist');
    }
    const tie = (shortlist.blockers || []).find((b) => b.code === 'tie_at_cutoff');
    if (tie) {
      const undecidedTie = tie.memberIds.filter((id) => !byMember.has(id) || !byMember.get(id).reason);
      if (undecidedTie.length) {
        throw new ValidationError(`Decide every candidate tied at the cutoff, with a reason (${undecidedTie.length} still to decide)`);
      }
    }
    for (const [memberId, o] of byMember) {
      if (o.outcome !== entryByMember.get(memberId).proposedOutcome && !o.reason) {
        throw new ValidationError('Every change to the proposed outcome needs a reason');
      }
    }

    const now = new Date();
    const outcomes = { selected: [], waitlisted: [], not_selected: [] };
    const finalEntries = [];
    await sequelize.transaction(async (transaction) => {
      for (const entry of shortlist.entries) {
        const o = byMember.get(entry.poolMemberId);
        const finalOutcome = o ? o.outcome : entry.proposedOutcome;
        const reason = o?.reason || null;
        outcomes[finalOutcome].push(entry.poolMemberId);
        finalEntries.push({ poolMemberId: entry.poolMemberId, rank: entry.rank, totalScore: entry.totalScore, proposedOutcome: entry.proposedOutcome, finalOutcome, overrideReason: reason });
        const [n] = await models.PoolMember.update({
          decision: finalOutcome,
          decisionReason: reason || `Confirmed from shortlist v${shortlist.version}`,
          decidedById: actor.id,
          decidedAt: now,
          scoreComponents: entry.components,
          totalScore: entry.totalScore,
          rank: entry.rank,
          placement: finalOutcome === 'selected' ? { status: 'pending' } : {},
        }, { where: { id: entry.poolMemberId, decision: null }, transaction });
        if (!n) throw new ValidationError('Someone was decided while this was being confirmed — generate the shortlist again');
      }
    });

    await poolService.snapshot(pool.id, actor.id, CONFIRMED, {
      shortlistId: shortlist.id,
      version: shortlist.version,
      fingerprint: shortlist.fingerprint,
      selected: outcomes.selected.length,
      waitlisted: outcomes.waitlisted.length,
      notSelected: outcomes.not_selected.length,
      overrides: [...byMember.entries()].map(([memberId, o]) => ({ memberId, outcome: o.outcome, reason: o.reason })),
      entries: finalEntries,
    });
    await this._notifyOutcomes(pool, outcomes);
    return this.getShortlist(poolId, shortlist.id);
  }

  /**
   * Change one candidate's decision after confirmation — promote someone from
   * the waitlist, or take a selected person out before placement. Always with
   * a reason, always audited. A placed candidate is managed from their clan.
   */
  async setDecision(poolId, memberId, { decision, reason }, actor) {
    if (!OUTCOMES.includes(decision)) throw new ValidationError('Choose selected, waitlisted or not selected');
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError('Give a reason for changing this decision');
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'change decisions');
    if (!(await poolService.isSelectionConfirmed(poolId))) {
      throw new ValidationError('Confirm a shortlist first — decisions come from it');
    }
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
    if (!member) throw new NotFoundError('Candidate not found in this pool');
    if (['withdrawn', 'disqualified'].includes(member.decision)) throw new ValidationError(`This candidate was ${member.decision}`);
    if (member.placedAt) throw new ValidationError('This candidate is already placed in a clan');
    if (member.decision === decision) return member;
    const before = { decision: member.decision, decisionReason: member.decisionReason };
    await member.update({
      decision, decisionReason: text.slice(0, 2000), decidedById: actor.id, decidedAt: new Date(),
      placement: decision === 'selected' ? { status: 'pending', targetClanId: member.placement?.targetClanId || null } : {},
    });
    await poolService.audit(pool.id, actor.id, 'POOL_DECISION_CHANGED', { memberId, decision, reason: text }, before);
    await this._notifyOutcomes(pool, { [decision]: [member.id] }, { changed: true });
    return member;
  }

  async _notifyOutcomes(pool, outcomes, { changed = false } = {}) {
    const orchestrator = require('./notificationOrchestrator');
    const words = {
      selected: { title: `You have been selected: ${pool.name}`, message: 'Congratulations — you were selected. You will be placed in a clan shortly.' },
      waitlisted: { title: `You are on the waitlist: ${pool.name}`, message: 'You were placed on the waitlist. We will let you know if a place opens up.' },
      not_selected: { title: `${pool.name}: the outcome`, message: 'Thank you for taking part. You were not selected in this round.' },
    };
    for (const [outcome, memberIds] of Object.entries(outcomes)) {
      if (!memberIds?.length) continue;
      const members = await models.PoolMember.findAll({ where: { id: { [Op.in]: memberIds }, userId: { [Op.ne]: null } }, attributes: ['id', 'userId'] });
      for (const m of members) {
        // Dedupe also matches the stored (relatedEntityType, relatedEntityId),
        // so the first outcome is keyed on the member (sent once, ever) and a
        // later CHANGE gets a key of its own — each change is a new message.
        const entity = changed
          ? { relatedEntityType: 'pool_decision_change', relatedEntityId: crypto.randomUUID() }
          : { relatedEntityType: 'pool_outcome', relatedEntityId: m.id };
        await orchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.POOL_OUTCOME,
          recipients: [{ userId: m.userId }],
          payload: {
            ...words[outcome],
            actionUrl: '/candidate',
            actionLabel: 'See outcome',
            ...entity,
            emailSubject: words[outcome].title,
          },
          dedupe: entity,
        }).catch((e) => console.error('[pool] outcome notification failed:', e.message));
      }
    }
  }

  /** Tell the pool's operators (pool.select holders + creator) something needs them. */
  async _notifyOperators(pool, { title, message, relatedEntityId, dedupeType, exclude = null, tab = 'shortlist' }) {
    try {
      const recipients = (await poolWorkEvents.holdersOf(pool, P.POOL_SELECT)).filter((id) => id !== exclude);
      if (!recipients.length) return;
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_ATTENTION,
        recipients: recipients.map((userId) => ({ userId })),
        payload: {
          title, message,
          actionUrl: poolWorkEvents.poolUrl(pool.id, tab),
          actionLabel: 'Open pool',
          relatedEntityType: dedupeType,
          relatedEntityId,
        },
        dedupe: { relatedEntityType: dedupeType, relatedEntityId },
      });
    } catch (error) {
      console.error('[pool] operator notification failed:', error.message);
    }
  }
}

module.exports = new PoolScoringService();
module.exports.HARD_BLOCKERS = HARD_BLOCKERS;
