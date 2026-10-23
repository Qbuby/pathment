module.exports = (sequelize, DataTypes) => {
  /**
   * PlatformAuditLog - append-only evidence of every operator action.
   *
   * Deliberately NOT AuditLog: that table requires an organization_id, and a
   * platform action (plan price edit, admin grant) often has none. The org
   * reference here is nullable and named targetOrganizationId specifically so
   * the tenant-scope hooks in db/organizationScope.js never treat these rows
   * as workspace-owned - the console reads them with no workspace context.
   *
   * Append-only is enforced at the model boundary: updates and deletes throw.
   * Operators cannot tidy their own trail, and the data-retention sweeps
   * (which only touch audit_logs) never reach it.
   */
  const PlatformAuditLog = sequelize.define('PlatformAuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorId: { type: DataTypes.UUID, field: 'actor_id' },
    // Kept as text too: an actor row deleted later must not anonymise history.
    actorEmail: { type: DataTypes.STRING(255), field: 'actor_email' },
    action: { type: DataTypes.STRING(100), allowNull: false },
    targetType: { type: DataTypes.STRING(50), allowNull: false, field: 'target_type' },
    targetId: { type: DataTypes.STRING(80), field: 'target_id' },
    targetOrganizationId: { type: DataTypes.UUID, field: 'target_organization_id' },
    oldValues: { type: DataTypes.JSONB, field: 'old_values' },
    newValues: { type: DataTypes.JSONB, field: 'new_values' },
    reason: { type: DataTypes.TEXT },
    ipAddress: { type: DataTypes.STRING(45), field: 'ip_address' },
    userAgent: { type: DataTypes.TEXT, field: 'user_agent' },
  }, {
    tableName: 'platform_audit_logs',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['action'] },
      { fields: ['target_organization_id'] },
      { fields: ['actor_id'] },
    ],
  });

  const refuse = () => { throw new Error('Platform audit entries are append-only'); };
  PlatformAuditLog.addHook('beforeUpdate', refuse);
  PlatformAuditLog.addHook('beforeDestroy', refuse);
  PlatformAuditLog.addHook('beforeBulkUpdate', refuse);
  PlatformAuditLog.addHook('beforeBulkDestroy', refuse);

  PlatformAuditLog.associate = (models) => {
    PlatformAuditLog.belongsTo(models.User, { foreignKey: 'actor_id', as: 'actor' });
    PlatformAuditLog.belongsTo(models.Organization, { foreignKey: 'target_organization_id', as: 'targetOrganization' });
  };

  return PlatformAuditLog;
};
