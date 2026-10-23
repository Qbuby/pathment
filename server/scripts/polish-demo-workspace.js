/**
 * Make the demo workspace look like a real one.
 *
 * Seeded data is correct and lifeless: every face is a grey circle of initials,
 * there is one clan per mentor so the clan switcher has nothing to switch
 * between, and the standing-clan feature — a cohort continuing past the end of
 * its programme — is invisible because no standing clan exists. None of that
 * is wrong, it just does not demonstrate anything.
 *
 * Three additive passes, each idempotent:
 *   1. a stable avatar for anybody without one
 *   2. a standing clan, with alumni moved into it
 *   3. a mentor who leads one clan and co-mentors another
 *
 * Nothing is deleted and nothing already set is overwritten, so this is safe to
 * re-run and safe on a workspace somebody has been clicking around in.
 *
 * Run:     node scripts/polish-demo-workspace.js
 * Preview: node scripts/polish-demo-workspace.js --dry-run
 * Target:  --workspace <slug>   (default: the deployment's own)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { models, sequelize } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const arg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Generated avatars, not photographs of real people.
 *
 * A demo roster of invented mentees wearing real faces from a stock service is
 * a small lie that is easy to avoid. These are illustrations, keyed on the
 * person's id so the same face follows the same person across every screen and
 * every re-run. If they fail to load the UI falls back to initials by itself
 * (`Avatar` has an onError), so a flaky network degrades rather than breaks.
 *
 * Swap STYLE for any DiceBear style, or replace the whole function with real
 * uploads, without touching anything else.
 */
const AVATAR_STYLE = 'notionists-neutral';
const avatarFor = (user) =>
  `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(user.id)}` +
  '&backgroundColor=d1e7dd,cfe2ff,e2e3e5,f8d7da,fff3cd&radius=50';

async function giveEveryoneAFace() {
  const faceless = await models.User.findAll({
    where: { [Op.or]: [{ profilePictureUrl: null }, { profilePictureUrl: '' }] },
    attributes: ['id', 'firstName', 'lastName'],
  });
  if (!faceless.length) { console.log('  ℹ every account already has a photo'); return 0; }
  if (DRY_RUN) { console.log(`  + would give ${faceless.length} account(s) an avatar`); return faceless.length; }
  for (const user of faceless) await user.update({ profilePictureUrl: avatarFor(user) });
  console.log(`  ✓ ${faceless.length} account(s) now have a face`);
  return faceless.length;
}

/**
 * A standing clan, with the people who have finished in it.
 *
 * Standing clans are where a cohort lives on after its programme ends, and the
 * work follows them across. With none in the workspace the whole feature — and
 * the mirrored history that comes with it — cannot be shown at all.
 */
async function makeStandingClan(program, leadMentorId, adminId) {
  const NAME = 'Alumni Guild · Standing';
  const existing = await models.Clan.findOne({ where: { name: NAME } });
  if (existing) { console.log(`  ℹ already there: ${NAME}`); return existing; }
  if (DRY_RUN) { console.log(`  + would create standing clan: ${NAME}`); return null; }

  const clan = await models.Clan.create({
    programId: program.id,
    name: NAME,
    kind: 'standing',
    description: 'Fellows who have finished the programme and kept building together.',
    leadMentorId,
    createdBy: adminId,
    status: 'active',
    maxMentees: 50,
  });
  console.log(`  ✓ created standing clan: ${NAME}`);
  return clan;
}

