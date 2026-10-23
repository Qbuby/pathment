const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');
const { up } = require('../../scripts/migrations/125_retire_system_default_badges');

test('legacy system badges are retired without touching customer badges', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'migration125-'));
  const data = path.join(directory, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });
  let started = false;
  let db;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'migration_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'migration_test', '', { dialect: 'postgres', host: directory, logging: false });
    const query = sql => db.query(sql);
    const rows = async sql => (await query(sql))[0];

    await query(`
      CREATE TABLE badges (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
        category TEXT NOT NULL, criteria_type TEXT NOT NULL, criteria_value JSONB NOT NULL,
        points_reward INTEGER NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE user_badges (id TEXT PRIMARY KEY, badge_id TEXT NOT NULL REFERENCES badges(id));
      ALTER TABLE badges ADD CONSTRAINT badges_name_key1 UNIQUE(name);
      CREATE UNIQUE INDEX badges_name_key2 ON badges(name);
      CREATE UNIQUE INDEX badges_org_name_lower_uniq ON badges(organization_id, lower(name));
      INSERT INTO badges VALUES
        ('unawarded', 'org-a', 'First Steps', 'milestone', 'tasks_completed', '{"count":1}', 10, true, NOW()),
        ('awarded', 'org-a', 'Legend', 'level', 'level_reached', '{"level":5}', 500, true, NOW()),
        ('customer', 'org-a', 'Customer milestone', 'milestone', 'tasks_completed', '{"count":9}', 35, true, NOW());
      INSERT INTO user_badges VALUES ('award-1', 'awarded');
    `);

    await up({ db });
    await up({ db });

    assert.equal((await rows("SELECT count(*)::int AS count FROM badges WHERE id='unawarded'"))[0].count, 0);
    assert.equal((await rows("SELECT is_active FROM badges WHERE id='awarded'"))[0].is_active, false);
    assert.equal((await rows("SELECT is_active FROM badges WHERE id='customer'"))[0].is_active, true);

    const singleNameUniques = await rows(`
      SELECT i.relname
      FROM pg_index x
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
      WHERE t.relname = 'badges' AND x.indisunique AND NOT x.indisprimary
        AND x.indnkeyatts = 1 AND a.attname = 'name'
    `);
    assert.deepEqual(singleNameUniques, []);

    await query(`INSERT INTO badges VALUES
      ('other-org', 'org-b', 'Customer milestone', 'milestone', 'tasks_completed', '{"count":9}', 35, true, NOW())`);
    await assert.rejects(query(`INSERT INTO badges VALUES
      ('same-org', 'org-a', 'CUSTOMER MILESTONE', 'milestone', 'tasks_completed', '{"count":12}', 40, true, NOW())`));
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
});
