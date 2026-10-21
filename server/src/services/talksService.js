const { Op, Sequelize } = require('sequelize');
const { sequelize, models } = require('../db');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors/errorTypes');
const { fetchVideoMetadata } = require('../utils/videoMetadata');

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Org-shared Talks library: talks with one or more categories, uploaded by mentors and admins. */
class TalksService {
  normalizeUrl(raw) {
    const value = String(raw || '').trim();
    let parsed;
    try {
      parsed = new URL(value);
    } catch (_) {
      throw new ValidationError('Enter a valid link starting with http:// or https://');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError('Enter a valid link starting with http:// or https://');
    }
    parsed.hash = '';
    return { url: value, urlKey: parsed.toString().toLowerCase().replace(/\/$/, '') };
  }

  async _isAdmin(user) {
    return authzService.can(user, PERMISSIONS.SYSTEM_SETTINGS);
  }

  _shape(t, user, isAdmin) {
    const uploader = t.uploader
      ? `${t.uploader.firstName || ''} ${t.uploader.lastName || ''}`.trim()
      : null;
    return {
      id: t.id,
      title: t.title,
      speaker: t.speaker,
      description: t.description,
      url: t.url,
      thumbnailUrl: t.thumbnailUrl || null,
      durationMins: t.durationMins,
      rating: Number(t.rating) || 0,
      ratingsCount: Number(t.ratingsCount) || 0,
      uploadedBy: t.uploadedBy,
      uploaderName: uploader || null,
      categories: (t.categories || []).map((c) => ({ id: c.id, name: c.name })),
      canManage: Boolean(user && (isAdmin || t.uploadedBy === user.id)),
      createdAt: t.createdAt
    };
  }

  get _includes() {
    return [
      {
        model: models.TalkCategory,
        as: 'categories',
        attributes: ['id', 'name'],
        through: { attributes: [] },
        required: false
      },
      { model: models.User, as: 'uploader', attributes: ['id', 'firstName', 'lastName'], required: false }
    ];
  }

