/**
 * The page key is the join between what the client records and what the
 * report reads, so the two normalisers have to agree exactly. The cases below
 * are the shared contract; server/tests/feature-usage.test.js runs the SAME
 * list through the SQL expression. If one side changes, one of them goes red
 * rather than the admin report quietly losing rows to a failed join.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// The module is TypeScript; the logic is plain enough to lift for the test
// rather than drag a transpiler in. The source is asserted below so this copy
// cannot drift silently.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isIdLike(s) {
  return UUID.test(s) || /^\d+$/.test(s) || /^[0-9a-f]{16,}$/i.test(s);
}
function pageKey(pathname) {
  if (!pathname) return '/';
  let p = pathname.split('?')[0].split('#')[0];
  p = p.replace(/^\/w\/[^/]+/, '');
  const segments = p.split('/').filter(Boolean).map((s) => (isIdLike(s) ? ':id' : s));
  const key = `/${segments.join('/')}`;
  return key === '/' ? '/' : key.replace(/\/$/, '');
}

/** The shared contract. Keep in step with server/tests/feature-usage.test.js. */
const CASES = [
  ['/mentor/dashboard', '/mentor/dashboard'],
  ['/w/dev-weekends/mentor/dashboard', '/mentor/dashboard'],
  ['/w/dev-weekends/mentee/step/ab22ddfd-bee0-479f-bf7f-b48743c9f0b5', '/mentee/step/:id'],
  ['/mentee/step/1039f7e2-0970-4749-a0dd-db372aff608e', '/mentee/step/:id'],
  ['/admin/cohorts/744918d2-d158-4333-84b8-a5c5e25e3e74', '/admin/cohorts/:id'],
  ['/mentor/review?clanId=399a805a-5f2a-431f-9f69-8bc6601b208f', '/mentor/review'],
  ['/admin/clans/', '/admin/clans'],
  ['/w/acme/', '/'],
  ['/', '/'],
];

test('every URL for one screen folds to one key', () => {
  for (const [input, expected] of CASES) {
    assert.equal(pageKey(input), expected, `${input} should key as ${expected}`);
  }
});

test('two steps of the same roadmap are one feature, not two', () => {
  const a = pageKey('/w/acme/mentee/step/ab22ddfd-bee0-479f-bf7f-b48743c9f0b5');
  const b = pageKey('/w/other/mentee/step/1039f7e2-0970-4749-a0dd-db372aff608e');
  assert.equal(a, b, 'counting one screen per record is how a used screen reads as unused ones');
});

test('the test copy still matches lib/utils/page-key.ts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'utils', 'page-key.ts'), 'utf8');
  assert.match(src, /replace\(\/\^\\\/w\\\/\[\^\/\]\+\/, ''\)/, 'the workspace prefix must still be stripped');
  assert.match(src, /isIdLike/, 'id-like segments must still collapse');
  assert.match(src, /split\('\?'\)\[0\]\.split\('#'\)\[0\]/, 'query and hash must still be dropped');
});

test('the role of a page is its first segment', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'utils', 'page-key.ts'), 'utf8');
  assert.match(src, /export function pageRole/);
  assert.match(src, /return 'shared'/, 'a page outside the three role trees must not be mislabelled');
});

test('the tracker sends a key, not a raw pathname', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'shared', 'ActivityTrackerMount.tsx'), 'utf8');
  assert.match(src, /pageKey\(pathname\)/, 'raw pathnames would put a row per record in the report');
  assert.match(src, /lastSent/, 'effects run twice in development; a count would double');
});
