'use strict';

/**
 * External apps + the Buildment course integration — additive.
 *
 * One migration for what used to be two (126_external_apps and
 * 127_buildment_courses). Every statement is idempotent, so a database that
 * already ran either or both of those just has this recorded on top — nothing
 * is recreated and no rows are touched.
 *
 * External apps
 * 1) external_apps: the platform-wide catalog (icon, type, name, description).
 *    `type` is a Postgres ENUM named the way Sequelize names it
 *    (enum_external_apps_type) so db:sync and this migration agree.
 * 2) organization_apps: which workspace has connected which app. One row per
 *    (organization, app); deleting the app or the workspace removes its rows.
 *
 * Buildment courses
 * 3) external_apps.integration_key: which server-side integration (if any)
 *    backs a catalog app. Apps without one cannot be connected yet.
 * 4) organization_apps gains the verified connection: encrypted credentials,
 *    a masked form for display, status, and what the provider said about the
 *    workspace (metadata — e.g. Buildment's organization_slug).
 * 5) course_enrollments: 1:1 with an assigned_task of type 'course'. Holds the
 *    provider's course + enrollment ids, the access lifecycle, and the last
 *    progress snapshot read from the provider (Pathment never writes progress).
 * 6) roadmap_tasks.type accepts 'course' (the CHECK constraint lists every type).
 * 7) The Buildment catalog row, so a workspace has something to connect.
 */

const APP_TYPES = ['course', 'communication', 'productivity', 'developer', 'analytics', 'other'];

async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });

    // ── external apps ─────────────────────────────────────────────────────
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

    // ── Buildment courses ─────────────────────────────────────────────────
    await q('ALTER TABLE external_apps ADD COLUMN IF NOT EXISTS integration_key VARCHAR(40)');
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS external_apps_integration_key_uniq
      ON external_apps (integration_key)
      WHERE integration_key IS NOT NULL
    `);

    await q(`
      ALTER TABLE organization_apps
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'connected',
        ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT,
        ADD COLUMN IF NOT EXISTS credentials_masked VARCHAR(60),
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ
    `);
    await q(`
      DO $$ BEGIN
        ALTER TABLE organization_apps
          ADD CONSTRAINT organization_apps_status_check
          CHECK (status IN ('connected', 'error'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS course_enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        assigned_task_id UUID NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
        provider VARCHAR(40) NOT NULL DEFAULT 'buildment',
        course_id VARCHAR(120) NOT NULL,
        course_slug VARCHAR(255),
        course_title VARCHAR(255) NOT NULL,
        learner_email VARCHAR(255) NOT NULL,
        external_enrollment_id VARCHAR(120),
        lifecycle VARCHAR(30) NOT NULL DEFAULT 'PENDING_ACCOUNT',
        progress_status VARCHAR(20),
        overall_progress INTEGER NOT NULL DEFAULT 0,
        completed_lessons INTEGER,
        total_lessons INTEGER,
        current_chapter JSONB,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS course_enrollments_org_assigned_task_id_uniq
      ON course_enrollments (organization_id, assigned_task_id)
    `);
    await q('CREATE INDEX IF NOT EXISTS course_enrollments_organization_idx ON course_enrollments (organization_id)');
    await q('CREATE INDEX IF NOT EXISTS course_enrollments_lifecycle ON course_enrollments (lifecycle)');

    // Widen only: every type already stored stays valid.
    await q('ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check"');
    await q(`
      ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check"
      CHECK (type IN ('article','interactive','reading','video','exercise','project','quiz','discussion','practical','assessment','custom','assignment','interview','open_source','course'))
    `);

    await q(`
      UPDATE external_apps SET integration_key = 'buildment', updated_at = NOW()
      WHERE lower(name) = 'buildment' AND integration_key IS NULL
    `);
    await q(`
      INSERT INTO external_apps (name, type, description, integration_key)
      SELECT 'Buildment', 'course',
        'Assign Buildment courses to mentees as tasks and track their progress here.',
        'buildment'
      WHERE NOT EXISTS (SELECT 1 FROM external_apps WHERE integration_key = 'buildment')
    `);
  });
}

async function down({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });

    // ── Buildment courses ─────────────────────────────────────────────────
    await q('DROP TABLE IF EXISTS course_enrollments');
    // NOT VALID: course tasks created meanwhile must not block the rollback.
    await q('ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check"');
    await q(`
      ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check"
      CHECK (type IN ('article','interactive','reading','video','exercise','project','quiz','discussion','practical','assessment','custom','assignment','interview','open_source')) NOT VALID
    `);

    // ── external apps (takes the integration columns and indexes with it) ──
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
