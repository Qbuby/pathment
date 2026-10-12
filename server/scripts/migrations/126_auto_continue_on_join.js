/**
 * Migration: 126_auto_continue_on_join
 *
 * Carry a mentee's work into a standing clan automatically when they join,
 * instead of a mentor having to press "continue" and tick boxes.
 *
 * The continuation machinery already exists (`continueWork`, migration 124's
 * `continued_from_task_id`). What changes is who triggers it: adding somebody to
 * a standing clan now brings their in-flight roadmaps and custom work with them,
 * resumed at the step they had reached.
 *
 * FORWARD ONLY — this is the point of the column.
 *
 * Standing clans that were already approved must not change behaviour under
 * their mentors' feet: their rosters were built deliberately, one mentee at a
 * time, and silently generating assignments against them would look like work
 * appearing from nowhere. So the column DEFAULTS TRUE, and this migration sets
 * it FALSE for every clan that exists right now. Only clans created after this
 * runs get the automatic carry; everything already there keeps the manual
 * button and is otherwise untouched.
 *
 * Nothing is backfilled. No existing assignment, membership or progress row is
 * read or written.
 *
 * Idempotent: the column is added only when missing, and the flip only ever
 * targets clans older than the column itself.
 *
 * Run:      node server/scripts/migrations/126_auto_continue_on_join.js
 * Preview:  node server/scripts/migrations/126_auto_continue_on_join.js --dry-run
 * Rollback: node server/scripts/migrations/126_auto_continue_on_join.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'clans';
const COLUMN = 'auto_continue_on_join';

async function columnExists() {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: COLUMN } },
  );
  return rows.length > 0;
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 126: auto-continue on join\n');

  if (await columnExists()) {
    console.log(`  ℹ ${TABLE}.${COLUMN} already exists — the opt-out below has already been applied.`);
    const [after] = await sequelize.query(`
      SELECT kind, ${COLUMN} AS auto, COUNT(*)::int AS clans
        FROM ${TABLE} GROUP BY 1, 2 ORDER BY clans DESC`);
    console.table(after);
    return;
  }

  const [existing] = await sequelize.query(`
    SELECT kind, COUNT(*)::int AS clans FROM ${TABLE} GROUP BY kind ORDER BY clans DESC`);
  console.log('Clans that exist now — all of these are opted OUT, so nothing changes for them:');
  console.table(existing);

  if (dryRun) {
    console.log(`\nWould add ${TABLE}.${COLUMN} (default true) and set it FALSE on every existing clan.`);
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  // Default TRUE so clans created from here on get the behaviour with no code
  // needing to remember to set it.
  await sequelize.query(
    `ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} BOOLEAN NOT NULL DEFAULT true`);
  console.log(`  ✓ Added ${TABLE}.${COLUMN} (default true)`);

  // ...and immediately opt every pre-existing clan out. The order matters: the
  // column has to exist before the flip, and nothing can be created in between
  // because this runs in one statement pair against a live schema change.
  const [, meta] = await sequelize.query(`UPDATE ${TABLE} SET ${COLUMN} = false`);
  console.log(`  ✓ Opted ${meta?.rowCount ?? 0} existing clan(s) out — they behave exactly as before`);

  const [after] = await sequelize.query(`
    SELECT kind, ${COLUMN} AS auto, COUNT(*)::int AS clans
      FROM ${TABLE} GROUP BY 1, 2 ORDER BY clans DESC`);
  console.table(after);
  console.log('Every row above should read auto = false. Anything created after this is true.');
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
