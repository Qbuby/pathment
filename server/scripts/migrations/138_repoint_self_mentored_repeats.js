/**
 * Migration: 138_repoint_self_mentored_repeats
 *
 * Give every repeating task a mentor who is not the mentee.
 *
 * `taskService._isMentorForMentee` opens with "nobody mentors themselves" and
 * is right to: a co-mentor of the clan they also learn in matches every clan
 * check after it, so without that line they could assign their own work and
 * then review it. The check stays.
 *
 * What nobody noticed is that the recurring scheduler was asking that same
 * question on behalf of a slot a person had set on their own task. Core team
 * members are exactly the overlapping case - `co_mentor` and `mentee` in one
 * standing clan - so every occurrence the scheduler computed for them was
 * refused with "You are not the mentor for this mentee", once per occurrence,
 * once an hour, into the log and nowhere a human would look, while the mentor
 * screen went on reading "Repeats every weekday". On production that was
 * fourteen refusals in a single tick and not one task created.
 *
 * recurringSlotMaterializer now resolves a real mentor at materialise time, so
 * new ticks are already fixed. This repoints the slots that are already stored,
 * so the data stops saying something that cannot be true.
 *
 * Who it picks, in order: the clan's lead mentor, then the most senior other
 * mentor in the clan, then an owner or admin of the workspace. A clan with
 * nobody in it but the mentee is reported and left alone - there is no honest
 * answer and a wrong one would hand somebody else's work to a stranger.
 *
 * `assigned_by` is repointed with it when it is the mentee too, because it is
 * the fallback the scheduler reads when a slot carries no mentor of its own,
 * and because `activateSlotForMentor` looks slots up by it.
 *
 * Run:      node server/scripts/migrations/138_repoint_self_mentored_repeats.js
 * Preview:  node server/scripts/migrations/138_repoint_self_mentored_repeats.js --dry-run
 */
const sequelize = require('./_db');

const ROWS = `
  SELECT ms.id, ms.mentee_id, ms.clan_id, ms.assigned_by, ms.schedule,
         u.first_name, u.last_name
    FROM mentee_schedules ms
    LEFT JOIN users u ON u.id = ms.mentee_id
   WHERE ms.schedule IS NOT NULL
     AND jsonb_typeof(ms.schedule) = 'array'
     AND jsonb_array_length(ms.schedule) > 0`;

const CLAN_MENTORS = `
  SELECT cm.user_id, cm.role
    FROM clan_memberships cm
   WHERE cm.clan_id = :clanId
     AND cm.user_id <> :menteeId
     AND cm.status IN ('active', 'paused')
     AND cm.role IN ('lead_mentor', 'core_team', 'co_mentor')`;

const RANK = { lead_mentor: 3, core_team: 2, co_mentor: 1 };

async function resolveMentor(clanId, menteeId) {
  if (clanId) {
    const [[clan]] = await sequelize.query(
      'SELECT lead_mentor_id FROM clans WHERE id = :clanId',
      { replacements: { clanId } }
    );
    if (clan?.lead_mentor_id && clan.lead_mentor_id !== menteeId) {
      return { id: clan.lead_mentor_id, via: 'clan lead mentor' };
    }
    const [mentors] = await sequelize.query(CLAN_MENTORS, { replacements: { clanId, menteeId } });
    const senior = [...mentors].sort((a, b) => (RANK[b.role] ?? 0) - (RANK[a.role] ?? 0))[0];
    if (senior) return { id: senior.user_id, via: `clan ${senior.role}` };
  }
  // Last resort: whoever runs the workspace this mentee belongs to.
  const [[owner]] = await sequelize.query(`
    SELECT om.user_id, om.role
      FROM organization_memberships om
      JOIN organization_memberships mine ON mine.organization_id = om.organization_id
     WHERE mine.user_id = :menteeId
       AND om.user_id <> :menteeId
       AND om.status = 'active'
       AND om.role IN ('owner', 'admin')
     ORDER BY CASE om.role WHEN 'owner' THEN 0 ELSE 1 END
     LIMIT 1`, { replacements: { menteeId } });
  return owner?.user_id ? { id: owner.user_id, via: `workspace ${owner.role || 'admin'}` } : null;
}

async function up({ dryRun = false } = {}) {
  const [rows] = await sequelize.query(ROWS);
  let scheduleRows = 0;
  let slots = 0;
  let unresolved = 0;
  const names = new Map();

  for (const row of rows) {
    const schedule = Array.isArray(row.schedule) ? row.schedule : [];
    const selfAssignedBy = row.assigned_by === row.mentee_id;
    const who = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.mentee_id;
    // Per clan, because two slots on one schedule can name two clans.
    const byClan = new Map();
    let changed = false;
    let lastResolved = null;

    for (const slot of schedule) {
      if (slot?.kind !== 'recurring' || !slot.recurring) continue;
      const effective = slot.recurring.mentorId || row.assigned_by || null;
      if (!effective || effective !== row.mentee_id) continue;

      const clanId = slot.recurring.clanId || row.clan_id || null;
      if (!byClan.has(clanId)) byClan.set(clanId, await resolveMentor(clanId, row.mentee_id));
      const resolved = byClan.get(clanId);
      if (!resolved) {
        unresolved++;
        console.log(`  ! ${who}: repeat "${slot.recurring.title || slot.label}" has no mentor but themselves - left alone`);
        continue;
      }
      if (!names.has(resolved.id)) {
        const [[u]] = await sequelize.query(
          'SELECT first_name, last_name FROM users WHERE id = :id',
          { replacements: { id: resolved.id } }
        );
        names.set(resolved.id, u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : resolved.id);
      }

      slot.recurring.mentorId = resolved.id;
      lastResolved = resolved;
      slots++;
      changed = true;
      console.log(`  → ${who}: "${slot.recurring.title || slot.label}" now assigned by ${names.get(resolved.id)} (${resolved.via})`);
    }

    if (!changed) continue;
    scheduleRows++;
    if (dryRun) continue;

    await sequelize.query(
      `UPDATE mentee_schedules
          SET schedule = :schedule::jsonb,
              assigned_by = :assignedBy,
              updated_at = NOW()
        WHERE id = :id`,
      {
        replacements: {
          id: row.id,
          schedule: JSON.stringify(schedule),
          assignedBy: selfAssignedBy ? lastResolved.id : row.assigned_by,
        },
      }
    );
  }

  console.log(
    `\n${dryRun ? 'Would repoint' : 'Repointed'} ${slots} repeat(s) across ${scheduleRows} schedule(s)` +
    (unresolved ? `; ${unresolved} left alone with no mentor available` : '')
  );
  if (!dryRun && slots > 0) {
    console.log('The scheduler creates the missed occurrences on its next hourly tick.');
  }
}

module.exports = { up };

if (require.main === module) {
  up({ dryRun: process.argv.includes('--dry-run') })
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
