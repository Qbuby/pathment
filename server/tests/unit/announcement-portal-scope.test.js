/**
 * Announcements must answer for the hat the caller is wearing, and for WHEN
 * they joined.
 *
 * Two bugs are pinned here. A mentor who also administers the workspace used
 * to get every announcement in the organisation on their own mentor screen,
 * because visibility was decided by whether they HELD admin rather than by the
 * portal they had open. And visibility was pure set membership with no sense
 * of time, so a mentee who enrolled this morning read eight months of another
 * cohort's logistics while a mentee who dropped out kept receiving new posts.
 *
 * Pure unit test: the database is mocked, so this asserts the WHERE clause the
 * service builds rather than the rows a query returns.
 */
jest.mock('../../src/db', () => ({
  models: {
    ClanMembership: { findAll: jest.fn(async () => []) },
    Enrollment: { findAll: jest.fn(async () => []) },
    MentorMenteeMatch: { findAll: jest.fn(async () => []) },
    // Read for the org-wide floor: when somebody joined the workspace.
    OrganizationMembership: { findOne: jest.fn(async () => null) },
  },
}));
jest.mock('../../src/services/authzService', () => ({
  actsAsAdmin: jest.fn(async () => false),
  getCapabilities: jest.fn(async () => []),
  programScopeFor: jest.fn(async () => ({ unrestricted: true, programIds: null, clanIds: null })),
}));

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const authzService = require('../../src/services/authzService');
const service = require('../../src/services/announcementService');

const USER = { id: 'u1' };
const CLAN_A = '11111111-1111-4111-8111-111111111111';
const CLAN_B = '22222222-2222-4222-8222-222222222222';
const PROGRAM = '33333333-3333-4333-8333-333333333333';

/** The clans this person is in, with which role, and since when. */
function membershipsAre(rows) {
  models.ClanMembership.findAll.mockImplementation(async ({ where }) => {
    const wanted = where.role && where.role[Op.in];
    return rows
      .filter((r) => !wanted || wanted.includes(r.role))
      .map((r) => ({
        clanId: r.clanId,
        role: r.role,
        joinedAt: r.joinedAt || null,
        clan: { id: r.clanId, programId: r.programId || null },
      }));
  });
}

/** One arm per audience now, each carrying its own window. */
const armsOf = (where) => (where?.[Op.or] || []).map((arm) => {
  if (arm.authorId) return 'own';
  if (arm.audience === 'clan') return `clan:${arm.audienceId}`;
  if (arm.audience === 'program') return `program:${arm.audienceId}`;
  return arm.audience || '?';
});

/** The window conditions on one arm, by audience label. */
const armFor = (where, label) => (where?.[Op.or] || []).find((arm) => {
  if (label === 'own') return Boolean(arm.authorId);
  if (label.startsWith('clan:')) return arm.audience === 'clan' && arm.audienceId === label.slice(5);
  if (label.startsWith('program:')) return arm.audience === 'program' && arm.audienceId === label.slice(8);
  return arm.audience === label;
});

const floorOf = (arm) => {
  const and = arm?.[Op.and] || [];
  const branch = and.find((c) => c[Op.or]);
  return branch?.[Op.or]?.find((o) => o.createdAt)?.createdAt?.[Op.gte] || null;
};
const ceilingOf = (arm) => {
  const and = arm?.[Op.and] || [];
  return and.find((c) => c.createdAt && c.createdAt[Op.lte])?.createdAt?.[Op.lte] || null;
};

beforeEach(() => {
  jest.clearAllMocks();
  authzService.actsAsAdmin.mockResolvedValue(false);
  authzService.getCapabilities.mockResolvedValue([]);
  authzService.programScopeFor.mockResolvedValue({ unrestricted: true, programIds: null, clanIds: null });
  models.OrganizationMembership.findOne.mockResolvedValue(null);
  models.Enrollment.findAll.mockResolvedValue([]);
  models.MentorMenteeMatch.findAll.mockResolvedValue([]);
  membershipsAre([]);
});

test('an ORG admin still sees everything, for oversight', async () => {
  authzService.actsAsAdmin.mockResolvedValue(true);
  expect(await service._visibilityWhere(USER, { portalRole: 'admin' })).toBeUndefined();
});

