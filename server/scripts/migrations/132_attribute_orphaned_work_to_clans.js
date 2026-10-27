/**
 * Migration: 132_attribute_orphaned_work_to_clans
 *
 * Give a mentee's work back the clan it happened in.
 *
 * `assigned_tasks.clan_id` and `blockers.clan_id` are nullable, and a great
 * deal of work carries neither: it was assigned before clans were attributed,
 * or to a mentee who had no membership row at the time. Every clan-scoped read
 * in the product filters on that column, so those rows are invisible to all of
 * them while the mentee's own profile — which counts by mentee, not by clan —
 * still lists them. That is how the work-history panel came to say "0 of 0
 * tasks done" about a mentee with twenty-three tasks.
 *
 * This attributes only what can be attributed WITHOUT GUESSING. A row is moved
 * when exactly one clan can possibly own it:
 *
 *   1. Tasks, by enrolment. The task carries an `enrollment_id` and exactly one
 *      of the mentee's clan memberships was created for that enrolment. This is
 *      the strongest signal there is — the membership and the task name the
 *      same enrolment.
 *   2. Tasks, by sole membership. The mentee has been in exactly one clan,
 *      ever, and it is a COHORT. A standing clan is deliberately excluded: a
 *      mentee moved into one has older cohort work that does not belong to it,
 *      and attributing it there would recreate the very leak that made a
 *      standing clan show the previous clan's tasks. This mirrors the rule
 *      `menteeClanScope.clanScopedWhere` already applies on read.
 *   3. Blockers, by their task. The blocker points at an assigned task that now
 *      has a clan.
 *   4. Blockers, by sole membership. As rule 2.
 *
 * Anything left genuinely cannot be placed — a mentee with several clans and
 * work that names none of them. Those rows are counted and reported, and
 * `menteeRecordService` shows them as unattributed rather than dropping them.
 *
 * Organisation boundaries are honoured explicitly: a row is only ever matched
 * to a clan in its own organisation.
 *
 * Idempotent: only ever touches rows where `clan_id IS NULL`.
 *
 * Run:      node server/scripts/migrations/132_attribute_orphaned_work_to_clans.js
 * Preview:  node server/scripts/migrations/132_attribute_orphaned_work_to_clans.js --dry-run
 * Rollback: not reversible — see down().
 */
const sequelize = require('./_db');

/** Statuses that mean "this person was in this clan". Mirrors config/membership. */
const HISTORICAL = `('active', 'paused', 'removed')`;

/**
 * The one clan a mentee has ever been a mentee in, when there is exactly one
 * and it is a cohort. `HAVING count(DISTINCT clan_id) = 1` is what makes this
 * safe: a mentee in two clans is never matched by it, so the `array_agg`
 * below — Postgres has no `min()` for uuid — can only ever pick the one value
 * the HAVING already proved unique.
 */
const SOLE_COHORT_CLAN = `
  SELECT cm.user_id,
         (array_agg(DISTINCT cm.clan_id))[1] AS clan_id,
         (array_agg(DISTINCT cm.organization_id))[1] AS organization_id
    FROM clan_memberships cm
    JOIN clans c ON c.id = cm.clan_id
   WHERE cm.role = 'mentee'
     AND cm.status IN ${HISTORICAL}
     AND c.kind = 'cohort'
   GROUP BY cm.user_id
  HAVING count(DISTINCT cm.clan_id) = 1
     AND count(DISTINCT cm.organization_id) = 1`;

/**
 * The clan whose membership was created for this exact enrolment. Grouped the
 * same way, so an enrolment that somehow spans two clans is left alone.
 */
const CLAN_BY_ENROLLMENT = `
  SELECT cm.enrollment_id,
         cm.user_id,
         (array_agg(DISTINCT cm.clan_id))[1] AS clan_id,
         (array_agg(DISTINCT cm.organization_id))[1] AS organization_id
    FROM clan_memberships cm
   WHERE cm.role = 'mentee'
     AND cm.status IN ${HISTORICAL}
     AND cm.enrollment_id IS NOT NULL
   GROUP BY cm.enrollment_id, cm.user_id
  HAVING count(DISTINCT cm.clan_id) = 1
     AND count(DISTINCT cm.organization_id) = 1`;

