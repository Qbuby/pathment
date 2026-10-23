/**
 * HandoverPoolEntry — one mentee offered from one clan to any other
 * (migration 141).
 *
 * The between-clan handover, as distinct from CandidatePool, which is the
 * pre-clan selection round. A mentor who cannot carry on pushes; a mentor with
 * room pulls.
 *
 * An open entry is an OFFER and nothing more. The mentee stays where they are,
 * with their mentor and their work, for as long as it sits unanswered — so no
 * one is ever stranded between clans, and a withdrawal costs nothing. The whole
 * move happens inside the claim.
 *
 * `programId` is denormalised off the source clan deliberately: it is the scope
 * key for every read, and it must survive the source clan being frozen when its
 * programme closes — which is the single most likely reason for the push.
 *
 * `status` is a plain string, not an enum type, so adding an outcome later is a
 * code change rather than a migration on a live type.
 */
const STATUSES = ['open', 'claimed', 'withdrawn'];

/**
 * Why they are being handed over. Shown to the pulling mentor, who deserves to
 * know whether they are picking up somebody's finished cohort or a fit that did
 * not work, and counted in the admin view.
 */
const REASONS = [
  'program_closed',   // the clan's programme ended and the mentor is not continuing
  'mentor_leaving',   // the mentor is stepping away
  'capacity',         // more mentees than the mentor can carry
  'fit',              // the pairing is not working
  'mentee_request',   // the mentee asked to move
  'other',
];

module.exports = (sequelize, DataTypes) => {
  const HandoverPoolEntry = sequelize.define('HandoverPoolEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    fromClanId: { type: DataTypes.UUID, allowNull: true, field: 'from_clan_id' },
    programId: { type: DataTypes.UUID, allowNull: true, field: 'program_id' },
    pushedBy: { type: DataTypes.UUID, allowNull: false, field: 'pushed_by' },
    reason: { type: DataTypes.STRING(40), allowNull: true, validate: { isIn: [REASONS] } },
    /** For the next mentor: where they got to, what they are stuck on. */
    handoverNote: { type: DataTypes.TEXT, allowNull: true, field: 'handover_note' },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open',
      validate: { isIn: [STATUSES] },
    },
    claimedBy: { type: DataTypes.UUID, allowNull: true, field: 'claimed_by' },
    claimedClanId: { type: DataTypes.UUID, allowNull: true, field: 'claimed_clan_id' },
    claimedAt: { type: DataTypes.DATE, allowNull: true, field: 'claimed_at' },
    withdrawnBy: { type: DataTypes.UUID, allowNull: true, field: 'withdrawn_by' },
    withdrawnAt: { type: DataTypes.DATE, allowNull: true, field: 'withdrawn_at' },
    /** What the claim carried: { tasks, submissions, feedback, progress }. */
    carried: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'handover_pool_entries',
    underscored: true,
    indexes: [
      // One LIVE offer per mentee per programme; settled rows stay as history.
      { unique: true, fields: ['mentee_id', 'program_id'], where: { status: 'open' } },
      { fields: ['status', 'program_id', 'created_at'] },
      { fields: ['mentee_id'] },
      { fields: ['from_clan_id'] },
    ],
  });

  HandoverPoolEntry.STATUSES = STATUSES;
  HandoverPoolEntry.REASONS = REASONS;

  HandoverPoolEntry.associate = (models) => {
    HandoverPoolEntry.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    HandoverPoolEntry.belongsTo(models.User, { foreignKey: 'pushed_by', as: 'pusher' });
    HandoverPoolEntry.belongsTo(models.User, { foreignKey: 'claimed_by', as: 'claimer' });
    HandoverPoolEntry.belongsTo(models.Clan, { foreignKey: 'from_clan_id', as: 'fromClan' });
    HandoverPoolEntry.belongsTo(models.Clan, { foreignKey: 'claimed_clan_id', as: 'claimedClan' });
    HandoverPoolEntry.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
  };

  return HandoverPoolEntry;
};
