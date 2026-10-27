/**
 * One loading indicator, everywhere.
 *
 * Screens had drifted into five ways of saying "wait": the Loader2 icon in a
 * dozen sizes and colours, three hand-rolled CSS ring spinners, and a Clock or
 * RotateCw icon spun on its axis. This guards the cleanup — a new competing
 * spinner fails here rather than shipping and being noticed on one screen.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ALLOWED = new Set([
  // The one place the indicator is defined.
  path.join('components', 'shared', 'LoadingSpinner.tsx'),
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

/** Lines that spin something, with their file and number. */
function spinningLines() {
  const out = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.includes('animate-spin')) out.push({ rel, line, n: i + 1 });
    });
  }
  return out;
}

test('nobody hand-rolls a CSS ring spinner', () => {
  const rings = spinningLines().filter(({ line }) =>
    /border-t-|border-b-\d|rounded-full[^"']*border-\d/.test(line) && /animate-spin/.test(line));
  assert.deepEqual(rings.map((r) => `${r.rel}:${r.n}`), [],
    'use <Spinner> from components/shared/LoadingSpinner instead of a bordered div');
});

test('no icon other than the loader stands in for "loading"', () => {
  // A Clock spun on its axis reads as "time is passing", not "loading".
  //
  // A refresh arrow that spins only WHILE its own action runs is a different
  // thing and stays allowed: it is one icon in two states on the button that
  // triggered the work, not the app-is-busy indicator. The tell is the
  // conditional — `${busy ? 'animate-spin' : ''}`.
  const wrong = spinningLines().filter(({ line }) => {
    if (!/<(Clock|RotateCw|RefreshCw|Cog|Settings|Hourglass)\b[^>]*animate-spin/.test(line)) return false;
    return !/\?\s*'animate-spin'|animate-spin'\s*:|\?\s*"animate-spin"/.test(line);
  });
  assert.deepEqual(wrong.map((r) => `${r.rel}:${r.n}`), [],
    'only Loader2 (via <Spinner>) may stand in for loading');
});

test('spinners do not pick their own off-brand colour', () => {
  const offBrand = spinningLines().filter(({ rel, line }) => {
    if (ALLOWED.has(rel)) return false;
    const classes = line.match(/className=(["'`])([^"'`]*animate-spin[^"'`]*)\1/);
    if (!classes) return false;
    return /text-(primary|violet-\d+|slate-[345]00|brand-500)\b/.test(classes[2]);
  });
  assert.deepEqual(offBrand.map((r) => `${r.rel}:${r.n}`), [],
    'loaders are text-brand-600 (or text-white on a filled button)');
});

test('the shared loader is exported from one place', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components/shared/index.ts'), 'utf8');
  assert.match(src, /export \{[^}]*\bSpinner\b[^}]*\} from '\.\/LoadingSpinner'/);
});
