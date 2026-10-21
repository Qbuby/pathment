module.exports = (sequelize, DataTypes) => {
  /**
   * TalkReview - mentee feedback and 1-5 rating on an org talk.
   */
  const TalkReview = sequelize.define('TalkReview', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id'
    },
    talkId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'talk_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 }
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'talk_reviews',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['talk_id', 'user_id'] },
      { fields: ['talk_id'] }
    ]
  });

  TalkReview.associate = (models) => {
    TalkReview.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    TalkReview.belongsTo(models.Talk, { foreignKey: 'talk_id', as: 'talk' });
    TalkReview.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return TalkReview;
};
