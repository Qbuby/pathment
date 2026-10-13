/**
 * Migration: 129_mentee_selectable_templates
 *
 * Let an org publish day-shapes a mentee may pick for themselves.
 *
 * Templates have always been something done TO a mentee: an admin writes one,
 * a mentor assigns it. Plenty of them are not instructions though — "Evening
 * study", "Weekend sprint" — and a mentee who knows they work evenings should
 * be able to take one without asking anybody.
 *
 * This is opt-in per template rather than a blanket rule, because some
 * templates genuinely are the programme's shape and should only arrive from a
 * mentor. DEFAULT false keeps every template that exists today exactly as
 * private as it is now; an admin ticks the ones they want to offer.
 *
 * Applying a template a mentee chose MERGES into their day — it never replaces
 * it — so a mentor's blocks cannot be wiped out by somebody browsing the
 * library. That rule lives in `scheduleBoardService.applyTemplate`.
 *
 * Idempotent: the column is added only when missing. No row is read or
 * rewritten.
 *
 * Run:      node server/scripts/migrations/129_mentee_selectable_templates.js
 * Preview:  node server/scripts/migrations/129_mentee_selectable_templates.js --dry-run
 * Rollback: node server/scripts/migrations/129_mentee_selectable_templates.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'schedule_templates';
const COLUMN = 'mentee_selectable';

async function columnExists() {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: COLUMN } },
  );
  return rows.length > 0;
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 129: mentee-selectable templates\n');

  if (await columnExists()) {
    console.log(`  ℹ ${TABLE}.${COLUMN} already exists — nothing to do.`);
    return;
  }

  const [existing] = await sequelize.query(`
    SELECT source, COUNT(*)::int AS templates FROM ${TABLE} GROUP BY source ORDER BY templates DESC`);
  console.log('Templates that exist now — all stay private until an admin offers them:');
  console.table(existing);

  if (dryRun) {
    console.log(`\nWould add ${TABLE}.${COLUMN} BOOLEAN NOT NULL DEFAULT false.`);
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  await sequelize.query(
    `ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} BOOLEAN NOT NULL DEFAULT false`);
  console.log(`  ✓ Added ${TABLE}.${COLUMN} (default false — nothing is offered until chosen)`);
}

async function down() {
  await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${COLUMN}`);
  console.log(`  ✓ Dropped ${TABLE}.${COLUMN}`);
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
