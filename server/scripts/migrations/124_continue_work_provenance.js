const sequelize = require('./_db');

/**
 * Provenance + retry safety for "Continue work".
 *
 * A continued assignment is always a new row in the standing clan, while the
 * completed-program row remains untouched. `continued_from_task_id` records
 * that relationship and makes a repeated request idempotent.
 */
async function up() {
  // Keep this outside a transaction: PostgreSQL requires that for CONCURRENTLY,
  // which lets live task writes continue while the indexes are built.
  await sequelize.query(`
    ALTER TABLE assigned_tasks
    ADD COLUMN IF NOT EXISTS continued_from_task_id UUID
  `);
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'assigned_tasks_continued_from_task_id_fkey'
          AND conrelid = 'assigned_tasks'::regclass
      ) THEN
        ALTER TABLE assigned_tasks
        ADD CONSTRAINT assigned_tasks_continued_from_task_id_fkey
        FOREIGN KEY (continued_from_task_id) REFERENCES assigned_tasks(id)
        ON DELETE SET NULL NOT VALID;
      END IF;
    END $$
  `);
  await sequelize.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS assigned_tasks_continued_from_idx
    ON assigned_tasks (continued_from_task_id)
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS assigned_tasks_continuation_unique
    ON assigned_tasks (organization_id, clan_id, mentee_id, continued_from_task_id)
    WHERE continued_from_task_id IS NOT NULL
  `);
  await sequelize.query(`
    ALTER TABLE assigned_tasks
    VALIDATE CONSTRAINT assigned_tasks_continued_from_task_id_fkey
  `);
}

module.exports = { up };

if (require.main === module) {
  up()
    .then(() => sequelize.close())
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
