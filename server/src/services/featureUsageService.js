const { sequelize } = require('../db');

/**
 * What is anybody actually using?
 *
 * The product had grown screens faster than anybody could watch them, and
 * there was no way to answer the one question that decides whether a screen
 * gets improved or deleted: does anyone open it? The page-view log had the
 * raw material and nothing read it, so this turns it into three numbers per
 * page — how many times, how many different people, and when last — split by
 * the role whose surface the page belongs to.
 *
 * Two deliberate choices.
 *
 * The key is the page's SHAPE, not its URL. `/w/dev-weekends/mentee/step/<id>`
 * is the same feature however many steps exist, and counting it per step is
 * how a well-used screen reads as a hundred unused ones. The same folding runs
 * on the client before it sends; it is repeated here in SQL so the rows that
 * were written before any of this existed are folded too.
 *
 * People, not views, is the headline. Views reward whatever sits behind a
 * redirect or gets refreshed in a tab all day; the number that answers "should
 * we keep this" is how many different humans went there.
 *
 * What this cannot tell you is which screens exist and have NEVER been opened,
 * because a page nobody visits writes no rows. That list is the whole point,
 * so the caller joins these counts onto the navigation config — the registry
 * of every page each role can reach — and the zeroes fall out of the join.
 */

/**
 * The same normalisation as lib/utils/page-key.ts on the client.
 *
 * Kept as one SQL expression rather than read-and-reduce in JS: there can be
 * a row per page view per person, and folding a quarter of a million of them
 * in Node to produce forty numbers would be the wrong place to do it.
 */
const PAGE_KEY = `
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          split_part(split_part(ae.event_data->>'page', '?', 1), '#', 1),
          '^/w/[^/]+', ''
        ),
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/:id', 'gi'
      ),
      '/[0-9]+(?=/|$)', '/:id', 'g'
    ),
    '(.)/$', '\\1', ''
  )
`;

const featureUsageService = {
  /**
   * Per-page counts over a window, newest activity first.
   *
   * @param {object} opts
   * @param {string} opts.organizationId  scope: only this org's people
   * @param {number} opts.days            window, 1..365
   */
  async pageUsage({ organizationId, days = 30 }) {
    const window = Math.min(365, Math.max(1, parseInt(days, 10) || 30));

    const [rows] = await sequelize.query(
      `
      SELECT
        ${PAGE_KEY}                                   AS page,
        COUNT(*)::int                                 AS views,
        COUNT(DISTINCT ae.user_id)::int               AS people,
        MAX(ae.created_at)                            AS last_used
      FROM analytics_events ae
      JOIN users u ON u.id = ae.user_id
      JOIN organization_memberships om
        ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE ae.event_type = 'page_view'
        AND ae.created_at >= NOW() - (:days || ' days')::interval
        AND ae.event_data->>'page' IS NOT NULL
      GROUP BY 1
      HAVING ${PAGE_KEY} <> ''
      ORDER BY people DESC, views DESC
      `,
      { replacements: { organizationId, days: window } },
    );

    return rows.map((r) => ({
      page: r.page,
      views: r.views,
      people: r.people,
      lastUsed: r.last_used,
    }));
  },

  /**
   * How many people of each role were seen at all in the window.
   *
   * Without it a page used by three of the four admins and a page used by
   * three of six hundred mentees are the same "3", which is the wrong
   * comparison to put in front of somebody deciding what to delete.
   */
  async activePeopleByRole({ organizationId, days = 30 }) {
    const window = Math.min(365, Math.max(1, parseInt(days, 10) || 30));

    const [rows] = await sequelize.query(
      `
      SELECT u.role AS role, COUNT(DISTINCT ae.user_id)::int AS people
      FROM analytics_events ae
      JOIN users u ON u.id = ae.user_id
      JOIN organization_memberships om
        ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE ae.event_type = 'page_view'
        AND ae.created_at >= NOW() - (:days || ' days')::interval
      GROUP BY 1
      `,
      { replacements: { organizationId, days: window } },
    );

    const out = {};
    for (const r of rows) out[r.role] = r.people;
    return out;
  },

  /**
   * Everyone who could have been counted, by role.
   *
   * The denominator for "3 people used it": three of how many? Active members
   * only — a suspended account not opening a page says nothing about the page.
   */
  async eligiblePeopleByRole({ organizationId }) {
    const [rows] = await sequelize.query(
      `
      SELECT u.role AS role, COUNT(*)::int AS people
      FROM users u
      JOIN organization_memberships om
        ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE u.status = 'active'
      GROUP BY 1
      `,
      { replacements: { organizationId } },
    );

    const out = {};
    for (const r of rows) out[r.role] = r.people;
    return out;
  },

  /** Day-by-day page views, for the sparkline over the window. */
  async dailyViews({ organizationId, days = 30 }) {
    const window = Math.min(365, Math.max(1, parseInt(days, 10) || 30));

    const [rows] = await sequelize.query(
      `
      SELECT to_char(ae.created_at, 'YYYY-MM-DD') AS day,
             COUNT(*)::int                        AS views,
             COUNT(DISTINCT ae.user_id)::int      AS people
      FROM analytics_events ae
      JOIN users u ON u.id = ae.user_id
      JOIN organization_memberships om
        ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE ae.event_type = 'page_view'
        AND ae.created_at >= NOW() - (:days || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      { replacements: { organizationId, days: window } },
    );

    return rows.map((r) => ({ day: r.day, views: r.views, people: r.people }));
  },

  /** Everything the report needs, in one round trip. */
  async overview({ organizationId, days = 30 }) {
    const window = Math.min(365, Math.max(1, parseInt(days, 10) || 30));

    const [pages, activeByRole, eligibleByRole, daily, since] = await Promise.all([
      this.pageUsage({ organizationId, days: window }),
      this.activePeopleByRole({ organizationId, days: window }),
      this.eligiblePeopleByRole({ organizationId }),
      this.dailyViews({ organizationId, days: window }),
      // Nothing recorded at all reads as "no usage" on the page, which is the
      // wrong conclusion when the truth is "tracking only started on Tuesday".
      this.trackingSince({ organizationId }),
    ]);

    const windowStart = Date.now() - window * 86400000;

    return {
      days: window,
      pages,
      activeByRole,
      eligibleByRole,
      daily,
      trackingSince: since,
      /**
       * Whether the record actually goes back as far as the window claims.
       *
       * Decided here rather than in the browser so the comparison uses one
       * clock. A viewer whose machine is a day ahead would otherwise be told
       * the data is complete when it is not, which is the one thing this flag
       * exists to prevent.
       */
      coversFullWindow: since ? new Date(since).getTime() <= windowStart : false,
    };
  },

  /** The first page view we ever recorded — the honest start of the record. */
  async trackingSince({ organizationId }) {
    const [rows] = await sequelize.query(
      `
      SELECT MIN(ae.created_at) AS since
      FROM analytics_events ae
      JOIN organization_memberships om
        ON om.user_id = ae.user_id AND om.organization_id = :organizationId
      WHERE ae.event_type = 'page_view'
      `,
      { replacements: { organizationId } },
    );
    return rows[0]?.since || null;
  },
};

module.exports = featureUsageService;
