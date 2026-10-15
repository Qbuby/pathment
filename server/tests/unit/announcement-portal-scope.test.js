/**
 * Announcements must answer for the hat the caller is wearing.
 *
 * A mentor who also administers the workspace used to get every announcement
 * in the organisation on their own mentor screen, because visibility was
 * decided by whether they HELD admin rather than by the portal they had open.
 * Pure unit test: the database is mocked, so this asserts the WHERE clause the
 * service builds rather than the rows a query returns.
 */
jest.mock('../../src/db', () => ({
  models: {
    ClanMembership: { findAll: jest.fn(async () => []) },
    Enrollment: { findAll: jest.fn(async () => []) },
    MentorMenteeMatch: { findAll: jest.fn(async () => []) },
  },
}));
jest.mock('../../src/services/authzService', () => ({
  actsAsAdmin: jest.fn(async () => false),
  getCapabilities: jest.fn(async () => []),
}));

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const authzService = require('../../src/services/authzService');
const service = require('../../src/services/announcementService');

const USER = { id: 'u1' };
const CLAN_A = '11111111-1111-4111-8111-111111111111';
const CLAN_B = '22222222-2222-4222-8222-222222222222';

/** The clans this person is in, and with which role. */
function membershipsAre(rows) {
  models.ClanMembership.findAll.mockImplementation(async ({ where }) => {
    const wanted = where.role && where.role[Op.in];
    return rows
      .filter((r) => !wanted || wanted.includes(r.role))
      .map((r) => ({ clanId: r.clanId, role: r.role, clan: { programId: r.programId || null } }));
  });
}

/** The audience arms of the generated OR, as comparable strings. */
const armsOf = (where) => (where?.[Op.or] || []).map((arm) =>
  arm.audience === 'clan'
    ? `clan:${(arm.audienceId?.[Op.in] || []).join(',')}`
    : arm.audience || (arm.authorId ? 'own' : '?'));

beforeEach(() => {
  jest.clearAllMocks();
  authzService.actsAsAdmin.mockResolvedValue(false);
  authzService.getCapabilities.mockResolvedValue([]);
  membershipsAre([]);
});

test('the admin portal still sees everything, for oversight', async () => {
  authzService.actsAsAdmin.mockResolvedValue(true);
  expect(await service._visibilityWhere(USER, { portalRole: 'admin' })).toBeUndefined();
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
  expect(all).toContain(`clan:${CLAN_A},${CLAN_B}`);

  const one = armsOf(await service._visibilityWhere(USER, { portalRole: 'mentor', clanId: CLAN_B }));
  expect(one).toContain(`clan:${CLAN_B}`);
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
  expect(arms).toContain(`clan:${CLAN_A},${CLAN_B}`);
  expect(arms).toContain('mentors');
  expect(arms).toContain('mentees');
});
