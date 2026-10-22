const { Op } = require('sequelize');
const { models } = require('../db');
const { ROLES, roleGrants } = require('../config/roles');
const { ALL_PERMISSIONS, PERMISSIONS: P } = require('../config/permissions');
const { AuthorizationError } = require('../utils/errors/errorTypes');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');
const { getRequestContext } = require('../utils/auditContext');

// Permissions that mean "this person mentors someone" - holding any of these at
// a clan/program scope grants the mentor switch (drives getCapabilities).
const MENTOR_PERMISSIONS = [P.MENTEE_VIEW, P.MENTEE_MANAGE, P.TASK_ASSIGN, P.TASK_REVIEW];

// The System Pool permissions. Holding any of them at org/program scope opens
// the Selection pools area — and only that; they are not mentoring powers, so
// they never switch on the mentor portal either.
const POOL_PERMISSIONS = [P.POOL_MANAGE, P.POOL_MEMBERS, P.POOL_ASSIGN, P.POOL_REVIEW, P.POOL_SELECT];


// In-memory cache of admin-defined custom roles (key → { permissions[], scope }).
// Invalidated by accessService whenever a custom role changes.
const _customRoles = new Map();
async function loadCustomRoles() {
  const organizationId = getRequestContext().organizationId || 'global';
  if (_customRoles.has(organizationId)) return _customRoles.get(organizationId);
  const rows = await models.CustomRole.findAll({ attributes: ['key', 'permissions', 'scopeLevel'] });
  const roles = {};
  for (const r of rows) roles[r.key] = { permissions: r.permissions || [], scope: r.scopeLevel };
  _customRoles.set(organizationId, roles);
  return roles;
}
function invalidateCustomRoles() { _customRoles.clear(); }

// Built-in roles that constitute "admin area" access (org/program tier - NOT
// clan roles like lead_mentor). Used by hasAdminAccess().
const ADMIN_TIER_ROLES = new Set(['super_admin', 'program_admin', 'intake_manager', 'people_admin', 'moderator', 'analyst']);

// Scope hierarchy for "minimum scope" checks (org is broadest).
const SCOPE_RANK = { org: 3, program: 2, clan: 1, self: 0 };

// The three hats somebody can be wearing, which decide what a scoped read
// returns (see programScopeFor).
const PORTAL_HATS = ['admin', 'mentor', 'mentee'];

// Enrolment statuses that mean the connection to the programme is over, so it
// no longer puts the person inside that programme's scope. Mirrors the same
// list in getCapabilities, which decides whether somebody is a mentee at all.
//
// 'program_completed' is deliberately NOT here. An alumnus is still OF that
// programme and still belongs to its standing clan, so it stays in their
// scope. announcementService closes a narrower window on completion — it
// stops them receiving NEW posts — and that is a different question from
// whether the programme is theirs.
const DEAD_ENROLMENT_STATUSES = ['rejected', 'dropped'];

const roleExists = (key, custom) => Boolean(ROLES[key] || (custom && custom[key]));
const grants = (key, perm, custom) => {
  if (ROLES[key]) return roleGrants(key, perm);
  if (custom && custom[key]) return custom[key].permissions.includes(perm);
  return false;
};
// Same as grants(), but honours per-assignment exceptions (a co-mentor whose
// lead un-checked specific permissions). `assignment.deny` is the list of
// permissions revoked for THIS grant only.
const assignmentGrants = (assignment, perm, custom) =>
  grants(assignment.role, perm, custom) && !(assignment.deny && assignment.deny.includes(perm));

/**
 * Scoped RBAC engine. A user holds roles at scopes; a permission check asks:
 * "does any held role grant permission P at a scope that COVERS this resource?"
 *
 * Assignments come from two places, unioned:
 *   1. DERIVED (no setup needed) - capabilities, clan memberships, cross-clan.
 *   2. EXPLICIT - rows in role_assignments (admin-granted scoped roles).
 *
 * A `resource` descriptor names the ids that locate it in the hierarchy:
 *   { orgWide?, programId?, clanId?, userId? }
 * Scope coverage: org covers everything; program covers its programId; clan
 * covers its clanId; self covers the matching userId. Default deny.
 */
