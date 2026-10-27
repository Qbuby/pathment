import { NextResponse } from 'next/server';

/**
 * Served at /.well-known/apple-app-site-association (see next.config.ts) — iOS universal links.
 *
 * The same job as assetlinks.json, for the other platform: iOS reads this when
 * the app is installed and again periodically, and only then does a tap on a
 * link in Mail open Pathment instead of Safari. Served with no file extension
 * and as application/json, which is what iOS requires.
 *
 * `IOS_APP_IDS` is one or more `<TEAM ID>.me.pathment.app`, comma separated.
 * The paths are the five link kinds and nothing else, so a marketing page on
 * the same host still opens in the browser.
 */
const PATHS = ['/i/*', '/r/*', '/v/*', '/m/*', '/g/*'];

const appIds = () =>
  (process.env.IOS_APP_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(value));

export async function GET() {
  const ids = appIds();
  if (ids.length === 0) return new NextResponse('Not found', { status: 404 });

  return NextResponse.json(
    {
      applinks: {
        details: ids.map((appID) => ({ appID, paths: PATHS })),
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}

export const dynamic = 'force-dynamic';