test('a PROGRAMME admin is bounded to their programmes, with no time window', async () => {
  authzService.actsAsAdmin.mockResolvedValue(true);
  authzService.programScopeFor.mockResolvedValue({
    unrestricted: false, programIds: [PROGRAM], clanIds: [CLAN_A],
  });

  const where = await service._visibilityWhere(USER, { portalRole: 'admin' });
  const arms = where[Op.or];
  // An admin reads announcements as a record of what their people were told,
  // so all of it - but only their programmes'.
  expect(arms.some((a) => a.audience === 'program' && a.audienceId[Op.in].includes(PROGRAM))).toBe(true);
  expect(arms.some((a) => a.audience === 'clan' && a.audienceId[Op.in].includes(CLAN_A))).toBe(true);
  expect(arms.every((a) => !a[Op.and])).toBe(true);
});

test('holding admin no longer widens the mentor portal', async () => {
  // actsAsAdmin is the portal-aware question: false while in a mentor portal,
  // even for someone who administers the workspace.
  authzService.actsAsAdmin.mockResolvedValue(false);
  authzService.getCapabilities.mockResolvedValue(['admin', 'mentor', 'mentee']);
  membershipsAre([{ clanId: CLAN_A, role: 'lead_mentor' }]);

  const where = await service._visibilityWhere(USER, { portalRole: 'mentor' });
  expect(where).toBeDefined();                       // NOT the see-everything bypass
  expect(armsOf(where)).toContain(`clan:${CLAN_A}`); // only their own clan
});

test('the mentor portal ignores the clans they are only a mentee of', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentor', 'mentee']);
  membershipsAre([
    { clanId: CLAN_A, role: 'lead_mentor' },
    { clanId: CLAN_B, role: 'mentee' },
  ]);

  const arms = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentor' }));
  expect(arms).toContain(`clan:${CLAN_A}`);
  expect(arms).not.toContain(`clan:${CLAN_B}`);
  expect(arms).toContain('mentors');
  expect(arms).not.toContain('mentees');   // wrong hat
});

test('the mentee portal ignores the clans they mentor', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentor', 'mentee']);
  membershipsAre([
    { clanId: CLAN_A, role: 'lead_mentor' },
    { clanId: CLAN_B, role: 'mentee' },
  ]);

  const arms = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentee' }));
  expect(arms).toContain(`clan:${CLAN_B}`);
  expect(arms).not.toContain(`clan:${CLAN_A}`);
  expect(arms).toContain('mentees');
  expect(arms).not.toContain('mentors');
});

test('the sidebar clan narrows to that clan alone', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  membershipsAre([
    { clanId: CLAN_A, role: 'lead_mentor' },
    { clanId: CLAN_B, role: 'co_mentor' },
  ]);

  const all = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentor' }));
  expect(all).toContain(`clan:${CLAN_A}`);
  expect(all).toContain(`clan:${CLAN_B}`);

  const one = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentor', clanId: CLAN_B }));
  expect(one).toContain(`clan:${CLAN_B}`);
  expect(one).not.toContain(`clan:${CLAN_A}`);
});

test('a clan the caller is not in cannot widen the result', async () => {
  // The header is a stated preference, never a grant.
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  membershipsAre([{ clanId: CLAN_A, role: 'lead_mentor' }]);

  const arms = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentor', clanId: CLAN_B }));
  expect(arms.some((a) => a.startsWith('clan:'))).toBe(false);
  expect(arms).toContain('all');   // org-wide announcements are still theirs
  expect(arms).toContain('own');
});

test('no portal header behaves exactly as before', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentor', 'mentee']);
  membershipsAre([
    { clanId: CLAN_A, role: 'lead_mentor' },
    { clanId: CLAN_B, role: 'mentee' },
  ]);

  const arms = armsOf(await service._visibilityWhere(USER, {}));
  expect(arms).toContain(`clan:${CLAN_A}`);
  expect(arms).toContain(`clan:${CLAN_B}`);
  expect(arms).toContain('mentors');
  expect(arms).toContain('mentees');
});

// ── the time window ────────────────────────────────────────────────────────

test('a programme arm starts at the enrolment, not at the beginning of time', async () => {
  const enrolledAt = new Date('2026-09-01T00:00:00Z');
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.Enrollment.findAll.mockResolvedValue([
    { programId: PROGRAM, status: 'active', enrolledAt },
  ]);

  const where = await service._visibilityWhere(USER, { portalRole: 'mentee' });
  const arm = armFor(where, `program:${PROGRAM}`);
  expect(arm).toBeDefined();
  expect(floorOf(arm)).toEqual(enrolledAt);
  expect(ceilingOf(arm)).toBeNull();     // still enrolled, so no ceiling
});

