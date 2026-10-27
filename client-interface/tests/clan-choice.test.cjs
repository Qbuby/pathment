const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compile(relativePath, requireShim) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, require: requireShim, window: globalThis.window });
  return exports;
}

const selection = compile('lib/utils/clan-selection.ts', () => {
  throw new Error('clan-selection must stay dependency-free');
});

function freshStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  globalThis.window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    },
  };
  return data;
}

function loadChoice() {
  return compile('lib/services/clan-choice.ts', (id) => {
    if (id === '@/lib/utils/clan-selection') return selection;
    throw new Error(`Unexpected dependency ${id}`);
  });
}

test('a clan choice is stored per account, not per browser', () => {
  assert.equal(selection.mentorClanKey('user-1'), 'pathment-active-clan:user-1');
  assert.equal(selection.menteeClanKey('user-1'), 'pathment-active-mentee-clan:user-1');
  assert.notEqual(selection.mentorClanKey('user-1'), selection.mentorClanKey('user-2'));
});

test('no signed-in account has no key to read or write', () => {
  assert.equal(selection.mentorClanKey(null), null);
  assert.equal(selection.menteeClanKey(undefined), null);
  assert.equal(selection.mentorClanKey(''), null);
});

test('the clan a mentor picked is still there when they come back', () => {
  // The complaint: pick a clan, sign out or sign in again, land somewhere else.
  freshStorage();
  const { readClanChoice, writeClanChoice } = loadChoice();
  writeClanChoice('mentor', 'user-1', 'clan-a');
  assert.equal(readClanChoice('mentor', 'user-1'), 'clan-a');
});

test('mentor and mentee portals remember separately', () => {
  freshStorage();
  const { readClanChoice, writeClanChoice } = loadChoice();
  writeClanChoice('mentor', 'user-1', 'clan-a');
  writeClanChoice('mentee', 'user-1', 'clan-b');
  assert.equal(readClanChoice('mentor', 'user-1'), 'clan-a');
  assert.equal(readClanChoice('mentee', 'user-1'), 'clan-b');
});

test('one account never inherits another account\'s clan', () => {
  // This is what the login-time delete used to protect against. Per-account
  // keys give the same protection without throwing the choice away.
  freshStorage();
  const { readClanChoice, writeClanChoice } = loadChoice();
  writeClanChoice('mentor', 'user-1', 'clan-a');
  assert.equal(readClanChoice('mentor', 'user-2'), '');
});

test('an existing global choice is adopted once, then retired', () => {
  const data = freshStorage({ 'pathment-active-clan': 'legacy-clan' });
  const { readClanChoice } = loadChoice();
  assert.equal(readClanChoice('mentor', 'user-1'), 'legacy-clan');
  assert.equal(data.get('pathment-active-clan:user-1'), 'legacy-clan');
  // Retired, so a second account on this browser does not pick it up too.
  assert.equal(data.has('pathment-active-clan'), false);
  assert.equal(readClanChoice('mentor', 'user-2'), '');
});

test('blocked storage degrades to "no choice" rather than throwing', () => {
  globalThis.window = {
    localStorage: {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    },
  };
  const { readClanChoice, writeClanChoice } = loadChoice();
  assert.equal(readClanChoice('mentor', 'user-1'), '');
  assert.doesNotThrow(() => writeClanChoice('mentor', 'user-1', 'clan-a'));
});
