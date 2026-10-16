/**
 * One page, one key.
 *
 * The page-view log already had rows in it before anything read them, and they
 * were useless: `/mentee/step/ab22ddfd-…` and `/mentee/step/1039f7e2-…` counted
 * as two different features, each used once, while the thing anybody actually
 * wanted to know — "does anybody open a roadmap step?" — was spread over as
 * many rows as there are steps. The workspace slug did the same to every path
 * twice over.
 *
 * So a page is identified by its shape, not its URL. The same function runs on
 * the way in (the client, before it sends) and on the way out (the server, in
 * SQL, so rows written before this existed are folded too) — if the two ever
 * disagree, the join in the admin report silently loses rows, which is why
 * there is a test holding them to the same examples.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque enough to be an identifier rather than a page: a long hex/number run. */
function isIdLike(segment: string): boolean {
  if (UUID.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  return /^[0-9a-f]{16,}$/i.test(segment);
}

export function pageKey(pathname: string): string {
  if (!pathname) return '/';
  // Query and hash describe a view of the page, not a different page.
  let path = pathname.split('?')[0].split('#')[0];
  // Everything lives under a workspace; the slug is which org, not which page.
  path = path.replace(/^\/w\/[^/]+/, '');
  const segments = path.split('/').filter(Boolean).map((s) => (isIdLike(s) ? ':id' : s));
  const key = `/${segments.join('/')}`;
  return key === '/' ? '/' : key.replace(/\/$/, '');
}

/**
 * Which role's surface a page belongs to — the first segment, because that is
 * how the whole app is routed. Anything else is shared (settings, chat).
 */
export function pageRole(key: string): 'admin' | 'mentor' | 'mentee' | 'shared' {
  const first = key.split('/')[1];
  if (first === 'admin' || first === 'mentor' || first === 'mentee') return first;
  return 'shared';
}
