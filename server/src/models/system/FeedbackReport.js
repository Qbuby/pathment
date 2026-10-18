module.exports = (sequelize, DataTypes) => {
  /**
   * FeedbackReport - in-app feedback / bug report submitted by any user. Admins
   * triage it through a status and reply with a resolution note (shown back to
   * the reporter, who is notified on every status change).
   */
  const FeedbackReport = sequelize.define('FeedbackReport', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reporterId: { type: DataTypes.UUID, allowNull: false, field: 'reporter_id' },
    reporterRole: { type: DataTypes.STRING(20), allowNull: true, field: 'reporter_role' },
    type: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'bug',
      validate: { isIn: [['bug', 'suggestion', 'other']] },
    },
    /**
     * Who OWNS this report, as opposed to who reported it.
     *
     *   'product'   a Pathment bug or suggestion. The platform console owns the
     *               status; a workspace admin can read it and nothing more.
     *   'workspace' about this organisation's programme, mentor or clan. The
     *               workspace admin owns it, exactly as before.
     *
     * Everything else on this model is a PRODUCT bug report: platform,
     * appVersion, device, pageUrl, userAgent, a screenshot - and the statuses
     * are `planned`, `fixed`, `added`, `declined`. A workspace admin cannot set
     * a bug to fixed, and for as long as the reports landed in their inbox the
     * only thing they could do was reply and close it, so the reporter was
     * emailed a resolution that resolved nothing and whoever could actually fix
     * it never saw the report at all.
     *
     * "What's New" already went the other way for exactly this reason: see the
     * ProductUpdate note in config/tenantOwnership.js. This is the return path
     * on the same channel.
     *
     * Derived from `type` on the server (LANE_BY_TYPE in the service), never
     * taken from a client.
     */
    lane: {
      type: DataTypes.STRING(12), allowNull: false, defaultValue: 'product',
      validate: { isIn: [['product', 'workspace']] },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open',
      validate: { isIn: [['open', 'in_review', 'planned', 'fixed', 'added', 'declined']] },
    },
    priority: {
      type: DataTypes.STRING(10), allowNull: false, defaultValue: 'normal',
      validate: { isIn: [['low', 'normal', 'high']] },
    },
    // Where it happened. A report that does not say is a report somebody has to
    // reply to before they can start, and `userAgent` cannot answer it: it is a
    // browser string, so every report from the phone arrived with it empty.
    platform: {
      type: DataTypes.STRING(16), allowNull: false, defaultValue: 'web',
      validate: { isIn: [['web', 'android', 'ios']] },
    },
    /** Which build. The first question on any bug, and old apps live for months. */
    appVersion: { type: DataTypes.STRING(32), allowNull: true, field: 'app_version' },
    /** "Pixel 7, Android 14". Free text: nothing queries it, a person reads it. */
    device: { type: DataTypes.STRING(120), allowNull: true },
    pageUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'page_url' },
    userAgent: { type: DataTypes.STRING(500), allowNull: true, field: 'user_agent' },
    attachmentUrl: { type: DataTypes.TEXT, allowNull: true, field: 'attachment_url' },
    attachmentType: { type: DataTypes.STRING(20), allowNull: true, field: 'attachment_type' },
    attachmentName: { type: DataTypes.STRING(255), allowNull: true, field: 'attachment_name' },
    resolutionNote: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_note' },
    handledBy: { type: DataTypes.UUID, allowNull: true, field: 'handled_by' },
    handledAt: { type: DataTypes.DATE, allowNull: true, field: 'handled_at' },
  }, {
    tableName: 'feedback_reports',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['status'] }, { fields: ['reporter_id'] },
      { fields: ['type'] }, { fields: ['platform'] },
      // The platform inbox reads across every workspace, filtered to the
      // product lane and usually to what is still open.
      { fields: ['lane', 'status'] },
    ],
  });

  FeedbackReport.associate = (models) => {
    FeedbackReport.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
    FeedbackReport.belongsTo(models.User, { foreignKey: 'handled_by', as: 'handler' });
    /**
     * Deliberately NO belongsTo(Organization).
     *
     * `organization_id` is not declared here - it is injected for every
     * workspace-owned model by the beforeDefine hook in
     * db/workspaceModelAttributes.js. Declaring an association on it makes
     * Sequelize add the column itself, which is invisible at runtime (the hook
     * adds it anyway) and wrong everywhere the hook is absent: migration 114
     * builds the pre-114 schema by loading the model factories WITHOUT that
     * hook, and refused to run because feedback_reports already carried the
     * column it exists to add.
     *
     * The platform inbox resolves workspace names with one explicit lookup
     * instead.
     */
  };

  return FeedbackReport;
};
