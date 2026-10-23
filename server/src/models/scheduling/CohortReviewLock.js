module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewLock - deletion locked for one programme or one clan.
   *
   * The presence of a row IS the lock; removing it unlocks. That keeps the
   * state unambiguous: there is no "locked: false" row to disagree with a
   * missing one, and the unique index means locking twice is the same state
   * rather than a second row.
   *
   * The ORG-wide lock is deliberately not stored here. It lives where it
   * always has, as a `system_settings` flag, so every existing organisation
   * keeps exactly the lock it had.
   */
  const CohortReviewLock = sequelize.define('CohortReviewLock', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    /** 'program' | 'clan' — the org-wide case is the settings flag, not a row. */
    scopeType: { type: DataTypes.STRING(10), allowNull: false, field: 'scope_type' },
    scopeId: { type: DataTypes.UUID, allowNull: false, field: 'scope_id' },
    lockedBy: { type: DataTypes.UUID, allowNull: true, field: 'locked_by' },
  }, {
    tableName: 'cohort_review_locks',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['organization_id', 'scope_type', 'scope_id'] }],
  });

  CohortReviewLock.associate = (models) => {
    CohortReviewLock.belongsTo(models.User, { foreignKey: 'locked_by', as: 'lockedByUser' });
  };

  return CohortReviewLock;
};
