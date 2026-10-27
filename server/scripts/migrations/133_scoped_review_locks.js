/**
 * Migration: 133_scoped_review_locks
 *
 * Let the review lock apply to a programme or a clan, not only to everything.
 *
 * The cohort-review deletion lock was one boolean in `system_settings`, so it
 * was all-or-nothing for the entire organisation: an admin who wanted to
 * protect the records of a programme that had just closed had to freeze
 * deletion for every mentor in every clan, including the ones mid-cohort. The
 * same went for the unlock grants an admin hands back — a grant was org-wide,
 * so answering "yes, fix that one session" also handed the mentor the whole
 * organisation for the duration.
 *
 * Two changes, both additive:
 *
 *   cohort_review_locks            one row per locked scope. A row means
 *                                  "deletion is locked here". No row means it
 *                                  is not. The org-wide flag stays exactly
 *                                  where it was, so nothing existing moves.
 *
 *   cohort_review_unlock_grants    gains scope_type / scope_id, both NULL for
 *     .scope_type / .scope_id      every existing row, which is what org-wide
 *                                  already meant. An old grant keeps working.
 *
 * Deletion is locked for a session when the org flag is on, OR its clan is
 * locked, OR its clan's programme is locked. A grant lifts it when the grant
 * is org-wide, or names that clan, or names that clan's programme.
 *
 * Idempotent: the table and each column are created only when missing.
 *
 * Run:      node server/scripts/migrations/133_scoped_review_locks.js
 * Preview:  node server/scripts/migrations/133_scoped_review_locks.js --dry-run
 * Rollback: node server/scripts/migrations/133_scoped_review_locks.js --rollback
 */
const sequelize = require('./_db');

const GRANT_COLUMNS = [
  { name: 'scope_type', ddl: 'VARCHAR(10)' },
  { name: 'scope_id', ddl: 'UUID' },
];

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = :name`,
    { replacements: { name } },
  );
  return rows.length > 0;
}

async function existingGrantColumns() {
  const [rows] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cohort_review_unlock_grants' AND column_name IN (:c)`,
    { replacements: { c: GRANT_COLUMNS.map((c) => c.name) } },
  );
  return new Set(rows.map((r) => r.column_name));
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 133: scoped review locks\n');

  const hasTable = await tableExists('cohort_review_locks');
  const present = await existingGrantColumns();
  const missing = GRANT_COLUMNS.filter((c) => !present.has(c.name));

  if (hasTable && !missing.length) {
    console.log('  ℹ Already applied — nothing to do.');
    return;
  }

  if (dryRun) {
    if (!hasTable) console.log('Would create cohort_review_locks (org, scope_type, scope_id, locked_by).');
    missing.forEach((c) => console.log(`Would add cohort_review_unlock_grants.${c.name} ${c.ddl} NULL.`));
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  if (!hasTable) {
    await sequelize.query(`
      CREATE TABLE cohort_review_locks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        scope_type VARCHAR(10) NOT NULL,
        scope_id UUID NOT NULL,
        locked_by UUID NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    // One lock per scope: locking twice is the same state, not a second row.
    await sequelize.query(`
      CREATE UNIQUE INDEX cohort_review_locks_scope_key
        ON cohort_review_locks (organization_id, scope_type, scope_id)`);
    console.log('  ✓ Created cohort_review_locks');
  }

  for (const column of missing) {
    await sequelize.query(
      `ALTER TABLE cohort_review_unlock_grants ADD COLUMN ${column.name} ${column.ddl}`);
    console.log(`  ✓ Added cohort_review_unlock_grants.${column.name}`);
  }
  console.log('\n  Existing grants keep scope_type NULL, which is what org-wide already meant.');
}

async function down() {
  await sequelize.query('DROP TABLE IF EXISTS cohort_review_locks');
  for (const column of GRANT_COLUMNS) {
    await sequelize.query(
      `ALTER TABLE cohort_review_unlock_grants DROP COLUMN IF EXISTS ${column.name}`);
  }
  console.log('  ✓ Rolled back: scoped locks removed, org-wide flag untouched.');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
