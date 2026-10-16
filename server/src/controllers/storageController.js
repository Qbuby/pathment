const { sequelize } = require('../db');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const retention = require('../services/dataRetentionService');
const logger = require('../utils/logger');

/**
 * Where the database size actually is, and what may be removed.
 *
 * The question that prompted this — "it shows around 700 MB, remove the
 * unnecessary data" — could not be answered by anybody, because nothing
 * reported which tables were big. The guess is always that it must be rows
 * somebody could delete, and usually it is not: on this schema indexes
 * outweigh the data several times over, and a table that has been updated a
 * lot keeps its dead rows' space until VACUUM reclaims it.
 *
 * So the read endpoint reports, and the write endpoint removes only what a
 * standing policy already removes on a timer. There is no endpoint that
 * deletes anything else; a screen that can delete arbitrary data is a worse
 * problem than a large database.
 */

/** GET /api/admin/storage → sizes, and what each policy would remove now. */
const overview = catchAsync(async (req, res) => {
  const [size, prunable] = await Promise.all([
    retention.sizeReport(sequelize, { limit: req.query.limit }),
    retention.report(sequelize),
  ]);

  res.status(200).json(successResponse('Storage overview', {
    ...size,
    prunable,
    // What the sweep covers, so the screen can explain each line rather than
    // showing a bare key and a number.
    policies: Object.keys(prunable),
  }));
});

/**
 * POST /api/admin/storage/sweep → run the retention policies now.
 *
 * Deliberately the same code the daily worker runs, in the same batches with
 * the same lock and statement timeouts. This button does not do anything the
 * product would not have done by itself tomorrow; it only does it today. The
 * counts come back so the screen can say what went, and the result is logged
 * because an unexplained drop in row counts is alarming to whoever finds it
 * next.
 */
const sweep = catchAsync(async (req, res) => {
  const removed = await retention.apply(sequelize);
  logger.info('Data retention run from the admin screen', { userId: req.user.id, removed });

  res.status(200).json(successResponse('Retention sweep complete', {
    removed,
    // Deleting rows frees pages back to the table, not to the disk, so the
    // number on the hosting dashboard will not move until a VACUUM FULL. Say
    // so here rather than let the screen imply otherwise.
    reclaimsDiskSpace: false,
  }));
});

module.exports = { overview, sweep };
