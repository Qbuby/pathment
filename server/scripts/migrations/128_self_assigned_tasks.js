/**
 * Migration: 128_self_assigned_tasks
 *
 * Let a mentee put their own item into a block of their day.
 *
 * "Read chapter 3" is real work and belongs on the plan, but it is not a
 * submission and it is not the mentor's to approve. Without a way to say so,
 * every item a mentee added would arrive in their mentor's approvals queue
 * asking to be reviewed, and a queue that fills with other people's private
 * to-dos stops being read at all.
 *
 * The alternative was to keep these as loose JSON inside the schedule slot.
 * That is cheaper and worse: the item would be invisible to the mentor, carry
 * no history, earn nothing, and vanish the moment the slot was edited — and
 * the product would then have two task systems that disagree with each other.
 * A self-assigned item is an ordinary `assigned_tasks` row, so it keeps the
 * progress log, the clan scoping and the task lifecycle for free. This column
 * is only how it says "do not queue me for review".
 *
 * `assigned_tasks.roadmap_task_id` is NOT NULL, so each one still needs a
 * `roadmap_tasks` row behind it — exactly how `is_custom_task` already works.
 * Nothing new is invented here.
 *
 * FORWARD ONLY in effect: every existing row is mentor-assigned, which is what
 * `false` means, so there is no backfill and no row is read or rewritten.
 *
 * Idempotent: the column is added only when it is missing.
 *
 * Run:      node server/scripts/migrations/128_self_assigned_tasks.js
 * Preview:  node server/scripts/migrations/128_self_assigned_tasks.js --dry-run
 * Rollback: node server/scripts/migrations/128_self_assigned_tasks.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'assigned_tasks';
const COLUMN = 'self_assigned';

async function columnExists() {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: COLUMN } },
  );
  return rows.length > 0;
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 128: self-assigned tasks\n');

  if (await columnExists()) {
    console.log(`  ℹ ${TABLE}.${COLUMN} already exists — nothing to do.`);
    return;
  }

  const [[{ total }]] = await sequelize.query(`SELECT COUNT(*)::int AS total FROM ${TABLE}`);
  console.log(`  ${total} existing task(s); all of them stay mentor-assigned (${COLUMN} = false).`);

  if (dryRun) {
    console.log(`\nWould add ${TABLE}.${COLUMN} BOOLEAN NOT NULL DEFAULT false.`);
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  // DEFAULT false fills every existing row in the same statement, so there is
  // no window where the column is null and no second pass over the table.
  await sequelize.query(
    `ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} BOOLEAN NOT NULL DEFAULT false`);
  console.log(`  ✓ Added ${TABLE}.${COLUMN}`);

  // The read this feature actually makes: "what is in this block today". The
  // slot column is already indexed on its own; pairing it with the mentee keeps
  // one mentee's day off the whole table's index.
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS assigned_tasks_mentee_slot_idx
      ON ${TABLE} (mentee_id, schedule_slot_id)
      WHERE schedule_slot_id IS NOT NULL`);
  console.log('  ✓ Added partial index on (mentee_id, schedule_slot_id)');

  const [after] = await sequelize.query(`
    SELECT ${COLUMN} AS self_assigned, COUNT(*)::int AS tasks FROM ${TABLE} GROUP BY 1`);
  console.table(after);
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS assigned_tasks_mentee_slot_idx');
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
