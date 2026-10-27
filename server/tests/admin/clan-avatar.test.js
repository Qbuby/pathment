'use strict';

/**
 * Who may change a clan photo, and what may be uploaded.
 *
 * This suite called `clanAvatarService.setAvatar`, a function that does not
 * exist — the service was split into `uploadAvatarFile` (authorise, validate,
 * upload; touches no row) and `setAvatarUrl` (persist the url), and the test
 * was never moved across. It had been failing on every run since, with
 * `TypeError: service.setAvatar is not a function`, which says nothing about
 * the behaviour and so taught nobody anything.
 *
 * The rules it was written to protect are unchanged, so they are asserted
 * here against the two functions that now carry them.
 */

jest.mock('../../src/db', () => ({
  models: { Clan: { findByPk: jest.fn() }, ClanMembership: { findOne: jest.fn() } },
}));
jest.mock('../../src/services/authzService', () => ({ can: jest.fn(), getAssignments: jest.fn() }));
jest.mock('../../src/utils/cloudinaryUpload', () => ({ uploadToCloudinary: jest.fn() }));

const { models } = require('../../src/db');
const authz = require('../../src/services/authzService');
const { uploadToCloudinary } = require('../../src/utils/cloudinaryUpload');
const service = require('../../src/services/clanAvatarService');

const png = { mimetype: 'image/png', size: 10, buffer: Buffer.from('image'), originalname: 'c.png' };
let clan;

beforeEach(() => {
  jest.clearAllMocks();
  clan = { id: 'c', programId: 'p', leadMentorId: 'lead', update: jest.fn(async (v) => Object.assign(clan, v)) };
  models.Clan.findByPk.mockResolvedValue(clan);
  models.ClanMembership.findOne.mockResolvedValue(null);
  authz.can.mockResolvedValue(false);
  authz.getAssignments.mockResolvedValue([]);
});

test('rejects an unrelated mentor before sending anything to storage', async () => {
  await expect(service.uploadAvatarFile('c', { id: 'outsider' }, png))
    .rejects.toThrow(/cannot change this clan photo/i);
  expect(uploadToCloudinary).not.toHaveBeenCalled();
});

test('lets the lead mentor upload and persist', async () => {
  uploadToCloudinary.mockResolvedValue({ secure_url: 'https://example.test/photo.png' });

  const uploaded = await service.uploadAvatarFile('c', { id: 'lead' }, png);
  expect(uploaded.url).toBe('https://example.test/photo.png');
  // Uploading alone must not touch the row — that is the point of the split.
  expect(clan.update).not.toHaveBeenCalled();

  await service.setAvatarUrl('c', { id: 'lead' }, uploaded.url);
  expect(clan.update).toHaveBeenCalledWith({ avatarUrl: 'https://example.test/photo.png' });
});

test('lets a co-mentor who holds clan.avatar do the same', async () => {
  // Not an admin, not the lead — admitted only by the avatar permission.
  authz.can.mockImplementation(async (_user, permission) => permission === 'clan.avatar');
  uploadToCloudinary.mockResolvedValue({ secure_url: 'https://example.test/photo.png' });

  await expect(service.uploadAvatarFile('c', { id: 'co' }, png)).resolves.toMatchObject({
    url: 'https://example.test/photo.png',
  });
});

test.each([
  ['an SVG', { mimetype: 'image/svg+xml', size: 10, buffer: Buffer.from('x') }],
  ['an oversized PNG', { mimetype: 'image/png', size: 6 * 1024 * 1024, buffer: Buffer.from('x') }],
])('refuses %s without uploading it', async (_label, file) => {
  authz.can.mockResolvedValue(true);
  await expect(service.uploadAvatarFile('c', { id: 'admin' }, file))
    .rejects.toThrow(/PNG or JPG image up to 1 MB/i);
  expect(uploadToCloudinary).not.toHaveBeenCalled();
});

test('refuses a url that is not one', async () => {
  authz.can.mockResolvedValue(true);
  await expect(service.setAvatarUrl('c', { id: 'admin' }, 'javascript:alert(1)'))
    .rejects.toThrow(/valid image URL/i);
  expect(clan.update).not.toHaveBeenCalled();
});

test('removing clears the photo', async () => {
  authz.can.mockResolvedValue(true);
  await expect(service.removeAvatar('c', { id: 'admin' })).resolves.toEqual({ avatarUrl: null });
  expect(clan.update).toHaveBeenCalledWith({ avatarUrl: null });
});
