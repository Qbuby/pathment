/**
 * There is one right-edge drawer, and it lives in components/shared/Drawer.tsx.
 *
 * Nine screens had grown their own. Each was the same twenty lines typed again
 * — a fixed wrapper, a backdrop, a panel, a header with an X, a scrolling body,
 * a footer rail — and each was missing the parts that are not visible while you
 * are typing them: it did not animate out, did not answer Escape, did not trap
 * Tab inside itself, did not lock the page behind it, and did not return focus
 * to whatever opened it. Those are not polish. A sheet you cannot close with
 * the keyboard is a sheet a keyboard user is stuck in.
 *
 * Nobody wrote those by choice; they wrote them because re-typing the markup
 * was quicker than finding the component. So this test does the finding: a new
 * `fixed inset-0 … justify-end` anywhere under app/ or components/ fails here
 * with the name of the thing to use instead.
 *
 * Centred dialogs are a different animal and are deliberately not covered —
 * confirmations belong to useConfirm(), per ConfirmProvider.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * The two sheets that are knowingly not the shared Drawer, and why.
 *
 * Both are the same judgement: the shared Drawer puts its children in one
 * padded scrolling box, and these two have bands that must stay put while the
 * content under them scrolls. Forcing them through it would change how they
 * scroll, which is a worse outcome than the duplication. Shrink this list by
 * teaching the Drawer, never by adding to it.
 */
const KNOWN = new Set([
  // A wide preview table with sticky run-settings and summary bands above it,
  // and a footer that is a hint on the left and buttons on the right.
  'components/admin/AssignToClansDrawer.tsx',
  // Sticky source tabs above the scroll area, its own portal (it opens from
  // inside another drawer, whose transform would otherwise contain it), and a
  // draft that must survive a dismiss.
  'components/mentor/AssignTaskDrawer.tsx',
]);

function tsxFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      tsxFiles(rel, acc);
    } else if (entry.name.endsWith('.tsx')) {
      acc.push(rel);
    }
  }
  return acc;
}

const files = [...tsxFiles('app'), ...tsxFiles('components')];

// `fixed inset-0 … justify-end` on one element: a full-screen layer that pins
// its panel to the right edge. That is a drawer, whatever it is called.
const RIGHT_EDGE = /className="[^"]*\bfixed\b[^"]*\binset-0\b[^"]*\bjustify-end\b[^"]*"/;

test('nothing hand-rolls a right-edge drawer', () => {
  const offenders = files.filter((rel) => {
    if (rel === path.join('components', 'shared', 'Drawer.tsx')) return false;
    if (KNOWN.has(rel.split(path.sep).join('/'))) return false;
    return RIGHT_EDGE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  });

  assert.deepEqual(offenders, [],
    'A hand-rolled slide-over misses Escape, the focus trap, the scroll lock, the exit '
    + 'animation and the focus restore. Use `Drawer` from components/shared/Drawer '
    + '(title / subtitle / headerMeta / footer / width). Found in:\n  '
    + offenders.join('\n  '));
});

test('the shared Drawer still does the things the copies forgot', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'shared', 'Drawer.tsx'), 'utf8');
  assert.match(src, /e\.key === "Escape"/, 'Escape must close it');
  assert.match(src, /e\.key !== "Tab"/, 'Tab must stay inside the panel');
  // Locking is the shared hook's job now — six overlays each saving and
  // restoring body.overflow raced and left the page stuck. See
  // one-scroll-lock.test.cjs.
  assert.match(src, /useScrollLock\(mounted\)/, 'the page behind it must not scroll');
  assert.match(src, /previousFocus\?\.isConnected/, 'focus must go back to whatever opened it');
  assert.match(src, /createPortal/, 'it must escape any transformed ancestor');
});
