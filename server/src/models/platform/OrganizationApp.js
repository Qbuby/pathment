module.exports = (sequelize, DataTypes) => {
  /**
   * OrganizationApp - one row per (workspace, external app) connection. The row
   * existing means the workspace connected the app; disconnecting deletes it.
   * For integration-backed apps it also holds the credentials the provider
   * verified (encrypted; only credentialsMasked is ever shown) and `status`
   * flips to 'error' when the provider later rejects them.
   */
  const OrganizationApp = sequelize.define('OrganizationApp', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
    connectedBy: { type: DataTypes.UUID, allowNull: true, field: 'connected_by' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'connected',
      validate: { isIn: [['connected', 'error']] }
    },
    credentialsEncrypted: { type: DataTypes.TEXT, allowNull: true, field: 'credentials_encrypted' },
    credentialsMasked: { type: DataTypes.STRING(60), allowNull: true, field: 'credentials_masked' },
    // What the provider reported at verification (e.g. Buildment organization_slug).
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    lastVerifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_verified_at' }
  }, {
    tableName: 'organization_apps',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['organization_id', 'app_id'] },
      { fields: ['app_id'] }
    ]
  });

  OrganizationApp.associate = (models) => {
    OrganizationApp.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    OrganizationApp.belongsTo(models.ExternalApp, { foreignKey: 'app_id', as: 'app' });
    OrganizationApp.belongsTo(models.User, { foreignKey: 'connected_by', as: 'connector' });
  };

  return OrganizationApp;
};
