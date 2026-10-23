module.exports = (sequelize, DataTypes) => {
  /**
   * CourseEnrollment - 1:1 with an `assigned_task` of type 'course'. Links the
   * task to a course on an external provider (Buildment) and caches what the
   * provider last told us: the access `lifecycle` and a progress snapshot.
   *
   * The provider is the source of truth for all of it. Pathment only reads —
   * the assigned task's id is the provider-side `external_assignment_id`, so
   * retries and cancellation always address the same enrollment.
   */
  const CourseEnrollment = sequelize.define('CourseEnrollment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    assignedTaskId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'assigned_task_id' },
    provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'buildment' },
    // Provider ids — opaque strings, never Pathment UUIDs.
    courseId: { type: DataTypes.STRING(120), allowNull: false, field: 'course_id' },
    courseSlug: { type: DataTypes.STRING(255), allowNull: true, field: 'course_slug' },
    courseTitle: { type: DataTypes.STRING(255), allowNull: false, field: 'course_title' },
    learnerEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'learner_email' },
    externalEnrollmentId: { type: DataTypes.STRING(120), allowNull: true, field: 'external_enrollment_id' },
    // Access state. PENDING_ACCOUNT is a SUCCESSFUL enrollment whose learner has
    // not signed up on the provider yet — never treat it as a failure.
    lifecycle: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'PENDING_ACCOUNT',
      validate: { isIn: [['PENDING_ACCOUNT', 'PAYMENT_REQUIRED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']] }
    },
    // Progress snapshot (NOT_STARTED | IN_PROGRESS | COMPLETED, 0–100).
    progressStatus: { type: DataTypes.STRING(20), allowNull: true, field: 'progress_status' },
    overallProgress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'overall_progress' },
    completedLessons: { type: DataTypes.INTEGER, allowNull: true, field: 'completed_lessons' },
    totalLessons: { type: DataTypes.INTEGER, allowNull: true, field: 'total_lessons' },
    currentChapter: { type: DataTypes.JSONB, allowNull: true, field: 'current_chapter' },
    lastSyncedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_synced_at' }
  }, {
    tableName: 'course_enrollments',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['lifecycle'] }
    ]
  });

  CourseEnrollment.associate = (models) => {
    CourseEnrollment.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
  };

  return CourseEnrollment;
};