test('a pinned announcement escapes the floor, which is what carries the handbook', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.Enrollment.findAll.mockResolvedValue([
    { programId: PROGRAM, status: 'active', enrolledAt: new Date('2026-09-01T00:00:00Z') },
  ]);

  const arm = armFor(await service._visibilityWhere(USER, { portalRole: 'mentee' }), `program:${PROGRAM}`);
  const branch = (arm[Op.and] || []).find((c) => c[Op.or]);
  expect(branch[Op.or]).toEqual(expect.arrayContaining([{ pinned: true }]));
});

test('the earliest of several enrolments is the anchor, so re-enrolling keeps the history', async () => {
  const first = new Date('2026-01-10T00:00:00Z');
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.Enrollment.findAll.mockResolvedValue([
    { programId: PROGRAM, status: 'dropped', enrolledAt: first, droppedAt: new Date('2026-03-01T00:00:00Z') },
    { programId: PROGRAM, status: 'active', enrolledAt: new Date('2026-06-01T00:00:00Z') },
  ]);

  const arm = armFor(await service._visibilityWhere(USER, { portalRole: 'mentee' }), `program:${PROGRAM}`);
  expect(floorOf(arm)).toEqual(first);
  // One live enrolment means they are current: somebody who dropped a cohort
  // and joined the next one is not an alumnus.
  expect(ceilingOf(arm)).toBeNull();
});

test('an alumnus stops receiving what is posted after they finished', async () => {
  const completedAt = new Date('2026-08-20T00:00:00Z');
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.Enrollment.findAll.mockResolvedValue([
    {
      programId: PROGRAM,
      status: 'program_completed',
      enrolledAt: new Date('2026-01-01T00:00:00Z'),
      completedAt,
    },
  ]);

  const arm = armFor(await service._visibilityWhere(USER, { portalRole: 'mentee' }), `program:${PROGRAM}`);
  expect(ceilingOf(arm)).toEqual(completedAt);
});

test('a clan reads on its programme anchor, so a standing-clan move keeps the history', async () => {
  // The whole reason the anchor is not the clan join date: moving a mentee into
  // a standing clan writes a fresh membership row, and anchoring on it would
  // hide months of their own clan's posts on the day the move is approved.
  const enrolledAt = new Date('2026-02-01T00:00:00Z');
  const movedInYesterday = new Date('2026-10-18T00:00:00Z');
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  membershipsAre([
    { clanId: CLAN_A, role: 'mentee', programId: PROGRAM, joinedAt: movedInYesterday },
  ]);
  models.Enrollment.findAll.mockResolvedValue([
    { programId: PROGRAM, status: 'active', enrolledAt },
  ]);

  const arm = armFor(await service._visibilityWhere(USER, { portalRole: 'mentee' }), `clan:${CLAN_A}`);
  expect(floorOf(arm)).toEqual(enrolledAt);
});

test('an alumnus keeps their standing clan, whatever the enrolment says', async () => {
  // A clan membership is a live relationship. The programme ceiling must not
  // reach it, or finishing a programme would silence the clan alumni live in.
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  membershipsAre([{ clanId: CLAN_A, role: 'mentee', programId: PROGRAM, joinedAt: new Date('2026-02-01T00:00:00Z') }]);
  models.Enrollment.findAll.mockResolvedValue([
    {
      programId: PROGRAM,
      status: 'program_completed',
      enrolledAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-08-20T00:00:00Z'),
    },
  ]);

  const where = await service._visibilityWhere(USER, { portalRole: 'mentee' });
  expect(ceilingOf(armFor(where, `program:${PROGRAM}`))).not.toBeNull();
  expect(ceilingOf(armFor(where, `clan:${CLAN_A}`))).toBeNull();
});

test('the org-wide audiences start at the workspace join date', async () => {
  const joinedAt = new Date('2026-10-01T00:00:00Z');
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.OrganizationMembership.findOne.mockResolvedValue({ joinedAt });

  const where = await service._visibilityWhere(USER, { portalRole: 'mentee' });
  expect(floorOf(armFor(where, 'all'))).toEqual(joinedAt);
  expect(floorOf(armFor(where, 'mentees'))).toEqual(joinedAt);
});

test('no join date on record leaves the org-wide arms unbounded, as before', async () => {
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  models.OrganizationMembership.findOne.mockResolvedValue(null);

  const arm = armFor(await service._visibilityWhere(USER, { portalRole: 'mentee' }), 'all');
  expect(arm[Op.and]).toBeUndefined();
});
