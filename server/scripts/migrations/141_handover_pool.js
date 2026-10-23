/**
 * Migration: 141_handover_pool
 *
 * The handover pool: one table.
 *
 * A mentor who cannot carry on with a mentee — they are leaving, the clan's
 * programme has closed, the fit is wrong — pushes them into the pool, and a
 * mentor with room pulls them into their own clan with their work intact.
 * Today the only route between two clans is `reassignMentee`, which needs one
 * named mentor to agree in advance. That is the wrong shape for "somebody,
 * anybody, please take this person", and it is hopeless for a whole closing
 * clan at once.
 *
 * Not to be confused with candidate_pools (migration 140), which is the
 * PRE-clan selection round. This is the BETWEEN-clan handover.
 *
 *   handover_pool_entries   one row per offer: this mentee, out of this clan,
 *                           pushed by this mentor, open until somebody claims
 *                           it or the pusher withdraws it.
 *
 * Nothing about the mentee's current placement changes on a push. They stay
 * in their clan, with their mentor, doing their work, until somebody actually
 * claims them. A push is an OFFER, not a removal — which is what keeps a
 * mentee out of limbo while the offer sits unanswered, and makes withdrawing
 * it free. The move happens once, inside the claim.
 *
 * Two indexes carry the correctness rather than the speed:
 *
 *   ..._open_uniq   one OPEN offer per mentee per programme. Partial, so
 *                   settled rows accumulate as history without blocking a
 *                   later re-push. This is what makes a double push a no-op
 *                   instead of two offers for the same person.
 *   ..._claim_idx   the claim is a conditional UPDATE on (id, status='open'),
 *                   so exactly one of N simultaneous pullers updates a row
 *                   and the rest see zero rows affected and are told somebody
 *                   got there first. No advisory locks, no SELECT FOR UPDATE
 *                   on the hot path.
 *
 * Idempotent: every object is created only when missing.
 *
 * Run:      node server/scripts/migrations/141_handover_pool.js
 * Preview:  node server/scripts/migrations/141_handover_pool.js --dry-run
 * Rollback: node server/scripts/migrations/141_handover_pool.js --rollback
 */
const sequelize = require('./_db');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS handover_pool_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    mentee_id UUID NOT NULL REFERENCES users(id),
    -- Where they are being handed over FROM. Kept even after the clan is
    -- frozen or the programme closes: it is the provenance of the offer.
    from_clan_id UUID REFERENCES clans(id),
    -- Denormalised off the source clan on purpose. It is the scope key for
    -- every read (which mentors may see this offer), and the source clan can
    -- be deleted or re-pointed without the offer losing its programme.
    program_id UUID REFERENCES programs(id),
    pushed_by UUID NOT NULL REFERENCES users(id),
    -- Why they are being handed over, for the admin view and the audit.
    reason VARCHAR(40),
    -- Free text FOR THE NEXT MENTOR. Where the mentee got to, what they are
    -- stuck on, what not to repeat: the thing a transfer normally loses.
    handover_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    claimed_by UUID REFERENCES users(id),
    claimed_clan_id UUID REFERENCES clans(id),
    claimed_at TIMESTAMPTZ,
    withdrawn_by UUID REFERENCES users(id),
    withdrawn_at TIMESTAMPTZ,
    -- What the claim actually carried across, so the admin view can say so
    -- without recomputing it: { tasks, submissions, feedback, progress }.
    carried JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // One live offer per mentee per programme. Partial so settled rows are kept
  // as history and a later re-push is still allowed.
  `CREATE UNIQUE INDEX IF NOT EXISTS handover_pool_open_uniq
     ON handover_pool_entries (organization_id, mentee_id, program_id)
     WHERE status = 'open'`,

  // The pool list: open offers, oldest first, within a programme.
  `CREATE INDEX IF NOT EXISTS handover_pool_claim_idx
     ON handover_pool_entries (organization_id, status, program_id, created_at)`,

  'CREATE INDEX IF NOT EXISTS handover_pool_mentee_idx ON handover_pool_entries (mentee_id)',
  'CREATE INDEX IF NOT EXISTS handover_pool_from_clan_idx ON handover_pool_entries (from_clan_id)',
];

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 141: handover pool\n');
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
  console.log('  ✓ handover_pool_entries');
  console.log('  ✓ one open offer per mentee per programme (partial unique)');
}

async function down() {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('DROP TABLE IF EXISTS handover_pool_entries', { transaction });
  });
  console.log('  ✓ Dropped handover_pool_entries');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
