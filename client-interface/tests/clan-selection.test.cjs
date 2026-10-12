const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/utils/clan-selection.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { ALL_CLANS, defaultClanOf, resolveMentorClan, resolveMenteeClan } = loaded.exports;

const live = { id: 'live', kind: 'cohort', frozenAt: null };
const standing = { id: 'standing', kind: 'standing', frozenAt: null };
const finished = { id: 'finished', kind: 'cohort', frozenAt: '2026-01-01' };

test('the clan they picked last time is the clan they get', () => {
  assert.equal(resolveMentorClan('live', [live, standing], false), 'live');
  assert.equal(resolveMenteeClan('standing', [live, standing], false), 'standing');
});

test('never having chosen does not mean "All clans"', () => {
  // The complaint: open Pathment, land on a merged view of everything.
  assert.equal(resolveMentorClan('', [live, standing], false), 'live');
  assert.notEqual(resolveMentorClan('', [live, standing], false), ALL_CLANS);
});

test('choosing "All clans" is a real choice and survives', () => {
  assert.equal(resolveMentorClan(ALL_CLANS, [live, standing], false), ALL_CLANS);
});

test('a finished programme is never the landing clan while a live one exists', () => {
  assert.equal(resolveMentorClan('', [finished, live], false), 'live');
  assert.equal(resolveMenteeClan('', [finished, standing], false), 'standing');
  // ...but it is better than nothing when it is all there is.
  assert.equal(resolveMentorClan('', [finished], false), 'finished');
});

/**
 * The regression that caused the flash: memberships arrive asynchronously, so
 * the list is empty for the first render. Treating that as "your clan is gone"
 * dropped everyone to All clans for a beat on every single page load.
 */
test('an empty list while loading is not evidence the clan is gone', () => {
  assert.equal(resolveMentorClan('live', [], true), 'live');
  assert.equal(resolveMenteeClan('standing', [], true), 'standing');
});

test('a clan that really has gone falls forward to a live one', () => {
  assert.equal(resolveMentorClan('removed-clan', [live, standing], false), 'live');
  assert.equal(resolveMenteeClan('removed-clan', [standing], false), 'standing');
});

test('before storage is read nothing is claimed', () => {
  assert.equal(resolveMentorClan(null, [live], false), ALL_CLANS);
  assert.equal(resolveMenteeClan(null, [live], false), '');
});

test('a mentor with no clans at all has nothing to land on', () => {
  assert.equal(resolveMentorClan('', [], false), ALL_CLANS);
  assert.equal(resolveMenteeClan('', [], false), '');
  assert.equal(defaultClanOf([]), null);
});
