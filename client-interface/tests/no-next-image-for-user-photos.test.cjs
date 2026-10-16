/**
 * A profile photo must never go through `next/image`.
 *
 * `next/image` validates its `src` against the `images.remotePatterns` list in
 * next.config.js and **throws during render** when the host is not there. A
 * throw in render is not a broken picture — it is a broken page: the whole
 * Messages screen went to "Something went wrong" because one person's avatar
 * was hosted somewhere the config had never heard of. Only
 * `res.cloudinary.com` is configured, so every other avatar host there has
 * ever been — an OAuth provider's CDN, a Gravatar, anything a migration left
 * behind — is a page-level crash waiting for the right row.
 *
 * `components/shared/Avatar.tsx` is the answer: a plain <img> that falls back
 * to initials when the URL fails, which is what a broken photo deserves. This
 * guards the cleanup, because the failure only shows up for the one user whose
 * photo lives on the wrong host.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

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

test('no component imports next/image', () => {
  const offenders = files.filter((rel) =>
    /from\s+['"]next\/image['"]/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));

  assert.deepEqual(offenders, [],
    `next/image throws in render for a host missing from next.config.js, which takes the whole page down. `
    + `Use components/shared/Avatar for people, or a plain <img> with an onError fallback. Found in:\n  `
    + offenders.join('\n  '));
});

test('Avatar still falls back when the photo will not load', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'shared', 'Avatar.tsx'), 'utf8');
  assert.match(src, /onError=/, 'Avatar must handle a photo that fails to load');
  assert.doesNotMatch(src, /next\/image/, 'Avatar is the fallback — it cannot be the crash');
});

/**
 * …and nothing renders a profile photo by hand either.
 *
 * Six screens had their own `profilePictureUrl ? <img> : initials` block, each
 * with its own diameter (26px, 32px, 36px, 44px, 56px), its own fallback
 * colour, and — in four of the six — no `onError`, so one dead Cloudinary URL
 * showed as a black disc. The sizes were not a design decision; they were six
 * people each picking a number. `Avatar` has five, and a `muted` tone for
 * somebody who has paused, which is what the last fork was really after.
 */
test('no component hand-rolls a profile photo', () => {
  const offenders = files.filter((rel) => {
    if (rel === path.join('components', 'shared', 'Avatar.tsx')) return false;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // An <img> whose src is a person's photo — on one line or split over several.
    return /<img[^>]{0,400}(profilePictureUrl|avatarUrl)/s.test(src);
  });

  assert.deepEqual(offenders, [],
    'Use `Avatar` from components/shared/Avatar (name / src / initials / size / tone / href). '
    + 'A hand-rolled one picks its own diameter and usually forgets onError, so a dead photo '
    + 'URL renders as a black disc. Found in:\n  '
    + offenders.join('\n  '));
});

test('the muted tone is what the paused fork was doing by hand', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'shared', 'Avatar.tsx'), 'utf8');
  assert.match(src, /grayscale/, 'a muted photo must desaturate');
  assert.match(src, /muted \? 'bg-slate-100 text-slate-500/, 'muted initials must drop to slate');
  // The fork it replaced recoloured both the photo and the fallback; if only
  // one branch takes the tone, a paused mentee with a photo looks active.
  assert.match(src, /\$\{photoTone\}/, 'the photo branch must take the tone');
  assert.match(src, /\$\{fallbackTone\}/, 'the initials branch must take the tone');
});
