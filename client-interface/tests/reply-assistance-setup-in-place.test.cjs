/**
 * Reply assistance is set up where it is used.
 *
 * The server has always known exactly what was missing — `GET /auto-reply`
 * returns three steps, each with why it matters and whether it is done. The
 * only way to ACT on any of them was to leave the conversation for three other
 * screens: Settings then AI connections for the key, Settings then Reply
 * assistance for the material, and a toggle that stays grey until both are
 * done. A mentor in a chat read "No pending drafts for this conversation" and
 * was given no reason and nowhere to go, so nobody ever finished it.
 *
 * These guard the shape of the fix rather than its pixels: the checklist stays
 * the server's, the chat offers a way in, and connecting a key also points it
 * at the feature — which is the step that was missing entirely and the reason
 * a fully "set up" mentor could still never see a draft.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DRAWER = 'components/mentor/ReplyAssistantDrawer.tsx';
const CHAT = 'components/shared/messages/MessageCenter.tsx';

test('the chat offers a way into setup instead of a dead end', () => {
  const src = read(CHAT);
  assert.match(src, /ReplyAssistantDrawer/, 'the chat must mount the setup drawer');
  assert.match(
    src,
    /Set it up|Turn it on/,
    'the empty drafts panel must offer the next action, not only state the absence',
  );
  // The panel has to say WHICH absence it is: never set up, or set up and off.
  assert.match(src, /assistantStatus/, 'the panel must read the real readiness, not guess');
});

test('the checklist is the server’s, never rebuilt in the browser', () => {
  const src = read(DRAWER);
  assert.match(src, /useAutoReply/, 'readiness comes from GET /auto-reply');
  // Whether a mentor is ready depends on their key, their ingested chunks and
  // how much of their writing has been studied. None of that is knowable here,
  // and a second opinion computed in the browser would eventually disagree
  // with the one the server enforces on enable.
  assert.match(
    src,
    /const canEnable = status\?\.canEnable/,
    'canEnable must be taken from the server payload, not derived locally',
  );
});

test('connecting a key also points it at reply assistance', () => {
  const src = read(DRAWER);
  // ragOrchestrator resolves its model through feature ROUTING and quietly
  // returns nothing when none is set, logging "no generation key routed to
  // rag_generation". Adding a key without routing it is the trap that let a
  // mentor finish every visible step and still never see a draft.
  for (const feature of ['rag_generation', 'rag_grounding', 'rag_embedding']) {
    assert.match(src, new RegExp(feature), `connecting a key must route ${feature}`);
  }
  assert.match(src, /setRouting/, 'the drawer must persist the routing it promises');
});

test('a key that failed its own test does not count as connected', () => {
  const src = read(DRAWER);
  // The column holds 'connected' | 'error' | 'untested'. Counting an 'error'
  // key would promise a draft that can never be written.
  assert.match(src, /status !== 'error'/, "a 'error' key must not satisfy the key step");
  assert.ok(
    !/status !== 'invalid'/.test(src),
    "'invalid' is not a value this column can hold, so filtering on it excludes nothing",
  );
});

test('an admin is shown only the step an admin can clear', () => {
  const src = read(DRAWER);
  // The material and the writing style are each mentor's own; an admin who
  // does not mentor has neither. What an admin uniquely can do is add the
  // workspace-wide key, which clears step one for every mentor at once.
  assert.match(
    src,
    /role === 'admin' \? allSteps\.filter\(\(step\) => step\.key === 'key'\)/,
    'the admin view must narrow to the key step',
  );
});

test('the enable button stays gated by the server answer', () => {
  const src = read(DRAWER);
  assert.match(
    src,
    /disabled=\{toggling \|\| \(!enabled && !canEnable\)\}/,
    'turning it on must be impossible until the server says it is ready',
  );
});
