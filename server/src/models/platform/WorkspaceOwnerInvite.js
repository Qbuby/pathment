module.exports = (sequelize, DataTypes) => {
  /**
   * WorkspaceOwnerInvite - the operator-assisted first-owner activation.
   *
   * When a platform operator provisions a workspace for a customer, the owner
   * account is created without a usable password. This token - emailed as a
   * single-use activation link - is what lets the owner set their own
   * password and verify their inbox in one step. Nothing secret ever travels
   * twice: only the SHA-256 of the token is stored, same as password reset.
   *
   * 72 hours rather than 15 minutes: unlike a sign-in link nobody is waiting
   * on this with the app open - it arrives before the customer's working day
   * does. Resending spends any outstanding invite first, so there is always
   * at most one live link per workspace owner.
   */
  const WorkspaceOwnerInvite = sequelize.define('WorkspaceOwnerInvite', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    usedAt: { type: DataTypes.DATE, field: 'used_at' },
    revokedAt: { type: DataTypes.DATE, field: 'revoked_at' },
    createdBy: { type: DataTypes.UUID, field: 'created_by' },
  }, {
    tableName: 'workspace_owner_invites',
    underscored: true,
    indexes: [{ fields: ['organization_id'] }],
  });

  WorkspaceOwnerInvite.associate = (models) => {
    WorkspaceOwnerInvite.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    WorkspaceOwnerInvite.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return WorkspaceOwnerInvite;
};
