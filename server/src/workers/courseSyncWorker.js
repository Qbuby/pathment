const logger = require('../utils/logger');
const { forEachWorkspace } = require('../utils/workspaceExecution');

/**
 * Keeps course tasks moving without anyone opening them: reads progress for
 * every open course enrollment so a course finished on Buildment completes its
 * Pathment task (and awards its points). Read-only towards Buildment.
 */
const INTERVAL_MS = 15 * 60 * 1000;
let timer;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const courseService = require('../services/courseService');
    await forEachWorkspace(async () => { await courseService.syncActive(); });
  } catch (error) {
    logger.error('Course sync failed', { message: error.message });
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  // Delay the first pass until the API has finished starting.
  const first = setTimeout(tick, 60_000);
  first.unref();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
}

module.exports = { start };