const STEPS = [
  {
    name: 'tasks, by enrolment',
    sql: `
      UPDATE assigned_tasks t
         SET clan_id = m.clan_id
        FROM (${CLAN_BY_ENROLLMENT}) m
       WHERE t.clan_id IS NULL
         AND t.enrollment_id = m.enrollment_id
         AND t.mentee_id = m.user_id
         AND t.organization_id = m.organization_id`,
  },
  {
    name: 'tasks, by sole cohort membership',
    sql: `
      UPDATE assigned_tasks t
         SET clan_id = m.clan_id
        FROM (${SOLE_COHORT_CLAN}) m
       WHERE t.clan_id IS NULL
         AND t.mentee_id = m.user_id
         AND t.organization_id = m.organization_id`,
  },
  {
    name: 'blockers, by their task',
    sql: `
      UPDATE blockers b
         SET clan_id = t.clan_id
        FROM assigned_tasks t
       WHERE b.clan_id IS NULL
         AND b.assigned_task_id = t.id
         AND t.clan_id IS NOT NULL
         AND b.mentee_id = t.mentee_id
         AND b.organization_id = t.organization_id`,
  },
  {
    name: 'blockers, by sole cohort membership',
    sql: `
      UPDATE blockers b
         SET clan_id = m.clan_id
        FROM (${SOLE_COHORT_CLAN}) m
       WHERE b.clan_id IS NULL
         AND b.mentee_id = m.user_id
         AND b.organization_id = m.organization_id`,
  },
];

async function orphanCounts() {
  const [[row]] = await sequelize.query(`
    SELECT (SELECT count(*) FROM assigned_tasks WHERE clan_id IS NULL)::int AS tasks,
           (SELECT count(*) FROM blockers       WHERE clan_id IS NULL)::int AS blockers`);
  return row;
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 132: attribute orphaned work to clans\n');

  const before = await orphanCounts();
  console.log(`  Before: ${before.tasks} task(s) and ${before.blockers} blocker(s) with no clan.`);
  if (!before.tasks && !before.blockers) {
    console.log('  ℹ Nothing to attribute.');
    return;
  }

  // A dry run runs the same statements inside a transaction it then throws
  // away, so the preview is the real count and not a second query that could
  // disagree with it.
  const transaction = await sequelize.transaction();
  try {
    for (const step of STEPS) {
      const [, meta] = await sequelize.query(step.sql, { transaction });
      const n = meta?.rowCount ?? 0;
      console.log(`  ${dryRun ? 'Would attribute' : '✓ Attributed'} ${n} row(s) — ${step.name}`);
    }

    const [[after]] = await sequelize.query(`
      SELECT (SELECT count(*) FROM assigned_tasks WHERE clan_id IS NULL)::int AS tasks,
             (SELECT count(*) FROM blockers       WHERE clan_id IS NULL)::int AS blockers`, { transaction });
    console.log(`\n  Left unattributed: ${after.tasks} task(s), ${after.blockers} blocker(s).`);
    if (after.tasks || after.blockers) {
      console.log('  These belong to a mentee with more than one clan and name none of them —');
      console.log('  the record panel reports them as unattributed rather than hiding them.');
    }

    if (dryRun) {
      await transaction.rollback();
      console.log('\nRolled back. Re-run without --dry-run to apply.');
      return;
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Not reversible, on purpose.
 *
 * Undoing this would mean clearing `clan_id` on rows that cannot be told apart
 * from ones legitimately set since — including every task assigned after the
 * migration ran. Re-orphaning real work to undo a repair is the worse outcome.
 */
async function down() {
  console.log('  ℹ 132 is not reversible: clearing clan_id again would orphan work set since.');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
