const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exports_ = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/utils/linkify.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports: exports_, module: { exports: exports_ }, require: () => { throw new Error('no deps'); } },
);
const { linkify, shortenUrl } = exports_;

const links = (s) => linkify(s).filter((p) => p.kind === 'link');
const rebuilt = (s) => linkify(s).map((p) => p.value).join('');

test('a pasted link becomes a link', () => {
  // The mentor announcement that prompted this: a WhatsApp invite as plain text.
  const l = links('please use the following link: https://chat.whatsapp.com/BDaKXOrKtkl7');
  assert.equal(l.length, 1);
  assert.equal(l[0].href, 'https://chat.whatsapp.com/BDaKXOrKtkl7');
});

test('a bare www host is given a scheme', () => {
  assert.equal(links('see www.example.com/docs now')[0].href, 'https://www.example.com/docs');
});

test('sentence punctuation is not swallowed into the URL', () => {
  const l = links('read https://example.com/a.');
  assert.equal(l[0].href, 'https://example.com/a');
  assert.equal(rebuilt('read https://example.com/a.'), 'read https://example.com/a.');
});

test('text with no links comes back as one part', () => {
  const parts = linkify('nothing to click here');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].kind, 'text');
});

test('every character of the original survives', () => {
  const s = 'a https://x.dev/1 b www.y.dev/2, c';
  assert.equal(rebuilt(s), s);
});

test('empty input is safe', () => {
  // Length, not deepEqual: the array is built inside the vm realm, so its
  // prototype is not the one this file's `Array` points at.
  assert.equal(linkify('').length, 0);
  assert.equal(linkify(null).length, 0);
});

test('long URLs are shortened for display but stay whole in href', () => {
  const long = 'https://example.com/' + 'x'.repeat(80);
  assert.ok(shortenUrl(long).length <= 48);
  assert.equal(links(`go ${long}`)[0].href, long);
});
