const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ConflictError } = require('../utils/errors/errorTypes');
const organizationService = require('./organizationService');

/**
 * externalAppService - the external app catalog + per-workspace connections.
 *
 * Two audiences:
 *  - Workspace admins see the ACTIVE catalog annotated with whether their own
 *    workspace has connected each app, and connect/disconnect apps.
 *  - Platform admins author the catalog itself (create/update/delete). The
 *    catalog is global, so those writes affect every workspace.
 */

const catalogShape = (app) => ({
  id: app.id,
  name: app.name,
  type: app.type,
  description: app.description || null,
  iconUrl: app.iconUrl || null,
  isActive: app.isActive,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt
});

const filterWhere = ({ search, type } = {}) => {
  const where = {};
  if (type) where.type = type;
  const term = (search || '').trim();
  if (term) where.name = { [Op.iLike]: `%${term}%` };
  return where;
};

const isDuplicateName = (error) => error?.name === 'SequelizeUniqueConstraintError';

class ExternalAppService {
  // ── workspace view ──────────────────────────────────────────────────────
  async listForOrganization(organizationId, filters = {}) {
    const orgId = organizationId || await organizationService.currentId();
    const [apps, connections] = await Promise.all([
      models.ExternalApp.findAll({ where: { ...filterWhere(filters), isActive: true }, order: [['name', 'ASC']] }),
      models.OrganizationApp.findAll({ where: { organizationId: orgId } })
    ]);
    const connectedAt = new Map(connections.map((row) => [row.appId, row.createdAt]));
    return apps.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      description: app.description || null,
      iconUrl: app.iconUrl || null,
      connected: connectedAt.has(app.id),
      connectedAt: connectedAt.get(app.id) || null
    }));
  }

  async connect(user, organizationId, appId) {
    const orgId = organizationId || await organizationService.currentId();
    const app = await models.ExternalApp.findOne({ where: { id: appId, isActive: true } });
    if (!app) throw new NotFoundError('App not found');
    // Idempotent: connecting an already-connected app keeps the original row.
    const [row] = await models.OrganizationApp.findOrCreate({
      where: { organizationId: orgId, appId },
      defaults: { organizationId: orgId, appId, connectedBy: user.id }
    });
    return { appId, connected: true, connectedAt: row.createdAt };
  }

  async disconnect(organizationId, appId) {
    const orgId = organizationId || await organizationService.currentId();
    const row = await models.OrganizationApp.findOne({ where: { organizationId: orgId, appId } });
    if (!row) throw new NotFoundError('App is not connected');
    await row.destroy();
    return { appId, connected: false };
  }

  // ── catalog authoring (platform admin) ──────────────────────────────────
  async listCatalog(filters = {}) {
    const apps = await models.ExternalApp.findAll({ where: filterWhere(filters), order: [['name', 'ASC']] });
    return apps.map(catalogShape);
  }

  async create(data, user) {
    try {
      const app = await models.ExternalApp.create({
        name: data.name,
        type: data.type,
        description: data.description || null,
        iconUrl: data.iconUrl || null,
        isActive: data.isActive !== false,
        createdBy: user?.id || null
      });
      return catalogShape(app);
    } catch (error) {
      if (isDuplicateName(error)) throw new ConflictError('An app with that name already exists');
      throw error;
    }
  }

  async update(id, data) {
    const app = await models.ExternalApp.findByPk(id);
    if (!app) throw new NotFoundError('App not found');
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.type !== undefined) patch.type = data.type;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.iconUrl !== undefined) patch.iconUrl = data.iconUrl || null;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    try {
      await app.update(patch);
    } catch (error) {
      if (isDuplicateName(error)) throw new ConflictError('An app with that name already exists');
      throw error;
    }
    return catalogShape(app);
  }

  /** Deleting a catalog app also removes every workspace's connection to it (FK cascade). */
  async remove(id) {
    const app = await models.ExternalApp.findByPk(id);
    if (!app) throw new NotFoundError('App not found');
    await app.destroy();
    return { removed: true };
  }
}

module.exports = new ExternalAppService();
