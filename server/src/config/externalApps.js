/**
 * External app catalog vocabulary. `type` is a Postgres ENUM
 * (enum_external_apps_type) — adding a value here needs a migration that runs
 * ALTER TYPE ... ADD VALUE, and the client mirror in lib/services/apps-api.ts.
 */
const APP_TYPES = ['course', 'communication', 'productivity', 'developer', 'analytics', 'other'];

module.exports = { APP_TYPES };
