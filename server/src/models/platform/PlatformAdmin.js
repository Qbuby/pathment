module.exports = (sequelize, DataTypes) => {
  /**
   * PlatformAdmin - who may open the Pathment operator console, and at which
   * tier. This is PLATFORM identity: deliberately orthogonal to every
   * workspace role, so no org role, custom role or capability can ever grant
   * it. One row per user; revoking sets revoked_at instead of deleting, so
   * the grant history stays readable.
   *
   * Tiers (see middlewares/platformAdmin.js for what each one opens):
   *   owner    - everything, including granting/revoking platform admins
   *   billing  - plans, subscriptions, overrides, provisioning
   *   support  - read everything + account-support actions
   *   readonly - read everything, change nothing
   */
  const PlatformAdmin = sequelize.define('PlatformAdmin', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'user_id' },
    role: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'readonly',
      validate: { isIn: [['owner', 'billing', 'support', 'readonly']] },
    },
    grantedBy: { type: DataTypes.UUID, field: 'granted_by' },
    revokedAt: { type: DataTypes.DATE, field: 'revoked_at' },
    revokedBy: { type: DataTypes.UUID, field: 'revoked_by' },
    lastSeenAt: { type: DataTypes.DATE, field: 'last_seen_at' },
  }, { tableName: 'platform_admins', underscored: true });

  PlatformAdmin.associate = (models) => {
    PlatformAdmin.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    PlatformAdmin.belongsTo(models.User, { foreignKey: 'granted_by', as: 'granter' });
  };

  return PlatformAdmin;
};
