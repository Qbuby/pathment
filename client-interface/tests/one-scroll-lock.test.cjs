/**
 * One owner for background scroll, everywhere.
 *
 * Six overlays locked the page independently — save `document.body.style
 * .overflow`, set it to `hidden`, put the saved value back on close. Correct
 * alone, broken together: the value the second one saves is the `hidden` the
 * first one just wrote, so when the second closes it restores `hidden` and the
 * page cannot be scrolled until a refresh. Mentors and mentees reported it as
 * "scrolling stops working on some screens", which is exactly how it presents
 * — the page it strands you on is just wherever you navigated next.
 *
 * The fix is a count rather than a saved value, in one module. This guards it:
 * a seventh overlay that reaches for `document.body.style.overflow` itself
 * fails here instead of shipping and being noticed weeks later on some
 * unrelated screen.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCK = path.join('lib', 'hooks', 'useScrollLock.ts');

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      sourceFiles(rel, acc);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      acc.push(rel);
    }
  }
  return acc;
}

const files = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('only the shared hook touches body overflow', () => {
  const offenders = [];
  for (const rel of files) {
    if (rel === LOCK) continue;
    read(rel).split('\n').forEach((line, i) => {
      if (/(document\.body|documentElement)\.style\.overflow/.test(line)) {
        offenders.push(`${rel}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(
    offenders, [],
    `Locking scroll by hand races every other overlay. Use useScrollLock() from ${LOCK}:\n  ${offenders.join('\n  ')}`,
  );
});

test('the lock counts holders instead of saving the previous value', () => {
  const src = read(LOCK);
  // The first lock records what overflow was; the last release puts it back.
  assert.match(src, /locks === 0/, 'the first holder must be the one that records the original value');
  assert.match(src, /locks \+= 1/, 'holders are counted');
  assert.match(src, /Math\.max\(0, locks - 1\)/, 'the count must not go negative');
  assert.match(src, /released/, 'releasing twice must not decrement twice');
});

test('every overlay that used to lock still does', () => {
  const expected = [
    [path.join('components', 'shared', 'Drawer.tsx'), 'useScrollLock(mounted)'],
    [path.join('components', 'shared', 'NotificationDrawer.tsx'), 'useScrollLock(isOpen)'],
    [path.join('components', 'shared', 'ChangelogMount.tsx'), 'useScrollLock(open)'],
    [path.join('components', 'shared', 'LiveMeetingOverlay.tsx'), 'useScrollLock()'],
    [path.join('components', 'mentor', 'AssignTaskDrawer.tsx'), 'useScrollLock()'],
    [path.join('components', 'admin', 'certificates', 'TierPreviewGallery.tsx'), 'useScrollLock(open)'],
  ];
  for (const [rel, call] of expected) {
    const src = read(rel);
    assert.ok(src.includes(call), `${rel} should lock scroll with ${call}`);
    assert.ok(
      src.includes("from '@/lib/hooks/useScrollLock'") || src.includes('from "@/lib/hooks/useScrollLock"'),
      `${rel} should import the shared lock`,
    );
  }
});

test('a drawer closing under a sheet leaves the page scrollable', () => {
  // The real sequence, against the real module: drawer opens, sheet opens on
  // top, drawer closes first. Before the fix this ended at 'hidden'.
  const body = { style: { overflow: '' } };

  // The source is TypeScript and there is no compiler here, so lift out
  // lockBodyScroll and drop its two annotations. Both strips are asserted, so
  // a rewritten module fails loudly rather than quietly testing nothing.
  const raw = read(LOCK);
  const start = raw.indexOf('let locks = 0;');
  const end = raw.indexOf('export function useScrollLock', start);
  assert.ok(start !== -1 && end > start, 'could not find the lock implementation');

  let strips = 0;
  const source = raw
    .slice(start, end)
    .replace(/: string \| null/g, () => { strips += 1; return ''; })
    .replace(/\(\): \(\) => void/g, () => { strips += 1; return '()'; })
    .replace(/^export /gm, '');
  assert.equal(strips, 2, 'the annotations this test strips have moved');

  const { lockBodyScroll } = new Function(
    'document', `${source}\nreturn { lockBodyScroll };`,
  )({ body });

  const releaseDrawer = lockBodyScroll();
  assert.equal(body.style.overflow, 'hidden', 'the drawer locks');
  const releaseSheet = lockBodyScroll();
  releaseDrawer();
  assert.equal(body.style.overflow, 'hidden', 'still locked while the sheet is open');
  releaseSheet();
  assert.equal(body.style.overflow, '', 'the last one out unlocks the page');

  releaseSheet();
  releaseDrawer();
  assert.equal(body.style.overflow, '', 'releasing twice changes nothing');
  assert.equal(lockBodyScroll() && body.style.overflow, 'hidden', 'and the next lock still works');
});
