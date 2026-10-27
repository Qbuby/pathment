// Account tokens are global; the same approved retention policy applies to all
// workspaces. This operator-only service deliberately does not use request scope.
const ROUTINE_ACTIONS = [
  'POST /api/activity/session/heartbeat',
  'POST /api/activity/session/start',
  'POST /api/activity/session/end',
  'POST /api/activity/event',
];

/**
 * What may be removed, and the reason each one is safe to lose.
 *
 * Every policy here is either a record of a delivery (the thing it announced
 * still exists), a credential that has already expired, or telemetry old
 * enough that no report reaches it. Nothing here is somebody's work: no task,
 * submission, feedback, message, enrolment or certificate is deletable by a
 * sweep, and none ever should be.
 */
const POLICIES = {
  expiredTokens: {
    table: 'refresh_tokens',
    predicate: "expires_at < NOW() - INTERVAL '7 days'",
  },
  sentEmailBodies: {
    table: 'email_queue',
    predicate: "status = 'sent' AND sent_at < NOW() - INTERVAL '30 days' AND (COALESCE(body_html, '') <> '' OR COALESCE(body_text, '') <> '')",
    update: "body_html = '', body_text = ''",
  },
  routineAudit: {
    table: 'audit_logs',
    predicate: `created_at < NOW() - INTERVAL '90 days' AND action IN (:actions)
      AND new_values->>'status' ~ '^[23][0-9][0-9]$'`,
  },
  /**
   * A notification is a delivery record, not the thing it announced. Once it
   * has been read and the quarter has turned, the task, the message or the
   * approval it pointed at is still there and is what anybody would go back
   * to. Unread ones are kept however old they are — an unread notification is
   * somebody's inbox, not litter.
   */
  readNotifications: {
    table: 'notifications',
    predicate: "read_at IS NOT NULL AND created_at < NOW() - INTERVAL '90 days'",
  },
  /**
   * Page views older than a year. The feature-usage report's longest window
   * is 90 days, so nothing on screen can reach these; a year leaves room for
   * a year-on-year question before the rows go. This is the one table that
   * grows with traffic rather than with the number of people, so it is the
   * one most likely to be the answer on a busy workspace.
   */
  oldPageViews: {
    table: 'analytics_events',
    predicate: "event_type = 'page_view' AND created_at < NOW() - INTERVAL '365 days'",
  },
  /**
   * Delivered mail. The bodies are already blanked at thirty days by the
   * policy above; after six months the row itself says nothing the audit log
   * and the suppression list do not. Failed and dead-lettered mail is NOT
   * included — that is the evidence for why somebody never got an email.
   */
  deliveredEmails: {
    table: 'email_queue',
    predicate: "status = 'sent' AND sent_at < NOW() - INTERVAL '180 days'",
  },
};

async function report(db) {
  const counts = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    const [[row]] = await db.query(`SELECT count(*)::int AS count FROM ${policy.table} WHERE ${policy.predicate}`, {
      replacements: { actions: ROUTINE_ACTIONS },
    });
    counts[name] = row.count;
  }
  return counts;
}

/**
 * Where the space actually is.
 *
 * Asked "why is the database 700 MB", nobody could answer, and the guess was
 * that it must be rows somebody could delete. Usually it is not. Two things
 * this surfaces that a row count cannot:
 *
 * Indexes. On this schema they outweigh the data several times over on an
 * almost-empty database, because every index costs pages whether or not
 * anything is in it. Deleting rows does not touch that.
 *
 * Dead tuples. An updated or deleted row keeps its space until VACUUM
 * reclaims it, and a plain VACUUM returns it to the table rather than to the
 * disk. A table can therefore be mostly empty and mostly large at the same
 * time, and no amount of deleting fixes it — that needs VACUUM FULL or
 * pg_repack, which take an exclusive lock and are an operator's decision, not
 * a button in an admin screen.
 *
 * So this reports and does not act.
 */
async function sizeReport(db, { limit = 25 } = {}) {
  const rows = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

  const [[totals]] = await db.query(`
    SELECT
      pg_database_size(current_database())::bigint        AS total_bytes,
      COALESCE(SUM(pg_total_relation_size(relid)), 0)::bigint AS table_bytes,
      COALESCE(SUM(pg_indexes_size(relid)), 0)::bigint       AS index_bytes,
      COALESCE(SUM(n_live_tup), 0)::bigint                   AS live_rows,
      COALESCE(SUM(n_dead_tup), 0)::bigint                   AS dead_rows,
      COUNT(*)::int                                          AS table_count
    FROM pg_stat_user_tables
  `);

  const [tables] = await db.query(`
    SELECT
      relname                                  AS "table",
      pg_total_relation_size(relid)::bigint    AS "totalBytes",
      pg_relation_size(relid)::bigint          AS "heapBytes",
      pg_indexes_size(relid)::bigint           AS "indexBytes",
      n_live_tup::bigint                       AS "liveRows",
      n_dead_tup::bigint                       AS "deadRows",
      last_autovacuum                          AS "lastAutovacuum"
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT :rows
  `, { replacements: { rows } });

  const num = (v) => Number(v || 0);

  return {
    totalBytes: num(totals.total_bytes),
    tableBytes: num(totals.table_bytes),
    indexBytes: num(totals.index_bytes),
    liveRows: num(totals.live_rows),
    deadRows: num(totals.dead_rows),
    tableCount: totals.table_count,
    tables: tables.map((t) => ({
      table: t.table,
      totalBytes: num(t.totalBytes),
      heapBytes: num(t.heapBytes),
      indexBytes: num(t.indexBytes),
      liveRows: num(t.liveRows),
      deadRows: num(t.deadRows),
      lastAutovacuum: t.lastAutovacuum,
    })),
  };
}

async function apply(db, { batchSize = 500, maxBatches = 100 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 ||
      !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 1000) {
    throw new Error('Invalid retention batch limits');
  }
  const counts = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    counts[name] = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      const count = await db.transaction(async transaction => {
        await db.query("SET LOCAL lock_timeout = '2s'", { transaction });
        await db.query("SET LOCAL statement_timeout = '15s'", { transaction });
        const mutation = policy.update
          ? `UPDATE ${policy.table} target SET ${policy.update} FROM candidates WHERE target.id = candidates.id`
          : `DELETE FROM ${policy.table} target USING candidates WHERE target.id = candidates.id`;
        const [[row]] = await db.query(`WITH candidates AS (
          SELECT id FROM ${policy.table} WHERE ${policy.predicate}
          LIMIT :batchSize FOR UPDATE SKIP LOCKED
        ), changed AS (${mutation} RETURNING target.id)
        SELECT count(*)::int AS count FROM changed`, {
          transaction, replacements: { actions: ROUTINE_ACTIONS, batchSize },
        });
        return row.count;
      });
      counts[name] += count;
      if (count < batchSize) break;
    }
  }
  return counts;
}

module.exports = { report, apply, sizeReport, POLICIES };
