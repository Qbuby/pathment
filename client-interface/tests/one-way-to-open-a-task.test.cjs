/**
 * Clicking a task does the same thing everywhere a mentee can click one.
 *
 * The task list and the day planner opened a drawer over the page; This Week
 * sent you to a full page and left you to find your way back. Same card, same
 * title, same click, two different outcomes — and the one that navigated was
 * the home screen, so it was the one most people met first.
 *
 * The rule this guards is not "never navigate". `/mentee/tasks/:id` is the
 * durable address: notification emails link to it, it survives a reload, and
 * ⌘-click still has to reach it. That is why every one of these is an anchor
 * with the real href that calls preventDefault on a plain click. A new mentee
 * surface that lists tasks should copy that, not a bare router.push.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every mentee surface that lists tasks, and opens them where the mentee is. */
const SURFACES = [
  'app/mentee/dashboard/page.tsx',
  'app/mentee/tasks/page.tsx',
  'components/mentee/DayPlanner.tsx',
];

/**
 * The planner's rows are `draggable` — that is how a task is moved into a time
 * block — and an anchor drags its own href by default, which fights it. So
 * the planner opens the same drawer but not from a link, and ⌘-click there
 * does nothing rather than opening the page. Known, and the better trade.
 */
const NO_ANCHOR = new Set(['components/mentee/DayPlanner.tsx']);

test('every mentee task list opens the shared drawer', () => {
  for (const rel of SURFACES) {
    const src = read(rel);
    assert.ok(
      src.includes("from '@/components/mentee/TaskDrawer'")
        || src.includes('from "@/components/mentee/TaskDrawer"'),
      `${rel} should open tasks in the shared TaskDrawer, not on its own page`,
    );
    assert.match(src, /<TaskDrawer\b/, `${rel} should render the TaskDrawer`);
  }
});

test('the full page stays reachable by modifier click', () => {
  for (const rel of SURFACES) {
    if (NO_ANCHOR.has(rel)) continue;
    const src = read(rel);
    // The href is the durable address; the handler is only the shortcut.
    assert.match(
      src, /href=\{`\/mentee\/tasks\/\$\{[^}]+\}`\}/,
      `${rel} should keep /mentee/tasks/:id as the real href`,
    );
    assert.match(
      src, /metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/,
      `${rel} should let a modifier click through to the page`,
    );
  }
});

test('the task page itself is still there to be linked to', () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, 'app/mentee/tasks/[id]/page.tsx')),
    'notifications link to /mentee/tasks/:id — the route has to resolve',
  );
});