class AuthzService {
  /** All (role, scope) a user holds - derived + explicit, de-duplicated. */
  async getAssignments(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const organizationId = getRequestContext().organizationId || null;
    let organizationMembership = null;
    let tenantClanIds = null;
    let legacyAccountRole = !organizationId;
    if (organizationId) {
      organizationMembership = await models.OrganizationMembership.findOne({
        where: { organizationId, userId: user.id, status: 'active' }, attributes: ['role'],
        include: [{ model: models.Organization, as: 'organization', attributes: ['slug'] }],
      });
      if (!organizationMembership) return [];
      legacyAccountRole = organizationMembership.organization?.slug ===
        (process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
      const clans = await models.Clan.findAll({
        attributes: ['id'],
        include: [{ model: models.Program, as: 'program', attributes: [], where: { organizationId } }],
      });
      tenantClanIds = clans.map((clan) => clan.id);
    }

    // Per-co-mentor permission exceptions, keyed by clan and INDEPENDENT of how
    // the person became a co-mentor (team membership / cross-clan cover / IAM
    // grant). Loaded once, then applied to every co_mentor@clan assignment below.
    const denyByClan = new Map();
    if (models.ClanMemberPermission) {
      const overrideRows = await models.ClanMemberPermission.findAll({
        where: { userId: user.id }, attributes: ['clanId', 'denied']
      });
      for (const r of overrideRows) {
        if (Array.isArray(r.denied) && r.denied.length) denyByClan.set(r.clanId, r.denied);
      }
    }

    const assignments = [];
    const seen = new Set();
    const add = (role, scopeType, scopeId = null) => {
      if (!roleExists(role, custom)) return;
      const key = `${role}:${scopeType}:${scopeId || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      // A co-mentor's clan-scoped permissions can be individually revoked.
      const deny = (role === 'co_mentor' && scopeType === 'clan') ? (denyByClan.get(scopeId) || null) : null;
      assignments.push({ role, scopeType, scopeId, deny });
    };

    // 1a. Base account type → its home assignment. Elevated / cross-role access
    // comes from explicit RoleAssignments + clan memberships below — NOT the
    // stored `capabilities` array, which is legacy and no longer authoritative
    // (a mentee promoted to admin gets a super_admin RoleAssignment, not a cap).
    // Workspace administration belongs to the membership, not the account's
    // original role. The same global identity may own one workspace and be a
    // mentee in another. Outside a tenant context retain the legacy admin
    // assignment for maintenance scripts.
    if ((!organizationId && user.role === 'admin') || ['owner', 'admin'].includes(organizationMembership?.role)) {
      add('super_admin', 'org');
    }
    if ((legacyAccountRole && user.role === 'mentee' && !(await this.isPoolCandidateOnly(user))) || (organizationId &&
        await models.MenteeProfile.findOne({ where: { userId: user.id }, attributes: ['id'] }))) {
      add('mentee', 'self', user.id);
    }

    // 1b. Clan memberships → clan-scoped roles (lead_mentor / co_mentor / core_team / mentee).
    const memberships = await models.ClanMembership.findAll({
      where: { userId: user.id, status: 'active', ...(tenantClanIds ? { clanId: { [Op.in]: tenantClanIds } } : {}) },
      attributes: ['clanId', 'role']
    });
    for (const m of memberships) {
      add(m.role, 'clan', m.clanId);
      if (m.role === 'mentee') add('mentee', 'self', user.id);
    }

    // 1c. Cross-clan assignments → co-mentor access to another clan.
    //     Consent-first: only ACCEPTED (active) cover grants access; pending/declined
    //     requests grant nothing until the person accepts.
    if (models.CrossClanAssignment) {
      const cross = await models.CrossClanAssignment.findAll({
        where: { userId: user.id, status: 'active', ...(tenantClanIds ? { toClanId: { [Op.in]: tenantClanIds } } : {}) },
        attributes: ['toClanId']
      });
      for (const c of cross) if (c.toClanId) add('co_mentor', 'clan', c.toClanId);
    }

    // 2. Explicit, admin-granted scoped roles.
    const explicit = await models.RoleAssignment.findAll({
      where: { userId: user.id },
      attributes: ['role', 'scopeType', 'scopeId']
    });
    for (const r of explicit) add(r.role, r.scopeType, r.scopeId);

    return assignments;
  }

  /** Does this assignment's scope cover the given resource descriptor? */
  _covers(assignment, resource) {
    const { scopeType, scopeId } = assignment;
    if (scopeType === 'org') return true;                       // org covers all
    if (!resource) return false;                                // scoped role needs a resource
    if (scopeType === 'program') return resource.programId === scopeId;
    if (scopeType === 'clan') return resource.clanId === scopeId;
    if (scopeType === 'self') return resource.userId === scopeId;
    return false;
  }

  /**
   * Core check. `resource` is optional for org-wide actions (e.g. user.manage),
   * which then require an org-scoped grant. Pass `opts.assignments` to reuse a
   * per-request fetch.
   */
  async can(user, permission, resource = null, opts = {}) {
    if (!user) return false;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => assignmentGrants(a, permission, custom) && this._covers(a, resource));
  }

  /** The set of permissions the user has for a resource - drives client UI. */
  async getEffectivePermissions(user, resource = null, opts = {}) {
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const granted = new Set();
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => assignmentGrants(a, perm, custom) && this._covers(a, resource))) granted.add(perm);
    }
    return [...granted];
  }

  /**
   * The union of permissions a user has at ANY scope - for client UI gating
   * (show/hide nav & buttons) where the exact resource isn't known yet. The
   * server still enforces the precise scoped check on every request.
   */
  async getPermissionUnion(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = await this.getAssignments(user);
    const granted = [];
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => assignmentGrants(a, perm, custom))) granted.push(perm);
    }
    return granted;
  }

  /**
   * Whether the user should be able to enter the admin area at all - i.e. they
   * hold an ORG- or PROGRAM-scoped elevated role (not merely a clan role like a
   * lead mentor). Drives the client's admin entry point + section guard.
   */
  async hasAdminAccess(user, opts = {}) {
    if (!user) return false;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) =>
      ['org', 'program'].includes(a.scopeType) && (ADMIN_TIER_ROLES.has(a.role) || Boolean(custom[a.role]))
    );
  }

  /**
   * Is this person acting as an admin RIGHT NOW — for the purpose of scoping
   * what data they get back?
   *
   * `hasAdminAccess` answers what somebody HOLDS, and must keep doing so: it
   * feeds the role switcher, the admin-area guard and the cached
   * `canAccessAdmin` the client stores per user. Narrowing that answer by
   * portal locks an admin out of their own admin area, because the cache is
   * keyed on the user and not the portal — the `false` fetched on a mentor
   * screen is still there when they navigate to /admin.
   *
   * So the portal narrows the SCOPE instead. Somebody who is both an admin and
   * a mentor, working in the mentor portal, gets a mentor's rows: their clans,
   * not the organisation. They keep every ability; they just stop being handed
   * everybody else's data on a screen that says "Viral Loop Clan 2026".
   *
   * That is what leaked — the mentor certificate roster listed all 28 clans and
   * 622 mentees, with 592 selected for issuing.
   */
  async actsAsAdmin(user, opts = {}) {
    const portalRole = getRequestContext().portalRole;
    if (portalRole === 'mentor' || portalRole === 'mentee') return false;
    return this.hasAdminAccess(user, opts);
  }

  /**
   * The platform "areas" a user may currently enter — the role-switcher list.
   * DERIVED from real facts on every read (never a stored array), so granting or
   * revoking a clan role / RoleAssignment / enrollment flips the switch
   * immediately and self-heals: there is no capability to leave dangling.
   *   admin  → admin account OR an org/program-tier elevated role
   *   mentor → mentor account OR any clan/program role that grants mentoring
   *            power (view/assign/review) OR cross-clan cover (co_mentor@clan)
   *   mentee → mentee account OR any active (non-dropped) enrollment
   */
  async getCapabilities(user, opts = {}) {
    if (!user) return [];
    const selectedOrganization = getRequestContext().organizationId;
    if (selectedOrganization && !(await models.OrganizationMembership.findOne({
      where: { organizationId: selectedOrganization, userId: user.id, status: 'active' }, attributes: ['id'],
    }))) return [];
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const caps = new Set();

    if (await this.hasAdminAccess(user, { assignments })) caps.add('admin');

    const mentorsSomewhere = assignments.some((a) =>
      ['clan', 'program'].includes(a.scopeType) &&
      MENTOR_PERMISSIONS.some((perm) => assignmentGrants(a, perm, custom))
    );
    const organizationId = getRequestContext().organizationId;
    const defaultOrganization = organizationId && await models.Organization.findOne({
      where: { id: organizationId, slug: process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends' },
      attributes: ['id'],
    });
    const legacyAccountRole = !organizationId || Boolean(defaultOrganization);
    if ((legacyAccountRole && user.role === 'mentor') || mentorsSomewhere ||
        (getRequestContext().organizationId && await models.MentorProfile.findOne({ where: { userId: user.id }, attributes: ['id'] }))) caps.add('mentor');

    if ((legacyAccountRole && user.role === 'mentee' && !(await this.isPoolCandidateOnly(user))) ||
        assignments.some(a => a.role === 'mentee')) {
      caps.add('mentee');
    } else {
      const enrollment = await models.Enrollment.findOne({
        where: { menteeId: user.id, status: { [Op.notIn]: ['rejected', 'dropped'] } },
        attributes: ['id']
      });
      if (enrollment) caps.add('mentee');
    }

    // A System Pool candidate: someone in a selection pool. It opens the
    // candidate area — their own qualifying work and outcome — and nothing
    // else. It is kept after placement so they can still read their outcome.
    if (models.PoolMember && await models.PoolMember.findOne({ where: { userId: user.id }, attributes: ['id'] })) {
      caps.add('candidate');
    }

    return [...caps];
  }

  /**
   * Is this account ONLY a System Pool candidate — invited into a pool, never
   * given a mentee profile?
   *
   * In the default workspace a stored `role = 'mentee'` alone used to mean
   * "mentee". A pool candidate's account is created with that role (invites
   * have no other learner role), so without this they would walk straight
   * into the mentee portal: the community lounge, org-wide announcements, the
   * directory. They get a mentee profile — and with it the mentee portal —
   * when they are placed into a clan.
   *
   * Only reached for legacy-role mentees, and a real mentee has a profile, so
   * nobody who has the mentee portal today loses it.
   */
  async isPoolCandidateOnly(user) {
    if (!user || !models.PoolMember) return false;
    const profile = await models.MenteeProfile.findOne({ where: { userId: user.id }, attributes: ['id'] });
    if (profile) return false;
    const member = await models.PoolMember.findOne({ where: { userId: user.id }, attributes: ['id'] });
    return Boolean(member);
  }

  /**
   * May this person enter the Selection pools area? True for anyone holding a
   * `pool.*` permission at org or programme scope. Separate from
   * `hasAdminAccess` on purpose: a pool reviewer must not become an admin of
   * the programme's mentees, clans or cohorts.
   */
  async hasPoolAccess(user, opts = {}) {
    if (!user) return false;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => ['org', 'program'].includes(a.scopeType) &&
      POOL_PERMISSIONS.some((perm) => assignmentGrants(a, perm, custom)));
  }

  /**
   * The programmes whose pools this person can see: null = every programme
   * (an org-scoped holder), otherwise the programme ids they hold any pool
   * permission at.
   */
  async poolProgramScope(user, opts = {}) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const holds = (a) => POOL_PERMISSIONS.some((perm) => assignmentGrants(a, perm, custom));
    if (assignments.some((a) => a.scopeType === 'org' && holds(a))) return null;
    return [...new Set(assignments.filter((a) => a.scopeType === 'program' && a.scopeId && holds(a)).map((a) => a.scopeId))];
  }

  /**
   * Does the user hold `permission` at AT LEAST `minLevel` scope (org > program >
   * clan > self)? For org/program-level admin endpoints that a program_admin
   * should run but a clan mentor should not — e.g. mentee.manage is held by both
   * a program_admin (program) and a lead_mentor (clan); minLevel 'program' admits
   * the former and rejects the latter. Doesn't need a specific resource.
   */
  async canAtMinScope(user, permission, minLevel = 'program', opts = {}) {
    if (!user) return false;
    const min = SCOPE_RANK[minLevel] ?? 2;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => assignmentGrants(a, permission, custom) && (SCOPE_RANK[a.scopeType] ?? 0) >= min);
  }

  /**
   * Which programs does this admin's view/actions limit to?
   *   null  → unrestricted (an ORG-tier admin sees everything)
   *   [ids] → a program_admin: only these program ids
   *   []    → no admin program scope at all
   * Used to data-scope admin list endpoints + validate writes, so a program_admin
   * sees/touches only their program's invites/cohorts/enrollments/clans.
   */
  async adminProgramScope(user, opts = {}) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const isAdminRole = (role) => ADMIN_TIER_ROLES.has(role) || Boolean(custom[role]);
    // Any org-tier admin role → unrestricted.
    if (assignments.some((a) => a.scopeType === 'org' && isAdminRole(a.role))) return null;
    const ids = assignments
      .filter((a) => a.scopeType === 'program' && a.scopeId && isAdminRole(a.role))
      .map((a) => a.scopeId);
    return [...new Set(ids)];
  }

  /** Throw unless `programId` is within the admin's program scope (org = any). */
  async assertProgramInScope(user, programId, opts = {}) {
    const scope = await this.adminProgramScope(user, opts);
    if (scope === null) return true;
    if (!programId || !scope.includes(programId)) {
      throw new AuthorizationError('That program is outside your program scope');
    }
    return true;
  }

  /**
   * The programmes and clans this person's reads are bounded to, in the portal
   * they currently have open. ONE answer, asked by every surface.
   *
   * Every scope leak this codebase has had was the same mistake: a service
   * asking "is this person an admin?" and never "an admin of WHAT?", each one
   * re-deriving "my programmes" slightly differently. There were three
   * divergent implementations at the last count, so fixing one left the others
   * leaking, and they leaked one at a time for weeks.
   *
   *   { unrestricted: true }              an ORG-tier admin wearing the admin hat
   *   { programIds: [], clanIds: [] }     everybody else, already deduped
   *
   * The hat decides which memberships count, exactly as `actsAsAdmin` does:
   * somebody who administers one programme, mentors two clans and learns in a
   * third gets a different bound on each screen, and all three are true. With
   * no hat stated anywhere the answer is the union of everything they hold,
   * which is what a background job or a legacy caller means.
   *
   * `clanIds` is NOT "the clans of programIds", except for an admin. An admin
   * OF a programme oversees every clan in it; a mentee enrolled in the same
   * programme does not, and expanding their programme back into clans would
   * hand them every sibling clan's clan-targeted content.
   */
  async programScopeFor(user, portalRole = null, opts = {}) {
    const none = { unrestricted: false, programIds: [], clanIds: [] };
    if (!user) return none;

    const contextHat = getRequestContext().portalRole;
    const hat = PORTAL_HATS.includes(portalRole)
      ? portalRole
      : (PORTAL_HATS.includes(contextHat) ? contextHat : null);
    const wears = (role) => hat === null || hat === role;

    const programIds = new Set();
    const clanIds = new Set();

    if (wears('admin')) {
      // Resolved here rather than up front: only the admin hat needs them, and
      // this runs on the chat directory, which is a hot path.
      const assignments = opts.assignments || (await this.getAssignments(user));
      const adminScope = await this.adminProgramScope(user, { assignments });
      // Unrestricted beats every other hat: there is nothing left to bound.
      if (adminScope === null) return { unrestricted: true, programIds: null, clanIds: null };
      adminScope.forEach((id) => programIds.add(id));
      (await this.clanIdsInPrograms(adminScope)).forEach((id) => clanIds.add(id));
    }

    if (wears('mentor')) {
      (await this.mentoredClanIds(user.id)).forEach((id) => clanIds.add(id));
      // A 1:1 match with no clan behind it still places the mentor in that
      // mentee's programme.
      if (models.MentorMenteeMatch) {
        const matches = await models.MentorMenteeMatch.findAll({
          where: { mentorId: user.id, status: 'active' },
          include: [{ model: models.Enrollment, as: 'enrollment', attributes: ['programId'] }],
        });
        matches.forEach((m) => m.enrollment?.programId && programIds.add(m.enrollment.programId));
      }
    }

    if (wears('mentee')) {
      const mine = await models.ClanMembership.findAll({
        where: { userId: user.id, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }, role: 'mentee' },
        attributes: ['clanId'],
      });
      mine.forEach((m) => m.clanId && clanIds.add(m.clanId));
      const enrolments = await models.Enrollment.findAll({
        where: { menteeId: user.id, status: { [Op.notIn]: DEAD_ENROLMENT_STATUSES } },
        attributes: ['programId'],
      });
      enrolments.forEach((e) => e.programId && programIds.add(e.programId));
    }

    // A clan in scope brings its own programme with it. Never the reverse.
    if (clanIds.size && models.Clan) {
      const clans = await models.Clan.findAll({
        where: { id: { [Op.in]: [...clanIds] } },
        attributes: ['programId'],
        raw: true,
        paranoid: false,
      });
      clans.forEach((c) => c.programId && programIds.add(c.programId));
    }

    return { unrestricted: false, programIds: [...programIds], clanIds: [...clanIds] };
  }

  /** Every clan belonging to any of `programIds`. */
  async clanIdsInPrograms(programIds) {
    if (!Array.isArray(programIds) || programIds.length === 0 || !models.Clan) return [];
    const clans = await models.Clan.findAll({
      where: { programId: { [Op.in]: programIds } },
      attributes: ['id'],
      raw: true,
      paranoid: false,
    });
    return clans.map((c) => c.id);
  }

  /**
   * The admin user ids reachable from a programme bound: every org-tier admin,
   * plus the admins OF those programmes.
   *
   * Org admins are reachable from every scope deliberately. Being limited to
   * one programme is a reason to NEED an org admin, not a reason to be cut off
   * from one. What must not come too is the admins of other programmes, which
   * is what put the people running unrelated fellowships in a mentee's chat
   * directory.
   */
  async adminUserIdsFor(programIds = []) {
    if (!models.RoleAssignment) return [];
    const custom = await loadCustomRoles();
    const isAdminRole = (role) => ADMIN_TIER_ROLES.has(role) || Boolean(custom[role]);
    const bounded = Array.isArray(programIds) && programIds.length > 0;
    const rows = await models.RoleAssignment.findAll({
      where: bounded
        ? { [Op.or]: [{ scopeType: 'org' }, { scopeType: 'program', scopeId: { [Op.in]: programIds } }] }
        : { scopeType: 'org' },
      attributes: ['userId', 'role'],
    });
    return [...new Set(rows.filter((r) => isAdminRole(r.role)).map((r) => r.userId))];
  }

  /** Called by accessService when custom roles change. */
  invalidateCustomRoles() { invalidateCustomRoles(); }

  /**
   * Can `user` legitimately view mentee `menteeId`? True when it's themselves, an
   * admin, their directly-matched mentee, or a mentee in a clan where the user
   * holds a mentoring role (MENTEE_VIEW at that clan's scope — covers lead/co
   * mentor and cross-clan cover). This is the ownership check that replaces the
   * old "primary role === mentee" data-scoping, so a co-mentor sees the REAL
   * mentee and can't reach mentees outside their clans.
   */
  async canViewMentee(user, menteeId, opts = {}) {
    if (!user || !menteeId) return false;
    if (user.id === menteeId) return true;

    const assignments = opts.assignments || (await this.getAssignments(user));
    if (await this.hasAdminAccess(user, { assignments })) return true;

    // When a clan is selected, access must come through THAT clan — not another
    // membership the mentee happens to share with the viewer.
    if (opts.clanId) {
      const resource = await this.scopeOfClan(opts.clanId);
      if (!(await this.can(user, P.MENTEE_VIEW, resource, { assignments }))) return false;
      const membership = await models.ClanMembership.findOne({
        where: {
          clanId: opts.clanId,
          userId: menteeId,
          status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
          role: 'mentee'
        },
        attributes: ['id']
      });
      return Boolean(membership);
    }

    const match = await models.MentorMenteeMatch.findOne({
      where: { mentorId: user.id, menteeId, status: 'active' }, attributes: ['id']
    });
    if (match) return true;

    const menteeClans = await models.ClanMembership.findAll({
      where: {
        userId: menteeId,
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        role: 'mentee'
      },
      attributes: ['clanId']
    });
    for (const c of menteeClans) {
      const resource = await this.scopeOfClan(c.clanId);
      if (await this.can(user, P.MENTEE_VIEW, resource, { assignments })) return true;
    }
    return false;
  }

  /**
   * Can `userId` act on `task` with one of `permissions` (any-of)? True for the
   * task's assigning mentor (kept for continuity), an admin, or anyone holding
   * the permission at the task's clan/program scope — a lead mentor, a co-mentor,
   * or accepted cross-clan cover — and it RESPECTS a co-mentor's revoked
   * permissions. This replaces the legacy `task.mentorId === you` ownership the
   * task/submission write paths used, which wrongly blocked every co-mentor (and
   * mis-fired for mentee-based co-mentors, since it keyed off the base role).
   */
  async canActOnTask(userId, task, permissions) {
    if (!userId || !task) return false;
    const user = await models.User.findByPk(userId, { attributes: ['id', 'role'] });
    if (!user) return false;
    const assignments = await this.getAssignments(user);

    // System Pool work answers to the POOL, never to a clan or to whoever
    // assigned it: the candidate is in no clan yet, and once they are placed
    // their new mentor must not gain rights over the work that selected them.
    const poolMemberId = task.poolMemberId !== undefined
      ? task.poolMemberId
      : (await models.AssignedTask.scope('withPoolWork').findByPk(task.id, { attributes: ['poolMemberId'] }))?.poolMemberId;
    if (poolMemberId) {
      return this._canActOnPoolTask(user, { menteeId: task.menteeId, poolMemberId }, permissions, { assignments });
    }

    // No self-review. A co-mentor of the clan they're also a mentee in holds
    // task.review over that clan's mentees — themselves included — so without
    // this they could approve and score their own submissions. Admins keep
    // their override (they answer to the audit log, not to a clan role).
    if (task.menteeId && task.menteeId === userId) {
      return this.hasAdminAccess(user, { assignments });
    }

    if (task.mentorId && task.mentorId === userId) return true; // the assigning mentor
    const resource = await this.scopeOfAssignedTask(task.id);
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    for (const p of perms) {
      if (await this.can(user, p, resource, { assignments })) return true;
    }
    return false;
  }

  /**
   * May `user` act on a piece of System Pool work?
   *
   * Reviewing it needs `pool.review` at the pool's programme. Merely looking
   * (the callers that pass `mentee.view`) is allowed to anyone holding any
   * `pool.*` permission there. Nobody — admins included — reviews their own
   * qualifying work: the candidate is being selected on it.
   */
  async _canActOnPoolTask(user, { menteeId, poolMemberId }, permissions, { assignments }) {
    if (menteeId && menteeId === user.id) return false;
    const resource = await this.scopeOfPoolMember(poolMemberId);
    if (!resource) return false;
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    const wanted = new Set();
    for (const p of perms) {
      if (p === P.TASK_REVIEW || p === P.POOL_REVIEW) wanted.add(P.POOL_REVIEW);
      else if (p === P.MENTEE_VIEW) POOL_PERMISSIONS.forEach((pp) => wanted.add(pp));
      else if (POOL_PERMISSIONS.includes(p)) wanted.add(p);
    }
    for (const p of wanted) {
      if (await this.can(user, p, resource, { assignments })) return true;
    }
    return false;
  }

  /**
   * A pool member resolves to their pool's PROGRAMME — never to a clan. Even
   * after placement, qualifying work is the pool's, not the new clan's.
   */
  async scopeOfPoolMember(poolMemberId) {
    if (!poolMemberId || !models.PoolMember) return null;
    const member = await models.PoolMember.findByPk(poolMemberId, {
      attributes: ['id', 'userId'],
      include: [{ model: models.CandidatePool, as: 'pool', attributes: ['programId'] }],
    });
    if (!member?.pool) return null;
    return { programId: member.pool.programId, userId: member.userId || undefined };
  }

  /** A pool resolves to its programme — the scope every `pool.*` check uses. */
  async scopeOfPool(poolId) {
    if (!poolId || !models.CandidatePool) return null;
    const pool = await models.CandidatePool.findByPk(poolId, { attributes: ['id', 'programId'] });
    return pool ? { programId: pool.programId } : null;
  }

  // ── Scope resolvers (locate a resource in the hierarchy) ─────────────────────
  /** A clan resource: covers clan + its program. */
  async scopeOfClan(clanId) {
    if (!clanId) return null;
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId'] });
    return clan ? { clanId: clan.id, programId: clan.programId } : { clanId };
  }

  /** An assigned task: covers the mentee (self), their clan, and the program. */
  async scopeOfAssignedTask(taskId) {
    const task = await models.AssignedTask.scope('withPoolWork').findByPk(taskId, {
      attributes: ['id', 'menteeId', 'enrollmentId', 'clanId', 'poolMemberId'],
    });
    if (!task) return null;
    // Pool work locates in its pool's programme, and ONLY there. Never fall
    // back to "the mentee's only clan" below: after placement that would hand
    // the new clan's mentors the work the candidate was selected on.
    if (task.poolMemberId) {
      const pool = await this.scopeOfPoolMember(task.poolMemberId);
      return pool ? { userId: task.menteeId, programId: pool.programId } : { userId: task.menteeId };
    }
    const out = { userId: task.menteeId };
    if (task.clanId) out.clanId = task.clanId;
    if (task.enrollmentId) {
      const enr = await models.Enrollment.findByPk(task.enrollmentId, { attributes: ['programId'] });
      if (enr) out.programId = enr.programId;
    }
    if (!out.clanId) {
      const where = {
        userId: task.menteeId,
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        role: 'mentee'
      };
      if (task.enrollmentId) where.enrollmentId = task.enrollmentId;
      const memberships = await models.ClanMembership.findAll({
        where,
        attributes: ['clanId']
      });
      if (memberships.length === 1) out.clanId = memberships[0].clanId;
    }
    return out;
  }

  /**
   * Every clan a user MENTORS, from ALL sources — clan membership (lead/co/core),
   * an explicit clan-scoped role grant (RoleAssignment), and accepted cross-clan
   * cover. The mentor data views (cohort, My Mentees) use this so a co-mentor
   * added via "Grant role" sees the clan's mentees just like one added via the
   * clan's "Add to team".
   */
  async mentoredClanIds(userId) {
    if (!userId) return [];
    const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
    const set = new Set();

    const tasks = [
      models.ClanMembership.findAll({
        where: { userId, status: 'active', role: { [Op.in]: MENTOR_CLAN_ROLES } }, attributes: ['clanId'],
      }),
      models.RoleAssignment.findAll({
        where: { userId, scopeType: 'clan', role: { [Op.in]: MENTOR_CLAN_ROLES } }, attributes: ['scopeId'],
      })
    ];

    if (models.CrossClanAssignment) {
      tasks.push(
        models.CrossClanAssignment.findAll({
          where: { userId, status: 'active' }, attributes: ['toClanId'],
        })
      );
    }

    const [memberships, grants, cover] = await Promise.all(tasks);

    memberships.forEach((m) => m.clanId && set.add(m.clanId));
    grants.forEach((g) => g.scopeId && set.add(g.scopeId));
    if (cover) cover.forEach((c) => c.toClanId && set.add(c.toClanId));

    return [...set];
  }

  /**
   * Every mentee userId a user may legitimately view data for — combining
   * direct 1:1 matches and all clan-sourced relationships. This is the
   * canonical "give me the mentees this person mentors" resolver, used by
   * cohort, friction, and task domains so there is a single source of truth
   * that covers lead_mentor, co_mentor, core_team, cross-clan cover, and
   * explicit RoleAssignment grants. Returns [] when the user mentors nobody.
   *
   * Accepts a user object or a bare userId. Pass `{ permission }` to narrow the
   * clan side to clans where the user may ACTUALLY exercise that permission
   * (`clansWhereCan`) — a data view should ask for the permission it renders,
   * so a co-mentor with `mentee.view` revoked drops out of the list exactly as
   * they already do from the per-record check. Direct 1:1 matches are never
   * filtered: the match itself is the grant.
   *
   * Pass `{ clanIds }` to narrow to ONE (or a few) of the clans they mentor —
   * what the mentor clan selector asks for. Narrowing by clan also drops the
   * 1:1 matches, because a match is not attached to a clan and so cannot be
   * said to belong to the one that was picked.
   */
  async resolveMenteeIds(userOrId, opts = {}) {
    const asUser = userOrId && typeof userOrId === 'object' ? userOrId : null;
    const userId = asUser ? asUser.id : userOrId;
    if (!userId) return [];
    const ids = new Set();
    const clanFilter = Array.isArray(opts.clanIds) ? new Set(opts.clanIds) : null;

    // `clansWhereCan` runs `getAssignments`, which reads the base role — so a
    // bare id has to be hydrated before it can be permission-filtered.
    const clanSource = async () => {
      if (!opts.permission) return this.mentoredClanIds(userId);
      const user = asUser || (await models.User.findByPk(userId, { attributes: ['id', 'role'] }));
      return user ? this.clansWhereCan(user, opts.permission, { assignments: opts.assignments }) : [];
    };

    const [matches, clanIds] = await Promise.all([
      models.MentorMenteeMatch.findAll({
        where: { mentorId: userId, status: 'active' },
        attributes: ['menteeId']
      }),
      clanSource()
    ]);

    if (!clanFilter) matches.forEach((m) => m.menteeId && ids.add(m.menteeId));

    const scopedClanIds = clanFilter ? clanIds.filter((id) => clanFilter.has(id)) : clanIds;
    if (scopedClanIds.length) {
      const menteeMemberships = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: scopedClanIds }, status: 'active', role: 'mentee' },
        attributes: ['userId']
      });
      menteeMemberships.forEach((m) => m.userId && ids.add(m.userId));
    }

    return [...ids];
  }

  /**
   * Who a PORTAL is about — the mentee ids a "my stuff" list should be built
   * from, given the hat the caller is currently wearing (see
   * middlewares/portalScope.js). `null` means "do not narrow", which is what an
   * unknown portal returns so nothing changes for callers that never send one.
   *
   *   mentee portal → themselves, and nobody else. Being a mentor elsewhere is
   *                   irrelevant to the page they have open; this is the whole
   *                   point of the split.
   *   mentor portal → the mentees they mentor, narrowed to the clan selector
   *                   when one is set, and NEVER themselves — a mentor who also
   *                   learns in a clan reads their own record in the mentee
   *                   portal, not among the people they are responsible for.
   *   admin portal  → no narrowing; the admin views are org-wide by definition
   *                   and their own authorization already decides the answer.
   *
   * This only ever removes rows. The caller still authorizes every record it
   * returns exactly as before.
   */
  async menteeIdsForPortal(user, portal = {}, opts = {}) {
    if (!user || !portal || !portal.role || portal.role === 'admin') return null;
    const assignments = opts.assignments || (await this.getAssignments(user));

    if (portal.role === 'mentee') {
      const capabilities = await this.getCapabilities(user, { assignments });
      return capabilities.includes('mentee') ? [user.id] : [];
    }

    // mentor
    const ids = await this.resolveMenteeIds(user, {
      permission: opts.permission || P.MENTEE_VIEW,
      assignments,
      clanIds: portal.clanId ? [portal.clanId] : undefined
    });
    return ids.filter((id) => id !== user.id);
  }

  /**
   * The clans a user may exercise a permission in — `mentoredClanIds` filtered by
   * an actual scoped `can()` check. This is what makes a co-mentor's data views
   * (e.g. the Approvals queue) match what the action layer (`canActOnTask`) will
   * allow: a clan where the lead revoked `task.review` for this co-mentor drops
   * out here, so they never see work they couldn't act on. Leads / core-team /
   * grants keep every clan (no deny list applies to them).
   */
  async clansWhereCan(user, permission, opts = {}) {
    if (!user) return [];
    const clanIds = await this.mentoredClanIds(user.id);
    if (!clanIds.length) return [];
    const assignments = opts.assignments || (await this.getAssignments(user));
    const allowed = [];
    for (const clanId of clanIds) {
      const resource = await this.scopeOfClan(clanId);
      if (await this.can(user, permission, resource, { assignments })) allowed.push(clanId);
    }
    return allowed;
  }

  /**
   * A mentee: their self scope + the clan/program they're currently placed in.
   * `role: 'mentee'` matters — someone who co-mentors clan B while learning in
   * clan A must resolve to A, or their mentors lose access to their own mentee.
   */
  /**
   * Mentee resource scope. Prefer an explicit clan (portal X-Active-Clan) when
   * the mentee is in both a completed cohort and a standing clan — never pick
   * an arbitrary first membership.
   */
  async scopeOfMentee(menteeId, preferredClanId = null) {
    if (!menteeId) return null;
    const out = { userId: menteeId };
    const baseWhere = {
      userId: menteeId,
      status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
      role: 'mentee',
    };
    let membership = null;
    if (preferredClanId) {
      membership = await models.ClanMembership.findOne({
        where: { ...baseWhere, clanId: preferredClanId },
        attributes: ['clanId'],
      });
    }
    if (!membership) {
      const rows = await models.ClanMembership.findAll({
        where: baseWhere,
        attributes: ['clanId'],
        order: [['status', 'ASC']],
      });
      if (rows.length === 1) membership = rows[0];
      // Multi-clan without a preferred clan: leave clanId unset so we don't
      // authorize against the wrong side (standing vs cohort).
    }
    if (membership) {
      out.clanId = membership.clanId;
      const clan = await models.Clan.findByPk(membership.clanId, { attributes: ['programId'] });
      if (clan) out.programId = clan.programId;
    }
    return out;
  }

  /** An enrollment: its program + the mentee (self) + their cohort clan for that program. */
  async scopeOfEnrollment(enrollmentId) {
    if (!enrollmentId) return null;
    const enr = await models.Enrollment.findByPk(enrollmentId, { attributes: ['menteeId', 'programId'] });
    if (!enr) return null;
    const out = { userId: enr.menteeId, programId: enr.programId };
    // Prefer membership linked to this enrollment, then cohort clan for the program
    // — never a standing membership that shares the same programId.
    let membership = await models.ClanMembership.findOne({
      where: {
        userId: enr.menteeId,
        enrollmentId,
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        role: 'mentee',
      },
      attributes: ['clanId'],
    });
    if (!membership && enr.programId) {
      membership = await models.ClanMembership.findOne({
        where: {
          userId: enr.menteeId,
          status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
          role: 'mentee',
        },
        attributes: ['clanId'],
        include: [{
          model: models.Clan,
          as: 'clan',
          required: true,
          attributes: [],
          where: { programId: enr.programId, kind: 'cohort' },
        }],
        order: [['status', 'ASC']],
      });
    }
    if (membership) out.clanId = membership.clanId;
    return out;
  }

  /** A submission resolves to the clan/program/mentee of its assigned task. */
  async scopeOfSubmission(submissionId) {
    if (!submissionId) return null;
    const sub = await models.TaskSubmission.findByPk(submissionId, { attributes: ['assignedTaskId'] });
    if (!sub) return null;
    return this.scopeOfAssignedTask(sub.assignedTaskId);
  }

  /** A delay/blocker event → its task's scope, or the mentee's scope. */
  async scopeOfDelay(delayId) {
    if (!delayId) return null;
    const d = await models.DelayEvent.findByPk(delayId, { attributes: ['menteeId', 'assignedTaskId'] });
    if (!d) return null;
    if (d.assignedTaskId) return this.scopeOfAssignedTask(d.assignedTaskId);
    return this.scopeOfMentee(d.menteeId);
  }

  /** An announcement's scope from its audience: clan/program-scoped, else org. */
  scopeOfAnnouncementAudience(audience, audienceId) {
    if (audience === 'clan' && audienceId) return this.scopeOfClan(audienceId);
    if (audience === 'program' && audienceId) return { programId: audienceId };
    return null; // 'all' / 'mentors' / 'mentees' → org-wide (only org roles cover)
  }

  async scopeOfAnnouncement(announcementId) {
    if (!announcementId) return null;
    const a = await models.Announcement.findByPk(announcementId, { attributes: ['audience', 'audienceId'] });
    if (!a) return null;
    return this.scopeOfAnnouncementAudience(a.audience, a.audienceId);
  }

  /** A track (mentee work lane) → the mentee's scope. */
  async scopeOfTrack(trackId) {
    if (!trackId) return null;
    const t = await models.Track.findByPk(trackId, { attributes: ['menteeId'] });
    if (!t) return null;
    return this.scopeOfMentee(t.menteeId);
  }
}

module.exports = new AuthzService();
