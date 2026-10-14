/**
 * The two files a phone reads before it will open a link in the app.
 *
 * Neither is decoration. Without assetlinks.json Android hands every email
 * link to the browser, which is how a one-time sign-in link ended up on a web
 * login form asking for the password it exists to avoid.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute(relative, env) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  class NextResponse {
    constructor(body, init) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body, init) {
      // Through JSON, so the assertions compare plain objects from this realm
      // rather than ones built inside the vm context, which deepEqual refuses.
      return {
        status: init?.status ?? 200,
        headers: init?.headers ?? {},
        body: JSON.parse(JSON.stringify(body)),
      };
    }
  }

  vm.runInNewContext(code, {
    exports,
    process: { env },
    require: (id) => {
      if (id === 'next/server') return { NextResponse };
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  return exports;
}

const ANDROID = 'app/app-links/assetlinks.json/route.ts';
const APPLE = 'app/app-links/apple-app-site-association/route.ts';
const FINGERPRINT = Array(32).fill('AB').join(':');

test('android: a configured fingerprint is published for the app package', async () => {
  const { GET } = loadRoute(ANDROID, {
    ANDROID_APP_PACKAGE: 'me.pathment.app',
    ANDROID_APP_FINGERPRINTS: FINGERPRINT.toLowerCase(),
  });

  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.body[0].target.package_name, 'me.pathment.app');
  // Upper case, which is the form Android compares.
  assert.deepEqual(response.body[0].target.sha256_cert_fingerprints, [FINGERPRINT]);
  assert.deepEqual(response.body[0].relation, ['delegate_permission/common.handle_all_urls']);
});

test('android: both signing keys are published, upload and Play', async () => {
  const other = Array(32).fill('CD').join(':');
  const { GET } = loadRoute(ANDROID, { ANDROID_APP_FINGERPRINTS: `${FINGERPRINT}, ${other}` });

  const response = await GET();
  assert.deepEqual(response.body[0].target.sha256_cert_fingerprints, [FINGERPRINT, other]);
});

test('android: nothing configured is a 404, never an empty statement list', async () => {
  // An empty list is a file saying this host trusts no app, and Android caches
  // that answer. Saying nothing at all is the honest state of an unconfigured
  // deployment.
  const { GET } = loadRoute(ANDROID, {});

  const response = await GET();
  assert.equal(response.status, 404);
});

test('android: a malformed fingerprint is dropped rather than published', async () => {
  const { GET } = loadRoute(ANDROID, { ANDROID_APP_FINGERPRINTS: 'not-a-fingerprint' });

  const response = await GET();
  assert.equal(response.status, 404);
});

test('apple: the app id is published against the link paths only', async () => {
  const { GET } = loadRoute(APPLE, { IOS_APP_IDS: 'ABCDE12345.me.pathment.app' });

  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.applinks.details, [
    { appID: 'ABCDE12345.me.pathment.app', paths: ['/i/*', '/r/*', '/v/*', '/m/*', '/g/*'] },
  ]);
});

test('apple: an id without a team prefix is not published', async () => {
  const { GET } = loadRoute(APPLE, { IOS_APP_IDS: 'me.pathment.app' });

  const response = await GET();
  assert.equal(response.status, 404);
});
