'use strict';

const Joi = require('joi');

const uuid = Joi.string().uuid();
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const platformSchemas = {
  idParam: Joi.object({ id: uuid.required() }),

  grantAdmin: Joi.object({
    email: Joi.string().email().max(255).required(),
    role: Joi.string().valid('owner', 'billing', 'support', 'readonly').required(),
  }),

  updateAdmin: Joi.object({
    role: Joi.string().valid('owner', 'billing', 'support', 'readonly').required(),
  }),

  auditQuery: Joi.object({
    q: Joi.string().trim().max(120).allow(''),
    action: Joi.string().trim().max(100).allow(''),
    organizationId: uuid.allow(''),
    actorId: uuid.allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),

  organizationsQuery: Joi.object({
    search: Joi.string().trim().max(160).allow(''),
    status: Joi.string().valid('trial', 'active', 'past_due', 'suspended', 'archived').allow(''),
    planKey: Joi.string().trim().max(40).allow(''),
    hasOverrides: Joi.boolean(),
    sort: Joi.string().valid('created', 'name', 'members', 'activity').default('created'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),

  featureUsageQuery: Joi.object({
    days: Joi.number().integer().min(1).max(365).default(30),
  }),

  membersQuery: Joi.object({
    search: Joi.string().trim().max(160).allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),

  provision: Joi.object({
    name: Joi.string().trim().min(2).max(160).required(),
    slug: Joi.string().pattern(SLUG).max(63).required()
      .messages({ 'string.pattern.base': 'Workspace URL must use lowercase letters, numbers, and single hyphens' }),
    timezone: Joi.string().trim().max(80).default('UTC'),
    planKey: Joi.string().trim().max(40).required(),
    billingInterval: Joi.string().valid('monthly', 'annual').default('monthly'),
    trialDays: Joi.number().integer().min(0).max(365).default(0),
    owner: Joi.object({
      email: Joi.string().email().max(255).required(),
      firstName: Joi.string().trim().min(1).max(100).required(),
      lastName: Joi.string().trim().min(1).max(100).required(),
    }).required(),
    leadId: uuid.allow(null, ''),
    reason: Joi.string().trim().max(500).allow('', null),
  }),

  slugQuery: Joi.object({ slug: Joi.string().trim().max(63).required() }),

  activationValidate: Joi.object({ token: Joi.string().trim().min(16).max(255).required() }),

  activationConsume: Joi.object({
    token: Joi.string().trim().min(16).max(255).required(),
    password: Joi.string().min(8).max(128).required()
      .messages({ 'string.min': 'Password must be at least 8 characters' }),
  }),

  organizationStatus: Joi.object({
    status: Joi.string().valid('trial', 'active', 'suspended', 'archived').required(),
    reason: Joi.string().trim().min(3).max(500).required(),
  }),

  overrides: Joi.object({
    limits: Joi.object().pattern(Joi.string().max(40), Joi.alternatives().try(Joi.number().integer().min(-1), Joi.valid(null))).default({}),
    features: Joi.object().pattern(Joi.string().max(40), Joi.alternatives().try(Joi.boolean(), Joi.valid(null))).default({}),
    reason: Joi.string().trim().min(3).max(500).required(),
  }),

  assignPlan: Joi.object({
    planKey: Joi.string().trim().max(40).required(),
    billingInterval: Joi.string().valid('monthly', 'annual'),
    periodEnd: Joi.date().iso().allow(null),
    reason: Joi.string().trim().min(3).max(500).required(),
    // The operator must explicitly accept moving a workspace below its usage.
    acknowledgeOverLimit: Joi.boolean().default(false),
  }),

  activateRequested: Joi.object({
    organizationId: uuid.required(),
    planKey: Joi.string().trim().max(40).required(),
    invoiceReference: Joi.string().trim().min(3).max(120).required(),
    periodEnd: Joi.date().iso().required(),
  }),

  subscriptionPatch: Joi.object({
    status: Joi.string().valid('trialing', 'active', 'past_due', 'paused', 'cancelled'),
    cancelAtPeriodEnd: Joi.boolean(),
    currentPeriodEnd: Joi.date().iso().allow(null),
    trialEndsAt: Joi.date().iso().allow(null),
    reason: Joi.string().trim().min(3).max(500).required(),
  }).min(2),

  planCreate: Joi.object({
    key: Joi.string().trim().pattern(/^[a-z0-9_-]{2,40}$/).required(),
    name: Joi.string().trim().min(2).max(80).required(),
    description: Joi.string().trim().max(2000).allow('', null),
    monthlyPriceCents: Joi.number().integer().min(0).required(),
    annualPriceCents: Joi.number().integer().min(0).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    limits: Joi.object().pattern(Joi.string().max(40), Joi.number().integer().min(-1)).default({}),
    features: Joi.object().pattern(Joi.string().max(40), Joi.boolean()).default({}),
    active: Joi.boolean().default(true),
    sortOrder: Joi.number().integer().min(0).default(0),
  }),

  planUpdate: Joi.object({
    name: Joi.string().trim().min(2).max(80),
    description: Joi.string().trim().max(2000).allow('', null),
    monthlyPriceCents: Joi.number().integer().min(0),
    annualPriceCents: Joi.number().integer().min(0),
    currency: Joi.string().length(3).uppercase(),
    limits: Joi.object().pattern(Joi.string().max(40), Joi.number().integer().min(-1)),
    features: Joi.object().pattern(Joi.string().max(40), Joi.boolean()),
    active: Joi.boolean(),
    sortOrder: Joi.number().integer().min(0),
  }).min(1),

  usersQuery: Joi.object({
    q: Joi.string().trim().min(2).max(160).required(),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),

  userStatus: Joi.object({
    status: Joi.string().valid('active', 'suspended').required(),
    reason: Joi.string().trim().min(3).max(500).required(),
  }),

  leadCreate: Joi.object({
    email: Joi.string().email().max(160).required(),
    fullName: Joi.string().trim().min(2).max(120).required(),
    organizationName: Joi.string().trim().min(2).max(160).required(),
    organizationSize: Joi.string().trim().max(60).allow('', null),
    participants: Joi.string().trim().max(60).allow('', null),
    programType: Joi.string().trim().max(80).allow('', null),
    launchTimeframe: Joi.string().trim().max(80).allow('', null),
    planInterest: Joi.string().trim().max(80).allow('', null),
    message: Joi.string().trim().max(1200).allow('', null),
    website: Joi.string().trim().max(200).allow('', null),
    source: Joi.string().trim().max(40).default('marketing'),
    startedAt: Joi.number().optional(),
  }),

  leadUpdate: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'provisioned', 'lost'),
    notes: Joi.string().trim().max(4000).allow('', null),
  }).min(1),

  leadsQuery: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'provisioned', 'lost').allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),

  queueRetryParam: Joi.object({ id: uuid.required() }),

  jobPatch: Joi.object({ isActive: Joi.boolean().required() }),
};

module.exports = { platformSchemas };
