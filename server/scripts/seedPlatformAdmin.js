/**
 * Grant (or update) a PLATFORM admin - the operator console identity.
 *
 *   node scripts/seedPlatformAdmin.js --email ops@example.com --role owner
 *
 * Roles: owner | billing | support | readonly. The account must already exist.
 * Idempotent: re-running updates the role and clears a revocation. This is the
 * bootstrap path for the first owner; after that, owners manage admins from
 * the console itself (/platform/admins).
 */
require('dotenv').config();
const { sequelize, models } = require('../src/db');

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i += 2) flags[args[i]] = args[i + 1];
  const email = String(flags['--email'] || '').trim().toLowerCase();
  const role = String(flags['--role'] || 'owner').trim();
  if (!email) throw new Error('Usage: node scripts/seedPlatformAdmin.js --email <email> [--role owner|billing|support|readonly]');
  if (!['owner', 'billing', 'support', 'readonly'].includes(role)) throw new Error(`Unknown role: ${role}`);

  const user = await models.User.findOne({ where: { email } });
  if (!user) throw new Error(`No account exists for ${email}. Create the account first.`);

  const [row, created] = await models.PlatformAdmin.findOrCreate({
    where: { userId: user.id },
    defaults: { role },
  });
  if (!created) await row.update({ role, revokedAt: null, revokedBy: null });

  await models.PlatformAuditLog.create({
    actorId: null, actorEmail: 'seed-script',
    action: created ? 'PLATFORM_ADMIN_GRANTED' : 'PLATFORM_ADMIN_ROLE_CHANGED',
    targetType: 'PlatformAdmin', targetId: email, newValues: { role, via: 'seed' },
  });

  console.log(`${created ? 'Granted' : 'Updated'} platform ${role}: ${email}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
