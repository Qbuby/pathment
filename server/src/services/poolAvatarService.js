/**
 * poolAvatarService — a pool's photo.
 *
 * Deliberately the same shape as `clanAvatarService`: crop on the client,
 * upload the file, save the URL. A pool now sits beside a candidate's clans in
 * the workspace picker, so it needs the same identity a clan has there, and
 * the same two-step flow means `ImageCropUploader` works against it unchanged.
 *
 * Who may change it: anyone who may manage the pool (`pool.manage` at the
 * pool's programme), which is the same test every other pool setting uses.
 */
const { models } = require('../db');
const authz = require('./authzService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { PERMISSIONS } = require('../config/permissions');

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB, as for a clan photo
const ALLOWED_MIME = ['image/png', 'image/jpeg'];
const FOLDER = 'pathment/pool-avatars';

async function editablePool(id, user) {
  const pool = await models.CandidatePool.findByPk(id);
  if (!pool) throw new NotFoundError('Pool not found');
  if (pool.status === 'closed') throw new ValidationError('A closed pool cannot be edited');
  if (!(await authz.can(user, PERMISSIONS.POOL_MANAGE, { programId: pool.programId }))) {
    throw new ForbiddenError('You cannot change this pool photo');
  }
  return pool;
}

function assertImageFile(file) {
  if (!file || !ALLOWED_MIME.includes(file.mimetype) || file.size > MAX_BYTES) {
    throw new ValidationError('Choose a PNG or JPG image up to 1 MB');
  }
}

function assertAvatarUrl(url) {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) throw new ValidationError('A valid image URL is required');
  return s;
}

/** Upload only — returns { url, fileName, fileSizeBytes }. Does not touch the pool row. */
async function uploadAvatarFile(id, user, file) {
  await editablePool(id, user);
  assertImageFile(file);
  const result = await uploadToCloudinary(file.buffer, FOLDER, 'image');
  const url = result.secure_url || result.url;
  if (!url) throw new ValidationError('Could not upload the file');
  return { url, fileName: file.originalname || 'pool-avatar.jpg', fileSizeBytes: file.size || 0 };
}

/** Persist a previously uploaded URL on the pool (add or change). */
async function setAvatarUrl(id, user, avatarUrl) {
  const pool = await editablePool(id, user);
  await pool.update({ avatarUrl: assertAvatarUrl(avatarUrl) });
  return { avatarUrl: pool.avatarUrl };
}

async function removeAvatar(id, user) {
  const pool = await editablePool(id, user);
  await pool.update({ avatarUrl: null });
  return { avatarUrl: null };
}

module.exports = { editablePool, uploadAvatarFile, setAvatarUrl, removeAvatar, MAX_BYTES };