/** Move a handful of finished mentees in, so it is not an empty room. */
async function populateStandingClan(clan) {
  if (!clan) return 0;
  const alreadyIn = await models.ClanMembership.count({ where: { clanId: clan.id, role: 'mentee' } });
  if (alreadyIn >= 4) { console.log(`  ℹ standing clan already has ${alreadyIn} member(s)`); return 0; }

  /**
   * People who are already in a cohort clan, so their mirrored work has
   * somewhere to come from. Picked deterministically (oldest memberships
   * first) so a re-run chooses the same people.
   */
  const candidates = await models.ClanMembership.findAll({
    where: { role: 'mentee', status: 'active' },
    include: [{ model: models.Clan, as: 'clan', attributes: ['kind'], required: true }],
    order: [['created_at', 'ASC']],
    limit: 40,
  });
  const fromCohorts = candidates.filter((m) => m.clan?.kind === 'cohort').slice(0, 5);
  if (!fromCohorts.length) { console.log('  ℹ nobody available to move into the standing clan'); return 0; }
  if (DRY_RUN) { console.log(`  + would add ${fromCohorts.length} alumni to the standing clan`); return fromCohorts.length; }

  let added = 0;
  for (const membership of fromCohorts) {
    const [, made] = await models.ClanMembership.findOrCreate({
      where: { clanId: clan.id, userId: membership.userId, role: 'mentee' },
      // enrollmentId stays null on purpose: a standing clan's work is not
      // attached to a programme enrolment.
      defaults: { clanId: clan.id, userId: membership.userId, role: 'mentee', status: 'active', joinedAt: new Date() },
    });
    if (made) added += 1;
  }
  console.log(`  ✓ ${added} alumni now in the standing clan`);
  return added;
}

/**
 * One mentor in two clans, so the clan switcher has a reason to exist.
 *
 * Every mentor leading exactly one clan is the one shape in which the selector,
 * the per-clan scoping and the cross-clan rules all look like dead weight.
 */
async function makeSomebodyMultiClan() {
  const clans = await models.Clan.findAll({ where: { kind: 'cohort' }, order: [['created_at', 'ASC']] });
  if (clans.length < 2) { console.log('  ℹ need two cohort clans for this'); return 0; }

  const [first, second] = clans;
  const lead = await models.ClanMembership.findOne({ where: { clanId: first.id, role: 'lead_mentor' } });
  if (!lead) { console.log('  ℹ no lead mentor to borrow'); return 0; }

  const already = await models.ClanMembership.findOne({
    where: { clanId: second.id, userId: lead.userId, role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
  });
  if (already) { console.log('  ℹ a mentor already spans two clans'); return 0; }
  if (DRY_RUN) { console.log(`  + would co-mentor ${first.name}'s lead onto ${second.name}`); return 1; }

  await models.ClanMembership.create({
    clanId: second.id, userId: lead.userId, role: 'co_mentor', status: 'active', joinedAt: new Date(),
  });
  console.log(`  ✓ ${first.name}'s lead now co-mentors ${second.name}`);
  return 1;
}

async function main() {
  await sequelize.authenticate();
  const slug = arg('--workspace', process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
  const organization = await models.Organization.findOne({ where: { slug } });
  if (!organization) throw new Error(`No workspace with slug "${slug}"`);
  console.log(`Workspace: ${organization.name} (${organization.slug})${DRY_RUN ? '  [dry run]' : ''}\n`);

  await runWithRequestContext(
    { organizationId: organization.id, organizationSlug: organization.slug },
    async () => {
      console.log('Faces');
      await giveEveryoneAFace();

      console.log('\nStanding clan');
      const program = await models.Program.findOne({ order: [['created_at', 'ASC']] });
      if (!program) { console.log('  ℹ no programme to attach one to'); }
      else {
        const admin = await models.User.findOne({ where: { role: 'admin' }, attributes: ['id'] });
        const anyLead = await models.ClanMembership.findOne({ where: { role: 'lead_mentor' } });
        const clan = await makeStandingClan(program, anyLead ? anyLead.userId : null, admin ? admin.id : null);
        await populateStandingClan(clan);
      }

      console.log('\nMulti-clan mentor');
      await makeSomebodyMultiClan();

      console.log(DRY_RUN ? '\nDry run: nothing written.' : '\n✅ Demo workspace polished.');
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌ Failed:', error.message); process.exit(1); });
