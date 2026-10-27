'use strict';

/**
 * Retire the legacy system badge catalog.
 *
 * New workspaces no longer receive default badges. Existing untouched defaults
 * are removed when they have never been awarded. Awarded defaults are retained
 * as inactive history so a schema migration never erases a person's record.
 * Customer-created badges are not selected by this migration.
 *
 * This also removes legacy global UNIQUE(name) constraints/indexes. Badge names
 * are unique per workspace via badges_org_name_lower_uniq.
 */

const LEGACY_BADGES_SQL = `
  VALUES
    ('First Steps', 'milestone', 'tasks_completed', '{"count":1}'::jsonb, 10),
    ('Achievement Collector', 'achievement', 'custom', '{"manual":true}'::jsonb, 50),
    ('Quick Learner', 'milestone', 'tasks_completed', '{"count":5}'::jsonb, 25),
    ('Staying Strong', 'streak', 'streak_days', '{"days":7}'::jsonb, 50),
    ('Consistency Master', 'streak', 'streak_days', '{"days":30}'::jsonb, 200),
    ('Rising Star', 'level', 'level_reached', '{"level":3}'::jsonb, 100),
    ('Program Master', 'milestone', 'programs_completed', '{"count":1}'::jsonb, 100),
    ('Points Collector', 'points', 'points_milestone', '{"threshold":500}'::jsonb, 0),
    ('Legend', 'level', 'level_reached', '{"level":5}'::jsonb, 500),
    ('First Steps', 'milestone', 'tasks_completed', '{"count":1}'::jsonb, 20),
    ('On Fire', 'streak', 'streak_days', '{"days":7}'::jsonb, 50),
    ('Halfway Hero', 'progress', 'progress_pct', '{"pct":50}'::jsonb, 75),
    ('Peer Helper', 'community', 'community_kudos', '{"count":1}'::jsonb, 40)
`;

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const query = (sql) => db.query(sql, { transaction });

    const [constraints] = await query(`
      SELECT c.conname AS name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
      WHERE t.relname = 'badges'
        AND c.contype = 'u'
        AND array_length(c.conkey, 1) = 1
        AND a.attname = 'name'
    `);
    for (const { name } of constraints) {
      await query(`ALTER TABLE badges DROP CONSTRAINT IF EXISTS ${quoteIdentifier(name)}`);
    }

    const [indexes] = await query(`
      SELECT i.relname AS name
      FROM pg_index x
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
      WHERE t.relname = 'badges'
        AND x.indisunique
        AND NOT x.indisprimary
        AND x.indnkeyatts = 1
        AND a.attname = 'name'
    `);
    for (const { name } of indexes) {
      await query(`DROP INDEX IF EXISTS ${quoteIdentifier(name)}`);
    }

    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS badges_org_name_lower_uniq
      ON badges (organization_id, lower(name))
    `);

    await query(`
      WITH legacy(name, category, criteria_type, criteria_value, points_reward) AS (${LEGACY_BADGES_SQL})
      DELETE FROM badges badge
      USING legacy
      WHERE badge.name = legacy.name
        AND badge.category = legacy.category
        AND badge.criteria_type = legacy.criteria_type
        AND badge.criteria_value = legacy.criteria_value
        AND badge.points_reward = legacy.points_reward
        AND NOT EXISTS (SELECT 1 FROM user_badges award WHERE award.badge_id = badge.id)
    `);

    await query(`
      WITH legacy(name, category, criteria_type, criteria_value, points_reward) AS (${LEGACY_BADGES_SQL})
      UPDATE badges badge
      SET is_active = false, updated_at = NOW()
      FROM legacy
      WHERE badge.name = legacy.name
        AND badge.category = legacy.category
        AND badge.criteria_type = legacy.criteria_type
        AND badge.criteria_value = legacy.criteria_value
        AND badge.points_reward = legacy.points_reward
        AND badge.is_active = true
    `);
  });
}

// This policy/data migration is intentionally irreversible: deleted unawarded
// defaults must not be recreated, and historical inactive awards stay retired.
async function down() {}

module.exports = { up, down };

if (require.main === module) {
  const db = require('./_db');
  up({ db })
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}
