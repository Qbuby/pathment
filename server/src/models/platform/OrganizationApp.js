module.exports = (sequelize, DataTypes) => {
  /**
   * OrganizationApp - one row per (workspace, external app) connection. The row
   * existing is what "connected" means; disconnecting deletes it.
   */
  const OrganizationApp = sequelize.define('OrganizationApp', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
    connectedBy: { type: DataTypes.UUID, allowNull: true, field: 'connected_by' }
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
