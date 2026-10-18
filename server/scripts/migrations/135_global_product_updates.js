/**
 * Migration: 135_global_product_updates
 *
 * Product updates ("What's New") become GLOBAL again. Migration 114 stamped
 * product_updates with a NOT NULL organization_id like every workspace-owned
 * table, but the entries describe the PRODUCT - a feature shipped for every
 * workspace at once - and authoring them moved to the platform console. With
 * ProductUpdate removed from WORKSPACE_MODELS the model no longer writes the
 * column, so the NOT NULL constraint has to go; the column itself stays, both
 * for rollback and because the historical values are harmless.
 *
 * Existing rows keep their organization_id, but the feed no longer filters on
 * it: entries authored in one workspace before this migration are now visible
 * to every workspace, which matches what they always claimed to be.
 *
 * Idempotent: DROP NOT NULL is safe to run twice.
 *
 * Run:      node server/scripts/migrations/135_global_product_updates.js
 * Preview:  node server/scripts/migrations/135_global_product_updates.js --dry-run
 * Rollback: node server/scripts/migrations/135_global_product_updates.js --rollback
 */
const sequelize = require('./_db');

async function up(dryRun) {
  const ddl = 'ALTER TABLE product_updates ALTER COLUMN organization_id DROP NOT NULL';
  if (dryRun) { console.log(`[dry-run] would run: ${ddl}`); return; }
  await sequelize.query(ddl);
  console.log('135_global_product_updates applied');
}

async function down() {
  // Restore the constraint: rows written while global get the default
  // workspace, because NOT NULL cannot come back over NULLs.
  await sequelize.query(`
    UPDATE product_updates SET organization_id = (
      SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1
    ) WHERE organization_id IS NULL
  `);
  await sequelize.query('ALTER TABLE product_updates ALTER COLUMN organization_id SET NOT NULL');
  console.log('135_global_product_updates rolled back');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rollback = process.argv.includes('--rollback');
  if (rollback) await down();
  else await up(dryRun);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { up, down };
