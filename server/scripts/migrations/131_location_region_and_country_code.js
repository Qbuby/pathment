/**
 * Migration: 131_location_region_and_country_code
 *
 * Make a stated location mean something.
 *
 * `users.city` and `users.country` were free-text boxes. "Lahore", "lahore"
 * and "Lahore, PK" were three different places, so a location could never be
 * grouped, filtered or counted, and the timezone beside them was an unrelated
 * list of 400-odd IANA zones that the person had to match to their own country
 * from memory.
 *
 * The forms now pick from a real dataset (country → region → city), which
 * needs two more columns:
 *
 *   country_code  ISO-3166 alpha-2 — the stable key. Names are for people;
 *                 this is what code should compare, and what makes a country's
 *                 timezones resolvable.
 *   region        state / province / region, where the country has them.
 *
 * Both are NULL for every existing row and stay that way until somebody edits
 * their profile. Existing free-text city/country values are deliberately NOT
 * rewritten: matching them by string would silently relocate anyone whose
 * spelling did not line up, and a wrong location is worse than a vague one.
 * The picker resolves a saved country NAME back to its code on first edit, so
 * rows fill in as people touch them.
 *
 * Idempotent: each column is added only when missing.
 *
 * Run:      node server/scripts/migrations/131_location_region_and_country_code.js
 * Preview:  node server/scripts/migrations/131_location_region_and_country_code.js --dry-run
 * Rollback: node server/scripts/migrations/131_location_region_and_country_code.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'users';
const COLUMNS = [
  { name: 'country_code', ddl: 'VARCHAR(2)' },
  { name: 'region', ddl: 'VARCHAR(120)' },
];

async function existing() {
  const [rows] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = :t AND column_name IN (:c)`,
    { replacements: { t: TABLE, c: COLUMNS.map((c) => c.name) } },
  );
  return new Set(rows.map((r) => r.column_name));
}

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 131: structured location\n');

  const present = await existing();
  const missing = COLUMNS.filter((c) => !present.has(c.name));

  if (!missing.length) {
    console.log(`  ℹ ${TABLE} already has country_code and region — nothing to do.`);
    return;
  }

  const [[{ total, withCountry }]] = await sequelize.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(country) FILTER (WHERE country IS NOT NULL AND country <> '')::int AS "withCountry"
      FROM ${TABLE}`);
  console.log(`  ${total} user(s), ${withCountry} with a country typed in.`);
  console.log('  None are rewritten — the picker fills these in as people edit their profile.');

  if (dryRun) {
    missing.forEach((c) => console.log(`\nWould add ${TABLE}.${c.name} ${c.ddl} NULL.`));
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  for (const column of missing) {
    await sequelize.query(`ALTER TABLE ${TABLE} ADD COLUMN ${column.name} ${column.ddl}`);
    console.log(`  ✓ Added ${TABLE}.${column.name}`);
  }
}

async function down() {
  for (const column of COLUMNS) {
    await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${column.name}`);
    console.log(`  ✓ Dropped ${TABLE}.${column.name}`);
  }
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