  async list({ search, categoryId, limit = 24, offset = 0 } = {}, user) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = {};
    const term = String(search || '').trim();
    if (term) {
      const like = `%${likeEscape(term)}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: like } },
        { speaker: { [Op.iLike]: like } },
        { description: { [Op.iLike]: like } }
      ];
    }
    if (categoryId) {
      if (!UUID_RE.test(String(categoryId))) throw new ValidationError('Invalid category');
      where.id = {
        [Op.in]: Sequelize.literal(
          `(SELECT talk_id FROM talk_category_links WHERE category_id = ${sequelize.escape(String(categoryId))}::uuid)`
        )
      };
    }

    const { rows, count } = await models.Talk.findAndCountAll({
      where,
      include: this._includes,
      distinct: true,
      order: [['created_at', 'DESC'], ['id', 'ASC']],
      limit: safeLimit,
      offset: safeOffset
    });

    const isAdmin = await this._isAdmin(user);
    return {
      items: rows.map((t) => this._shape(t, user, isAdmin)),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        totalItems: count,
        hasMore: safeOffset + rows.length < count
      }
    };
  }

  async get(id, user) {
    const t = await models.Talk.findByPk(id, { include: this._includes });
    if (!t) throw new NotFoundError('Talk not found');
    return this._shape(t, user, await this._isAdmin(user));
  }

  _cleanFields(data, { partial = false } = {}) {
    const out = {};
    if (!partial || data.title !== undefined) {
      const title = String(data.title || '').trim();
      if (!title) throw new ValidationError('A title is required');
      if (title.length > 255) throw new ValidationError('Title is too long');
      out.title = title;
    }
    if (data.speaker !== undefined) out.speaker = String(data.speaker || '').trim().slice(0, 150) || null;
    if (data.description !== undefined) out.description = String(data.description || '').trim() || null;
    if (data.thumbnailUrl !== undefined) {
      out.thumbnailUrl = data.thumbnailUrl ? String(data.thumbnailUrl).trim() : null;
    }
    if (data.durationMins !== undefined) {
      const mins = data.durationMins === '' || data.durationMins === null ? null : Number(data.durationMins);
      if (mins !== null && (!Number.isInteger(mins) || mins <= 0)) {
        throw new ValidationError('Duration must be a whole number of minutes');
      }
      out.durationMins = mins;
    }
    return out;
  }

  async _validCategoryIds(ids) {
    const unique = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
    if (!unique.length) throw new ValidationError('Pick at least one category');
    const found = await models.TalkCategory.count({ where: { id: { [Op.in]: unique } } });
    if (found !== unique.length) throw new ValidationError('One or more categories do not exist');
    return unique;
  }

  async _assertUnique(urlKey, exceptId = null) {
    const where = { urlKey };
    if (exceptId) where.id = { [Op.ne]: exceptId };
    const existing = await models.Talk.findOne({ where, attributes: ['id', 'title'] });
    if (existing) throw new ConflictError(`This talk is already in the library as "${existing.title}"`);
  }

  async resolveUrl(rawUrl) {
    const { url, urlKey } = this.normalizeUrl(rawUrl);
    const existing = await models.Talk.findOne({
      where: { urlKey },
      attributes: ['id', 'title', 'speaker', 'url', 'thumbnailUrl']
    });
    const metadata = await fetchVideoMetadata(url);
    return {
      url,
      exists: Boolean(existing),
      existingTalk: existing ? {
        id: existing.id,
        title: existing.title,
        speaker: existing.speaker,
        url: existing.url,
        thumbnailUrl: existing.thumbnailUrl
      } : null,
      metadata
    };
  }

  async create(data, user) {
    const { url, urlKey } = this.normalizeUrl(data.url);
    await this._assertUnique(urlKey);
    const categoryIds = await this._validCategoryIds(data.categoryIds);

    let autoMeta = null;
    if (!data.title || !data.thumbnailUrl || !data.speaker || !data.description) {
      try {
        autoMeta = await fetchVideoMetadata(url);
      } catch (_) {}
    }

    const payload = {
      title: data.title || autoMeta?.title,
      speaker: data.speaker !== undefined ? data.speaker : autoMeta?.speaker,
      description: data.description !== undefined ? data.description : autoMeta?.description,
      durationMins: data.durationMins,
      thumbnailUrl: data.thumbnailUrl || autoMeta?.thumbnailUrl || null
    };

    const fields = this._cleanFields(payload);

    let id;
    try {
      await sequelize.transaction(async (transaction) => {
        const talk = await models.Talk.create(
          { ...fields, url, urlKey, uploadedBy: user.id },
          { transaction }
        );
        id = talk.id;
        await models.TalkCategoryLink.bulkCreate(
          categoryIds.map((categoryId) => ({ talkId: talk.id, categoryId })),
          { transaction }
        );
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') throw new ConflictError('This talk is already in the library');
      throw err;
    }
    return this.get(id, user);
  }

  async _loadManageable(id, user) {
    const talk = await models.Talk.findByPk(id);
    if (!talk) throw new NotFoundError('Talk not found');
    if (talk.uploadedBy !== user.id && !(await this._isAdmin(user))) {
      throw new AuthorizationError('Only the uploader or an admin can change this talk');
    }
    return talk;
  }

  async update(id, data, user) {
    const talk = await this._loadManageable(id, user);
    const patch = this._cleanFields(data, { partial: true });
    if (data.url !== undefined) {
      const { url, urlKey } = this.normalizeUrl(data.url);
      if (urlKey !== talk.urlKey) await this._assertUnique(urlKey, talk.id);
      patch.url = url;
      patch.urlKey = urlKey;
      if (data.thumbnailUrl === undefined && !talk.thumbnailUrl) {
        try {
          const meta = await fetchVideoMetadata(url);
          if (meta.thumbnailUrl) patch.thumbnailUrl = meta.thumbnailUrl;
        } catch (_) {}
      }
    }
    const categoryIds = data.categoryIds !== undefined ? await this._validCategoryIds(data.categoryIds) : null;

    try {
      await sequelize.transaction(async (transaction) => {
        await talk.update(patch, { transaction });
        if (categoryIds) {
          await models.TalkCategoryLink.destroy({ where: { talkId: talk.id }, transaction });
          await models.TalkCategoryLink.bulkCreate(
            categoryIds.map((categoryId) => ({ talkId: talk.id, categoryId })),
            { transaction }
          );
        }
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') throw new ConflictError('This talk is already in the library');
      throw err;
    }
    return this.get(id, user);
  }

  async remove(id, user) {
    const talk = await this._loadManageable(id, user);
    await talk.destroy();
    return { removed: true };
  }

  async addReview(talkId, data, user) {
    const talk = await models.Talk.findByPk(talkId);
    if (!talk) throw new NotFoundError('Talk not found');

    const ratingVal = parseInt(data.rating, 10);
    if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
      throw new ValidationError('Rating must be an integer between 1 and 5');
    }

    const feedback = data.feedback ? String(data.feedback).trim() : null;

    const [review, created] = await models.TalkReview.findOrCreate({
      where: { talkId, userId: user.id },
      defaults: {
        organizationId: user.organizationId,
        talkId,
        userId: user.id,
        rating: ratingVal,
        feedback
      }
    });

    if (!created) {
      await review.update({ rating: ratingVal, feedback });
    }

    // Recompute talk rating & count
    const reviews = await models.TalkReview.findAll({
      where: { talkId },
      attributes: ['rating']
    });
    const count = reviews.length;
    const avg = count ? (reviews.reduce((sum, r) => sum + r.rating, 0) / count) : 0;
    await talk.update({
      rating: Math.round(avg * 100) / 100,
      ratingsCount: count
    });

    return {
      review: {
        id: review.id,
        rating: review.rating,
        feedback: review.feedback,
        createdAt: review.createdAt
      },
      talk: {
        id: talk.id,
        rating: Number(talk.rating) || 0,
        ratingsCount: talk.ratingsCount
      }
    };
  }

  async getReviews(talkId) {
    const talk = await models.Talk.findByPk(talkId);
    if (!talk) throw new NotFoundError('Talk not found');

    const reviews = await models.TalkReview.findAll({
      where: { talkId },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['created_at', 'DESC']]
    });

    return reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      feedback: r.feedback,
      user: r.user ? {
        id: r.user.id,
        name: `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim()
      } : null,
      createdAt: r.createdAt
    }));
  }

  async listCategories() {
    const rows = await models.TalkCategory.findAll({
      order: [['name', 'ASC']],
      attributes: {
        include: [[
          Sequelize.literal('(SELECT COUNT(*)::int FROM talk_category_links l WHERE l.category_id = "TalkCategory"."id")'),
          'talkCount'
        ]]
      }
    });
    return rows.map((c) => ({ id: c.id, name: c.name, talkCount: Number(c.get('talkCount')) || 0 }));
  }

  _cleanName(name) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) throw new ValidationError('A category name is required');
    if (clean.length > 100) throw new ValidationError('Category name is too long');
    return { name: clean, nameKey: clean.toLowerCase() };
  }

  async createCategory(data, user) {
    const { name, nameKey } = this._cleanName(data.name);
    if (await models.TalkCategory.findOne({ where: { nameKey }, attributes: ['id'] })) {
      throw new ConflictError('A category with this name already exists');
    }
    try {
      const c = await models.TalkCategory.create({ name, nameKey, createdBy: user.id });
      return { id: c.id, name: c.name, talkCount: 0 };
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') throw new ConflictError('A category with this name already exists');
      throw err;
    }
  }

  async updateCategory(id, data) {
    const category = await models.TalkCategory.findByPk(id);
    if (!category) throw new NotFoundError('Category not found');
    const { name, nameKey } = this._cleanName(data.name);
    const clash = await models.TalkCategory.findOne({
      where: { nameKey, id: { [Op.ne]: id } },
      attributes: ['id']
    });
    if (clash) throw new ConflictError('A category with this name already exists');
    await category.update({ name, nameKey });
    return { id: category.id, name: category.name };
  }

  async removeCategory(id) {
    const category = await models.TalkCategory.findByPk(id);
    if (!category) throw new NotFoundError('Category not found');
    const inUse = await models.TalkCategoryLink.count({ where: { categoryId: id } });
    if (inUse) throw new ConflictError('This category still has talks. Move or remove them first');
    await category.destroy();
    return { removed: true };
  }
}

module.exports = new TalksService();
