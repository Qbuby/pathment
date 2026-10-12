'use strict';

/**
 * External apps — additive.
 *
 * 1) external_apps: the platform-wide catalog (icon, type, name, description).
 *    `type` is a Postgres ENUM named the way Sequelize names it
 *    (enum_external_apps_type) so db:sync and this migration agree.
 * 2) organization_apps: which workspace has connected which app. One row per
 *    (organization, app); deleting the app or the workspace removes its rows.
 */

const APP_TYPES = ['course', 'communication', 'productivity', 'developer', 'analytics', 'other'];

async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });

    await q(`
      DO $$ BEGIN
        CREATE TYPE enum_external_apps_type AS ENUM (${APP_TYPES.map((t) => `'${t}'`).join(', ')});
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS external_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        type enum_external_apps_type NOT NULL,
        description TEXT,
        icon_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS external_apps_name_lower_uniq
      ON external_apps (lower(name))
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS organization_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        app_id UUID NOT NULL REFERENCES external_apps(id) ON DELETE CASCADE,
        connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT organization_apps_organization_id_app_id UNIQUE (organization_id, app_id)
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS organization_apps_app_id
      ON organization_apps (app_id)
    `);
  });
}

async function down({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });
    await q('DROP TABLE IF EXISTS organization_apps');
    await q('DROP TABLE IF EXISTS external_apps');
    await q('DROP TYPE IF EXISTS enum_external_apps_type');
  });
}

module.exports = { up, down };

if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}
