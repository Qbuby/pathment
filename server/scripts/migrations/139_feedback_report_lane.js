/**
 * Migration: 139_feedback_report_lane
 *
 * Give every feedback report an owner.
 *
 * `feedback_reports` is a product bug tracker wearing a workspace's clothes.
 * It collects `platform` (web/android/ios), `app_version`, `device`,
 * `page_url`, `user_agent` and a screenshot, and its statuses are `planned`,
 * `fixed`, `added`, `declined`. Every row was tenant-owned, so a report landed
 * in the reporting organisation's own admin board - where a mentoring
 * organisation's admin could do precisely nothing about a bug in Pathment
 * except reply and close it. The reporter was then emailed a resolution that
 * resolved nothing, and whoever could actually fix it never saw the report
 * unless they happened to log into that workspace.
 *
 * "What's New" already went the other way for exactly this reason: ProductUpdate
 * is deliberately absent from config/tenantOwnership.js, because an entry
 * describes the PRODUCT and is authored once for every workspace. This is the
 * return path on the same channel.
 *
 * `lane` names the owner:
 *   'product'    a Pathment bug or suggestion. The platform console owns the
 *                status; the workspace admin reads it.
 *   'workspace'  about this organisation's programme, mentor or clan. The
 *                workspace admin owns it, exactly as before.
 *
 * The backfill keeps today's reports where their type says they belong:
 * bug and suggestion are about the software; 'other' is the lane the drawer now
 * labels "help with my programme", and leaving those with the workspace admin
 * preserves what they can already act on. `organization_id` stays on every
 * row - it is how a workspace admin still reads their own people's reports,
 * and it is the first column of the platform inbox.
 *
 * Run:      node server/scripts/migrations/139_feedback_report_lane.js
 * Preview:  node server/scripts/migrations/139_feedback_report_lane.js --dry-run
 * Rollback: node server/scripts/migrations/139_feedback_report_lane.js --rollback
 */
const sequelize = require('./_db');

const SPLIT = `
  SELECT type, COUNT(*) AS n
    FROM feedback_reports
   GROUP BY type
   ORDER BY n DESC`;

async function up({ dryRun = false } = {}) {
  const [split] = await sequelize.query(SPLIT);
  const lane = (type) => (type === 'other' ? 'workspace' : 'product');
  console.log('Existing reports, and where each type lands:');
  if (!split.length) console.log('  (none yet)');
  for (const row of split) console.log(`  ${String(row.type).padEnd(12)} ${String(row.n).padStart(5)} -> ${lane(row.type)}`);

  if (dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }

  await sequelize.query(`
    ALTER TABLE feedback_reports
      ADD COLUMN IF NOT EXISTS lane VARCHAR(12) NOT NULL DEFAULT 'product'`);
  console.log('\n  ✓ lane column added (defaults to product)');

  const [, meta] = await sequelize.query(`
    UPDATE feedback_reports SET lane = 'workspace' WHERE type = 'other'`);
  console.log(`  ✓ ${meta?.rowCount ?? 0} 'other' report(s) left with their workspace admin`);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS feedback_reports_lane_status_idx
      ON feedback_reports (lane, status)`);
  console.log('  ✓ (lane, status) index added for the cross-workspace inbox');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS feedback_reports_lane_status_idx');
  await sequelize.query('ALTER TABLE feedback_reports DROP COLUMN IF EXISTS lane');
  console.log('  ✓ lane column and index dropped');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
