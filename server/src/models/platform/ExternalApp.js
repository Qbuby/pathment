const { APP_TYPES } = require('../../config/externalApps');

module.exports = (sequelize, DataTypes) => {
  /**
   * ExternalApp - the platform-wide catalog of third-party apps a workspace can
   * connect (global, like Plan: one row is shared by every organization). Which
   * workspace has connected which app lives in organization_apps.
   */
  const ExternalApp = sequelize.define('ExternalApp', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    type: { type: DataTypes.ENUM(...APP_TYPES), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    iconUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'icon_url' },
    // Inactive apps stay in the catalog but are hidden from workspaces.
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'external_apps',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, name: 'external_apps_name_lower_uniq', fields: [sequelize.fn('lower', sequelize.col('name'))] }
    ]
  });

  ExternalApp.associate = (models) => {
    ExternalApp.hasMany(models.OrganizationApp, { foreignKey: 'app_id', as: 'connections' });
  };

  return ExternalApp;
};
