/**
 * Migration: 130_task_repeat_rule
 *
 * Let one item on a plan repeat — "post on LinkedIn every Wednesday".
 *
 * A schedule SLOT could already repeat: `recurringSlotMaterializer` turns a
 * slot's config into tasks on a cadence. An item inside a block could not, so
 * anything recurring needed a whole block of its own or had to be re-added by
 * hand every week.
 *
 * The rule lives on the task rather than in a scheduler, and the next
 * occurrence is written the moment one is finished. Nothing has to be running
 * for a repeat to work, nothing drifts if a worker misses a tick, and a repeat
 * nobody ever completes stops by itself instead of piling up — which is what
 * people expect from a to-do that repeats, and the opposite of what a cron
 * would give them.
 *
 * Shape (see src/utils/repeatRule.js, which owns the reading and the maths):
 *   { freq: 'daily'|'weekly'|'monthly', interval: 1, days?: [0-6], until?: 'YYYY-MM-DD' }
 *
 * NULL means "does not repeat", which is every task that exists today, so there
 * is no backfill and no row is read or rewritten.
 *
 * Idempotent: the column is added only when missing.
 *
 * Run:      node server/scripts/migrations/130_task_repeat_rule.js
 * Preview:  node server/scripts/migrations/130_task_repeat_rule.js --dry-run
 * Rollback: node server/scripts/migrations/130_task_repeat_rule.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'assigned_tasks';
const COLUMN = 'repeat_rule';

async function columnExists() {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: COLUMN } },
  );
  return rows.length > 0;
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 130: repeating plan items\n');

  if (await columnExists()) {
    console.log(`  ℹ ${TABLE}.${COLUMN} already exists — nothing to do.`);
    return;
  }

  const [[{ total }]] = await sequelize.query(`SELECT COUNT(*)::int AS total FROM ${TABLE}`);
  console.log(`  ${total} existing task(s); all stay one-off (${COLUMN} IS NULL).`);

  if (dryRun) {
    console.log(`\nWould add ${TABLE}.${COLUMN} JSONB NULL.`);
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  await sequelize.query(`ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} JSONB`);
  console.log(`  ✓ Added ${TABLE}.${COLUMN}`);

  // Only repeating tasks are ever scanned, and they are a small minority of the
  // table — so the index carries just them.
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS assigned_tasks_repeating_idx
      ON ${TABLE} (mentee_id)
      WHERE ${COLUMN} IS NOT NULL`);
  console.log('  ✓ Added partial index for repeating tasks');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS assigned_tasks_repeating_idx');
  await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${COLUMN}`);
  console.log(`  ✓ Dropped ${TABLE}.${COLUMN} and its index`);
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
