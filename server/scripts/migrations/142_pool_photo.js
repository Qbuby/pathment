/**
 * Migration: 142_pool_photo
 *
 * A pool gets a photo, exactly as a clan has one.
 *
 * A selection round is a place candidates belong to for weeks, and it now
 * appears beside their clans in the mentee workspace picker. A clan there
 * carries its photo; a pool carried a letter in a circle. One column fixes
 * that, and `ClanAvatar` renders both.
 *
 * Nothing else is needed for the points-based scoring that lands with this:
 * a piece of work's points live in the pool's existing `work_items` JSONB,
 * and the difficulty curve lives in `scoring_policy`.
 *
 * Idempotent and additive: an existing pool has no photo, which is what NULL
 * already means.
 *
 * Run:      node server/scripts/migrations/142_pool_photo.js
 * Preview:  node server/scripts/migrations/142_pool_photo.js --dry-run
 * Rollback: node server/scripts/migrations/142_pool_photo.js --rollback
 */
const sequelize = require('./_db');

const STATEMENTS = [
  'ALTER TABLE candidate_pools ADD COLUMN IF NOT EXISTS avatar_url TEXT',
];

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 142: pool photo\n');
  if (dryRun) {
    STATEMENTS.forEach((sql) => console.log(`${sql} …`));
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }
  await sequelize.transaction(async (transaction) => {
    for (const sql of STATEMENTS) await sequelize.query(sql, { transaction });
  });
  console.log('  ✓ candidate_pools.avatar_url');
}

async function down() {
  await sequelize.query('ALTER TABLE candidate_pools DROP COLUMN IF EXISTS avatar_url');
  console.log('  ✓ Dropped candidate_pools.avatar_url');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
