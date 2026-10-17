module.exports = (sequelize, DataTypes) => {
  /**
   * BuyerLead - a "talk to us" enquiry from the marketing site, so the
   * pricing-page funnel ends in a provisioned workspace instead of an inbox.
   * Field names mirror pathment-marketing/lib/buyer-lead.ts exactly.
   *
   * Global (no organizationId): a lead exists before any workspace does. Once
   * an operator provisions from it, provisionedOrganizationId links the two.
   */
  const BuyerLead = sequelize.define('BuyerLead', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, validate: { isEmail: true } },
    fullName: { type: DataTypes.STRING(120), allowNull: false, field: 'full_name' },
    organizationName: { type: DataTypes.STRING(160), allowNull: false, field: 'organization_name' },
    organizationSize: { type: DataTypes.STRING(60), field: 'organization_size' },
    participants: { type: DataTypes.STRING(60) },
    programType: { type: DataTypes.STRING(80), field: 'program_type' },
    launchTimeframe: { type: DataTypes.STRING(80), field: 'launch_timeframe' },
    planInterest: { type: DataTypes.STRING(80), field: 'plan_interest' },
    message: { type: DataTypes.TEXT },
    website: { type: DataTypes.STRING(200) },
    source: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'marketing' },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'new',
      validate: { isIn: [['new', 'contacted', 'qualified', 'provisioned', 'lost']] },
    },
    notes: { type: DataTypes.TEXT },
    provisionedOrganizationId: { type: DataTypes.UUID, field: 'provisioned_organization_id' },
  }, {
    tableName: 'buyer_leads',
    underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['created_at'] }],
  });

  BuyerLead.associate = (models) => {
    BuyerLead.belongsTo(models.Organization, { foreignKey: 'provisioned_organization_id', as: 'provisionedOrganization' });
  };

  return BuyerLead;
};
