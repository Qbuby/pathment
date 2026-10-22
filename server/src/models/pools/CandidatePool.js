/**
 * CandidatePool — a selection round for people who are on the platform but not
 * yet in a clan (migration 140).
 *
 * Bound to a programme, which is the scope every `pool.*` permission is
 * checked at. The pool decides nothing on its own: it holds the configuration
 * (dates, quota, scoring weights, reminder schedule) and the list of work the
 * operators give its candidates.
 *
 * `workItems` — the qualifying work, one entry per piece:
 *   { id, kind: 'task'|'quiz'|'interview', roadmapTaskId, title, componentKey,
 *     required, dueAt, config, createdById, createdAt, cancelledAt }
 * Each piece has its own task template (`roadmapTaskId`); every member's
 * AssignedTask points at it, which is how a task is traced back to its piece
 * of work and how scoring knows which component it feeds.
 */
const POOL_STATUSES = ['draft', 'open', 'qualifying', 'reviewing', 'placing', 'closed'];
const WORK_KINDS = ['task', 'quiz', 'interview'];

module.exports = (sequelize, DataTypes) => {
  const CandidatePool = sequelize.define('CandidatePool', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    cohortId: { type: DataTypes.UUID, allowNull: true, field: 'cohort_id' },
    name: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft',
      validate: { isIn: [POOL_STATUSES] },
    },
    // How many people the pool may hold. NULL = no limit.
    capacity: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
    // How many the proposed shortlist selects. Never hard-coded.
    selectionQuota: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'selection_quota', validate: { min: 1 } },
    opensAt: { type: DataTypes.DATE, allowNull: true, field: 'opens_at' },
    closesAt: { type: DataTypes.DATE, allowNull: true, field: 'closes_at' },
    qualificationDueAt: { type: DataTypes.DATE, allowNull: true, field: 'qualification_due_at' },
    // { version, components: [{ key, label, weight, source, required, max }] }
    // Validated by poolService.validateScoringPolicy before it is stored.
    scoringPolicy: {
      type: DataTypes.JSONB, allowNull: false, field: 'scoring_policy',
      defaultValue: { version: 1, components: [] },
    },
    // { enabled, inviteAfterDays, inviteMaxCount, dueSoonHours, inactivityDays, inactivityMaxCount }
    reminderPolicy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'reminder_policy' },
    // { awardPoints, autoAssignOnActivation, waitlistSize, targetClanIds }
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    workItems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'work_items' },
    createdById: { type: DataTypes.UUID, allowNull: true, field: 'created_by_id' },
    archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
  }, {
    tableName: 'candidate_pools',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['status'] },
    ],
  });

  CandidatePool.STATUSES = POOL_STATUSES;
  CandidatePool.WORK_KINDS = WORK_KINDS;

  CandidatePool.associate = (models) => {
    CandidatePool.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    CandidatePool.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    CandidatePool.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
    CandidatePool.hasMany(models.PoolMember, { foreignKey: 'pool_id', as: 'members' });
  };

  return CandidatePool;
};
