module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewUnlockGrant - a time-boxed permission an admin issues so a
   * mentor can delete/reopen review sessions while the deletion lock is ON.
   * A grant is "active" when it has not been revoked and has not yet expired.
   * It may cover the whole organisation (no scope) or one programme or clan.
   */
  const CohortReviewUnlockGrant = sequelize.define('CohortReviewUnlockGrant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    grantedBy: { type: DataTypes.UUID, allowNull: true, field: 'granted_by' },
    requestId: { type: DataTypes.UUID, allowNull: true, field: 'request_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    /**
     * Where the grant applies. Both NULL means the whole organisation, which
     * is what every grant meant before scopes existed — so an old row keeps
     * working unchanged. 'program' or 'clan' narrows it to that one place.
     */
    scopeType: { type: DataTypes.STRING(10), allowNull: true, field: 'scope_type' },
    scopeId: { type: DataTypes.UUID, allowNull: true, field: 'scope_id' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
  }, {
    tableName: 'cohort_review_unlock_grants',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['mentor_id'] }, { fields: ['expires_at'] }],
  });

  CohortReviewUnlockGrant.associate = (models) => {
    CohortReviewUnlockGrant.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    CohortReviewUnlockGrant.belongsTo(models.User, { foreignKey: 'granted_by', as: 'granter' });
    CohortReviewUnlockGrant.belongsTo(models.CohortReviewUnlockRequest, { foreignKey: 'request_id', as: 'request' });
  };

  return CohortReviewUnlockGrant;
};
