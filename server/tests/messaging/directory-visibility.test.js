'use strict';

const { Op } = require('sequelize');

let mockContext = {};

const mockModels = {
  User: { findByPk: jest.fn(), findAll: jest.fn() },
  OrganizationMembership: { findAll: jest.fn() },
  MentorProfile: { findAll: jest.fn() },
  ClanMembership: { findAll: jest.fn() },
  MentorMenteeMatch: { findAll: jest.fn() },
};

jest.mock('../../src/db', () => ({ models: mockModels, sequelize: {} }));
jest.mock('../../src/utils/auditContext', () => ({ getRequestContext: () => mockContext }));
jest.mock('../../src/services/authzService', () => ({ getCapabilities: jest.fn() }));
jest.mock('../../src/services/schedulingService', () => ({ getMenteeMentorIds: jest.fn() }));

const authzService = require('../../src/services/authzService');
const schedulingService = require('../../src/services/schedulingService');
const messagingService = require('../../src/services/messagingService');
const clanRequestValidation = require('../../src/validations/clanRequestValidation');

const memberships = [
  { userId: 'admin', role: 'admin' },
  { userId: 'mentor', role: 'member' },
  { userId: 'other-mentor', role: 'member' },
  { userId: 'mentee', role: 'member' },
  { userId: 'peer', role: 'member' },
  { userId: 'outside-mentee', role: 'member' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockContext = { organizationId: 'organization' };
  mockModels.OrganizationMembership.findAll.mockResolvedValue(memberships);
});

it('gives a mentee only their clan, assigned mentor and admins', async () => {
  mockContext.portalRole = 'mentee';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentee', role: 'mentee' });
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  schedulingService.getMenteeMentorIds.mockResolvedValue(['mentor']);
  mockModels.ClanMembership.findAll
    .mockResolvedValueOnce([{ clanId: 'own-clan' }])
    .mockResolvedValueOnce([
      { userId: 'mentee' },
      { userId: 'peer' },
      { userId: 'mentor' },
    ]);

  const visible = await messagingService.getAllowedRecipientIds('mentee');
  expect(visible).toEqual(expect.arrayContaining(['admin', 'mentor', 'peer']));
  expect(visible).not.toEqual(expect.arrayContaining(['other-mentor', 'outside-mentee']));
});

it('gives a mentor assigned mentees, every mentor and admins', async () => {
  mockContext.portalRole = 'mentor';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentor', role: 'mentor' });
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  mockModels.MentorProfile.findAll.mockResolvedValue([
    { userId: 'mentor' },
    { userId: 'other-mentor' },
  ]);
  mockModels.ClanMembership.findAll
    .mockResolvedValueOnce([{ clanId: 'own-clan' }])
    .mockResolvedValueOnce([{ userId: 'mentee' }, { userId: 'peer' }]);
  mockModels.MentorMenteeMatch.findAll.mockResolvedValue([]);

  const visible = await messagingService.getAllowedRecipientIds('mentor');
  expect(visible).toEqual(expect.arrayContaining(['admin', 'other-mentor', 'mentee', 'peer']));
  expect(visible).not.toContain('outside-mentee');
});

it('gives an admin every other active workspace member', async () => {
  mockContext.portalRole = 'admin';
  mockModels.User.findByPk.mockResolvedValue({ id: 'admin', role: 'admin' });
  authzService.getCapabilities.mockResolvedValue(['admin']);

  await expect(messagingService.getAllowedRecipientIds('admin')).resolves.toEqual([
    'mentor',
    'other-mentor',
    'mentee',
    'peer',
    'outside-mentee',
  ]);
});

it('puts allowed ids into the query so forbidden users are never fetched', async () => {
  jest.spyOn(messagingService, 'getAllowedRecipientIds').mockResolvedValue(['mentor', 'peer', 'admin']);
  jest.spyOn(messagingService, 'getClanMemberUserIds').mockResolvedValue(['peer']);
  mockModels.User.findAll.mockResolvedValue([]);

  await messagingService.searchUsers('mentee', 'nadia');

  const where = mockModels.User.findAll.mock.calls[0][0].where;
  expect(where.id[Op.in]).toEqual(['mentor', 'peer', 'admin']);
  expect(where[Op.or]).toEqual(expect.arrayContaining([
    { firstName: { [Op.iLike]: '%nadia%' } },
  ]));
});

it('keeps the source clan in a standing-clan request', () => {
  const input = {
    programId: '11111111-1111-4111-8111-111111111111',
    sourceClanId: '22222222-2222-4222-8222-222222222222',
    name: 'Builders alumni',
    description: '',
  };

  const result = clanRequestValidation.standingRequest.validate(input, { stripUnknown: true });
  expect(result.error).toBeUndefined();
  expect(result.value.sourceClanId).toBe(input.sourceClanId);
});
