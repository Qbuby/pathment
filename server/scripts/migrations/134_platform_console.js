/**
 * Migration: 134_platform_console
 *
 * Foundations for the Pathment platform console — the operator surface that
 * spans every workspace.
 *
 * Until now "platform admin" was a comma-separated env var
 * (PLATFORM_ADMIN_EMAILS) checked by one middleware, and the only operator
 * tooling was a CLI script. Four tables give the console a real footing:
 *
 *   platform_admins          who may open the console, and at which tier.
 *                            One row per user; revoking keeps the row (with
 *                            revoked_at) so the grant history survives.
 *
 *   platform_audit_logs      append-only record of every operator action.
 *                            Deliberately NOT audit_logs: that table requires
 *                            an organization_id, and platform actions (plan
 *                            edits, admin grants) often have none. The org
 *                            column here is nullable and named
 *                            target_organization_id so the tenant-scope hooks
 *                            never treat the row as workspace-owned.
 *
 *   workspace_owner_invites  the operator-assisted first-owner provisioning
 *                            flow: a hashed single-use activation token that
 *                            lets the new workspace owner set their own
 *                            password. Only the SHA-256 of the token is
 *                            stored, same as password reset.
 *
 *   buyer_leads              the marketing "talk to us" enquiries, so the
 *                            pricing-page funnel ends in a provisioned
 *                            workspace instead of an inbox.
 *
 * Idempotent: every table and index is created only when missing.
 *
 * Run:      node server/scripts/migrations/134_platform_console.js
 * Preview:  node server/scripts/migrations/134_platform_console.js --dry-run
 * Rollback: node server/scripts/migrations/134_platform_console.js --rollback
 */
const sequelize = require('./_db');

const TABLES = {
  platform_admins: `CREATE TABLE IF NOT EXISTS platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'readonly',
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_admins_role_check CHECK (role IN ('owner','billing','support','readonly'))
  )`,
  platform_audit_logs: `CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(80),
    target_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  workspace_owner_invites: `CREATE TABLE IF NOT EXISTS workspace_owner_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  buyer_leads: `CREATE TABLE IF NOT EXISTS buyer_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    organization_name VARCHAR(160) NOT NULL,
    organization_size VARCHAR(60),
    participants VARCHAR(60),
    program_type VARCHAR(80),
    launch_timeframe VARCHAR(80),
    plan_interest VARCHAR(80),
    message TEXT,
    website VARCHAR(200),
    source VARCHAR(40) NOT NULL DEFAULT 'marketing',
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    notes TEXT,
    provisioned_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT buyer_leads_status_check CHECK (status IN ('new','contacted','qualified','provisioned','lost'))
  )`,
};

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx ON platform_audit_logs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS platform_audit_logs_action_idx ON platform_audit_logs (action)`,
  `CREATE INDEX IF NOT EXISTS platform_audit_logs_target_org_idx ON platform_audit_logs (target_organization_id)`,
  `CREATE INDEX IF NOT EXISTS platform_audit_logs_actor_idx ON platform_audit_logs (actor_id)`,
  `CREATE INDEX IF NOT EXISTS workspace_owner_invites_org_idx ON workspace_owner_invites (organization_id)`,
  `CREATE INDEX IF NOT EXISTS buyer_leads_status_idx ON buyer_leads (status)`,
  `CREATE INDEX IF NOT EXISTS buyer_leads_created_at_idx ON buyer_leads (created_at DESC)`,
];

async function up(dryRun) {
  for (const [name, ddl] of Object.entries(TABLES)) {
    if (dryRun) { console.log(`[dry-run] would ensure table ${name}`); continue; }
    await sequelize.query(ddl);
    console.log(`ensured table ${name}`);
  }
  for (const ddl of INDEXES) {
    if (dryRun) { console.log(`[dry-run] would run: ${ddl}`); continue; }
    await sequelize.query(ddl);
  }
  if (!dryRun) console.log('134_platform_console applied');
}

async function down() {
  // Reverse creation order so FKs never dangle.
  for (const name of ['buyer_leads', 'workspace_owner_invites', 'platform_audit_logs', 'platform_admins']) {
    await sequelize.query(`DROP TABLE IF EXISTS ${name}`);
    console.log(`dropped ${name}`);
  }
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
