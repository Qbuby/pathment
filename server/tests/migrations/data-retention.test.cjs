const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');
const retention = require('../../src/services/dataRetentionService');

test('approved retention preserves active sessions, security events and email delivery records', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'retention-'));
  const data = path.join(dir, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });

/**
 * Nothing a sweep can reach is anybody's work.
 *
 * The brief behind this was "remove unnecessary data", and the way that goes
 * wrong is a policy that looks like cleanup and is actually somebody's
 * submission. Rather than trust a reading of each predicate, this asserts the
 * list of tables the sweep can touch — so adding a policy over assigned_tasks,
 * task_submissions, messages, enrolments or certificates fails here, loudly,
 * before it ever runs against real data.
 */
test('retention can only ever touch delivery records, expired credentials and old telemetry', () => {
  const ALLOWED = new Set([
    'refresh_tokens',    // expired credentials
    'email_queue',       // delivery records
    'audit_logs',        // routine successful pings only, per its predicate
    'notifications',     // delivery records; unread are excluded by predicate
    'analytics_events',  // telemetry over a year old
  ]);

  const tables = Object.values(retention.POLICIES).map(policy => policy.table);
  const forbidden = tables.filter(table => !ALLOWED.has(table));

  assert.deepEqual(forbidden, [],
    'A retention policy may not reach a table holding work somebody did. '
    + 'If this is deliberate, the table belongs in ALLOWED with the reason it is safe.');
});

test('the audit policy never removes a failure', () => {
  // A 4xx or 5xx heartbeat is a security signal; only the successful noise goes.
  assert.match(retention.POLICIES.routineAudit.predicate, /\^\[23\]/);
});
  let db;
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'migration_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-F -k ${dir} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'migration_test', '', { dialect: 'postgres', host: dir, logging: false });
    await db.query(`CREATE TABLE refresh_tokens(id INTEGER PRIMARY KEY, expires_at TIMESTAMPTZ);
      INSERT INTO refresh_tokens VALUES (1, NOW() + INTERVAL '1 day'), (2, NOW() - INTERVAL '6 days'), (3, NOW() - INTERVAL '8 days');
      CREATE TABLE email_queue(id INTEGER PRIMARY KEY, status TEXT, sent_at TIMESTAMPTZ, body_html TEXT NOT NULL, body_text TEXT, provider_message_id TEXT);
      INSERT INTO email_queue VALUES (1, 'sent', NOW() - INTERVAL '31 days', 'html', 'text', 'keep'),
        (2, 'pending', NOW() - INTERVAL '31 days', 'html', 'text', 'pending'),
        (3, 'dead', NOW() - INTERVAL '31 days', 'html', 'text', 'dead'),
        (4, 'sent', NOW() - INTERVAL '29 days', 'html', 'text', 'recent');
      CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ, action TEXT, new_values JSONB);
      INSERT INTO audit_logs VALUES
        (1, NOW() - INTERVAL '91 days', 'POST /api/activity/session/heartbeat', '{"status":200}'),
        (2, NOW() - INTERVAL '91 days', 'POST /api/auth/login', '{"status":200}'),
        (3, NOW() - INTERVAL '91 days', 'POST /api/activity/session/heartbeat', '{"status":403}'),
        (4, NOW() - INTERVAL '89 days', 'POST /api/activity/session/heartbeat', '{"status":200}'),
        (5, NOW() - INTERVAL '91 days', 'ROLE_GRANTED', '{}');
      CREATE TABLE notifications(id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ, read_at TIMESTAMPTZ, title TEXT);
      INSERT INTO notifications VALUES
        (1, NOW() - INTERVAL '91 days', NOW() - INTERVAL '90 days', 'read and old'),
        (2, NOW() - INTERVAL '91 days', NULL,                       'unread, however old'),
        (3, NOW() - INTERVAL '89 days', NOW() - INTERVAL '88 days', 'read but recent');
      CREATE TABLE analytics_events(id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ, event_type TEXT);
      INSERT INTO analytics_events VALUES
        (1, NOW() - INTERVAL '366 days', 'page_view'),
        (2, NOW() - INTERVAL '364 days', 'page_view'),
        (3, NOW() - INTERVAL '366 days', 'task_opened')`);
    const expected = {
      expiredTokens: 1, sentEmailBodies: 1, routineAudit: 1,
      readNotifications: 1, oldPageViews: 1, deliveredEmails: 0,
    };
    assert.deepEqual(await retention.report(db), expected);
    assert.deepEqual(await retention.report(db), expected, 'preview is read-only');
    assert.deepEqual(await retention.apply(db, { batchSize: 1 }), expected);
    assert.deepEqual(await retention.report(db), {
      expiredTokens: 0, sentEmailBodies: 0, routineAudit: 0,
      readNotifications: 0, oldPageViews: 0, deliveredEmails: 0,
    });
    const [tokens] = await db.query('SELECT id FROM refresh_tokens ORDER BY id');
    assert.deepEqual(tokens.map(row => row.id), [1, 2]);
    const [events] = await db.query('SELECT id FROM audit_logs ORDER BY id');
    assert.deepEqual(events.map(row => row.id), [2, 3, 4, 5]);
    const [emails] = await db.query('SELECT * FROM email_queue ORDER BY id');
    assert.equal(emails.length, 4);
    assert.equal(emails[0].provider_message_id, 'keep');
    assert.equal(emails[0].body_html, '');
    assert.equal(emails[0].body_text, '');
    assert.ok(emails.slice(1).every(row => row.body_html === 'html'));

    // An unread notification is somebody's inbox, not litter — it stays
    // however old it is. A read one under ninety days stays too.
    const [notifications] = await db.query('SELECT id FROM notifications ORDER BY id');
    assert.deepEqual(notifications.map(row => row.id), [2, 3]);

    // Only page views age out; a task_opened of the same age is behavioural
    // evidence a mentor may still be reading, and is not this policy's to take.
    const [analytics] = await db.query('SELECT id FROM analytics_events ORDER BY id');
    assert.deepEqual(analytics.map(row => row.id), [2, 3]);

    await assert.rejects(retention.apply(db, { batchSize: 0 }), /Invalid retention/);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});
