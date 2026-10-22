/**
 * Migration: 140_candidate_pools
 *
 * The System Pool: a real pre-clan state for people who are on the platform
 * but have not been selected into a clan yet. Admins put candidates in a pool,
 * give them the work Pathment already has (tasks, quizzes, interviews), review
 * it, score it, shortlist, decide, and only then place the chosen ones into
 * clans.
 *
 * Two tables and one column, all ADDITIVE:
 *
 *   candidate_pools          one pool per selection round, bound to a
 *                            programme (the permission scope) and optionally a
 *                            cohort. `work_items` lists the qualifying work
 *                            given to the pool; `settings` holds its options.
 *   candidate_pool_members   one row per candidate per pool. `user_id` is NULL
 *                            while the person is only invited — there is no
 *                            account to point at yet — so the email is the
 *                            identity until they activate. Small JSON fields
 *                            carry hand-entered scores, placement progress and
 *                            which reminders were sent.
 *   assigned_tasks.pool_member_id
 *                            NULL for every existing row, which means "not
 *                            pool work" — so nothing existing changes. The
 *                            partial unique index stops the same piece of work
 *                            reaching the same member twice.
 *
 * Shortlist snapshots and decision history are written to the existing
 * audit_logs table; no table of their own.
 *
 * Every table carries explicit database defaults for id and timestamps, so raw
 * SQL inserts work whether a table came from this migration or from db:sync.
 *
 * Idempotent: every table, column and index is created only when missing.
 *
 * Run:      node server/scripts/migrations/140_candidate_pools.js
 * Preview:  node server/scripts/migrations/140_candidate_pools.js --dry-run
 * Rollback: node server/scripts/migrations/140_candidate_pools.js --rollback
 */
const sequelize = require('./_db');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS candidate_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    capacity INTEGER,
    selection_quota INTEGER NOT NULL DEFAULT 1,
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    qualification_due_at TIMESTAMPTZ,
    scoring_policy JSONB NOT NULL DEFAULT '{"version":1,"components":[]}'::jsonb,
    reminder_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    work_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS candidate_pools_organization_idx ON candidate_pools (organization_id)',
  'CREATE INDEX IF NOT EXISTS candidate_pools_program_idx ON candidate_pools (program_id)',
  'CREATE INDEX IF NOT EXISTS candidate_pools_status_idx ON candidate_pools (status)',

  `CREATE TABLE IF NOT EXISTS candidate_pool_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    pool_id UUID NOT NULL REFERENCES candidate_pools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    invite_id UUID REFERENCES registration_invites(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'invited',
    decision VARCHAR(20),
    decision_reason TEXT,
    decided_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    score_components JSONB,
    total_score NUMERIC(7,2),
    rank INTEGER,
    placed_enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    placed_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL,
    placed_at TIMESTAMPTZ,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    manual_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    placement JSONB NOT NULL DEFAULT '{}'::jsonb,
    reminders JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // One membership per person per pool. The email is the identity because an
  // invited candidate has no account yet.
  'CREATE UNIQUE INDEX IF NOT EXISTS candidate_pool_members_org_pool_email_uniq ON candidate_pool_members (organization_id, pool_id, email)',
  'CREATE INDEX IF NOT EXISTS candidate_pool_members_organization_idx ON candidate_pool_members (organization_id)',
  'CREATE INDEX IF NOT EXISTS candidate_pool_members_pool_idx ON candidate_pool_members (pool_id)',
  'CREATE INDEX IF NOT EXISTS candidate_pool_members_user_idx ON candidate_pool_members (user_id)',

  // Tag pool work on the shared task table. NULL = ordinary work, untouched.
  'ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS pool_member_id UUID REFERENCES candidate_pool_members(id)',
  // Each piece of pool work has its own task template, so (member, template)
  // identifies it: the same work reaches the same member once. A cancelled
  // copy does not count, so work can be re-issued after a cancellation.
  `CREATE UNIQUE INDEX IF NOT EXISTS assigned_tasks_pool_member_work_uniq
     ON assigned_tasks (pool_member_id, roadmap_task_id)
     WHERE pool_member_id IS NOT NULL AND status <> 'cancelled'`,
];

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 140: candidate pools\n');
  if (dryRun) {
    STATEMENTS.forEach((sql) => console.log(`${sql.split('\n')[0].trim()} …`));
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }
  await sequelize.transaction(async (transaction) => {
    for (const sql of STATEMENTS) {
      await sequelize.query(sql, { transaction });
    }
  });
  console.log('  ✓ candidate_pools, candidate_pool_members');
  console.log('  ✓ assigned_tasks.pool_member_id (NULL for every existing task)');
}

async function down() {
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    await q('DROP INDEX IF EXISTS assigned_tasks_pool_member_work_uniq');
    await q('ALTER TABLE assigned_tasks DROP COLUMN IF EXISTS pool_member_id');
    await q('DROP TABLE IF EXISTS candidate_pool_members');
    await q('DROP TABLE IF EXISTS candidate_pools');
  });
  console.log('  ✓ Dropped the candidate pool tables and assigned_tasks.pool_member_id');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
