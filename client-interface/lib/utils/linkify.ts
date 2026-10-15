/**
 * Turn the URLs inside plain text into clickable parts.
 *
 * Announcements are written in a plain textarea, so a mentor pasting a WhatsApp
 * group link posted a wall of unclickable characters that everyone had to
 * select by hand. This splits the text so React can render the links as links —
 * no `dangerouslySetInnerHTML`, so nothing in the text can become markup.
 */

export type TextPart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string };

// Deliberately conservative: an explicit scheme, or a bare `www.` host. Stops
// at whitespace, and trailing sentence punctuation is handed back as text so
// "see https://x.com/a." does not produce a link ending in a full stop.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

export function linkify(text: string): TextPart[] {
  if (!text) return [];
  const parts: TextPart[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];

    // Give back any punctuation that belongs to the sentence, not the URL.
    const trailing = raw.match(TRAILING)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, -trailing.length);
    if (!raw) continue;

    if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) });
    parts.push({ kind: 'link', value: raw, href: raw.startsWith('www.') ? `https://${raw}` : raw });
    if (trailing) parts.push({ kind: 'text', value: trailing });
    last = start + match[0].length;
  }

  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

/** A URL short enough to read in a line of body text. */
export function shortenUrl(url: string, max = 48): string {
  const bare = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return bare.length <= max ? bare : `${bare.slice(0, max - 1)}…`;
}
