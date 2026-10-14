import { NextResponse } from 'next/server';

/**
 * Served at /.well-known/assetlinks.json (see next.config.ts) — Android App Links.
 *
 * Android only hands a https link to an app when the host says, from the host
 * itself, that it trusts that app. Without this file every link in every email
 * opens the browser, however the app is configured, and a person tapping a
 * one-time sign-in link on a phone with Pathment installed ends up on a web
 * login form. That is exactly what was happening.
 *
 * The fingerprints are the SHA-256 of the certificate the installed build is
 * signed with. There are usually two: the upload key and the one Play App
 * Signing re-signs with. `gradlew signingReport`, or the Play Console under
 * Setup, App integrity, gives them.
 *
 * Unset means not configured, and a 404 is the honest answer: an empty
 * statement list is a file that says "this host trusts no app", which Android
 * caches.
 */
const PACKAGE = process.env.ANDROID_APP_PACKAGE || 'me.pathment.app';

const fingerprints = () =>
  (process.env.ANDROID_APP_FINGERPRINTS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

export async function GET() {
  const certs = fingerprints();
  if (certs.length === 0) return new NextResponse('Not found', { status: 404 });

  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: PACKAGE,
          sha256_cert_fingerprints: certs,
        },
      },
    ],
    {
      headers: {
        'Content-Type': 'application/json',
        // Android re-reads this when it verifies. An hour is long enough to
        // matter under load and short enough that a new signing key is live
        // the same morning it is added.
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}

export const dynamic = 'force-dynamic';
