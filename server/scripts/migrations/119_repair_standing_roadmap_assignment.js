const sequelize = require('./_db');

/**
 * Repair the two schema invariants needed when a completed cohort's mentee
 * starts the same roadmap again in a standing clan.
 *
 * Migrations 104 and 116 established these invariants for databases that ran
 * them normally. Some long-lived databases were baselined after model sync,
 * however, so the migration names were recorded while the old global roadmap
 * progress index and NOT NULL enrollment columns survived. The resulting
 * unique/not-null violation is surfaced by Sequelize as only "Validation
 * error" in the bulk assignment response.
 *
 * This deliberately idempotent repair gets every deployment to the same shape:
 * - standing progress/tasks may have no program enrollment;
 * - one mentee may have independent progress for the same roadmap per clan;
 * - legacy unscoped progress remains unique.
 */
async function up() {
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });

    await q('ALTER TABLE assigned_tasks ALTER COLUMN enrollment_id DROP NOT NULL');
    await q('ALTER TABLE roadmap_progress ALTER COLUMN enrollment_id DROP NOT NULL');

    // Migration 010's named index blocks a second progress row in Standee.
    // Databases originally created with Sequelize sync use the generated
    // roadmap_progress_roadmap_id_mentee_id name (and include organization_id),
    // so repair both historical shapes before installing the clan-aware rules.
    await q('DROP INDEX IF EXISTS roadmap_progress_roadmap_mentee_unique');
    await q('DROP INDEX IF EXISTS roadmap_progress_roadmap_id_mentee_id');
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS roadmap_progress_roadmap_mentee_clan_unique
      ON roadmap_progress (roadmap_id, mentee_id, clan_id)
      WHERE clan_id IS NOT NULL
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS roadmap_progress_roadmap_mentee_legacy_unique
      ON roadmap_progress (roadmap_id, mentee_id)
      WHERE clan_id IS NULL
    `);
  });
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
