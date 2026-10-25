const axios = require('axios');

const YT_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

function extractYoutubeId(url) {
  if (!url) return null;
  const match = String(url).match(YT_REGEX);
  return match ? match[1] : null;
}

/**
 * Turn the entities an HTML attribute carries back into text.
 *
 * The description is read straight out of a meta tag, so an apostrophe
 * arrives as `&#39;` and an ampersand as `&amp;`. Written to the database
 * undecoded they render literally on the talk card - "you&#39;re talking".
 * `&amp;` is decoded last so that `&amp;#39;` does not become an apostrophe
 * on a second pass.
 */
function decodeEntities(value) {
  return String(value == null ? '' : value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function getYoutubeThumbnail(id) {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

function parseIsoDuration(str) {
  if (!str) return null;
  const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : null;
}

async function fetchVideoMetadata(rawUrl) {
  const url = String(rawUrl || '').trim();
  const ytId = extractYoutubeId(url);

  let title = null;
  let speaker = null;
  let thumbnailUrl = ytId ? getYoutubeThumbnail(ytId) : null;
  let description = null;
  let durationMins = null;

  if (ytId) {
    try {
      const oembedRes = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { timeout: 3500 }
      );
      if (oembedRes.data) {
        title = oembedRes.data.title || null;
        speaker = oembedRes.data.author_name || null;
        if (oembedRes.data.thumbnail_url) {
          thumbnailUrl = oembedRes.data.thumbnail_url;
        }
      }
    } catch (_) {}

    try {
      const pageRes = await axios.get(`https://www.youtube.com/watch?v=${ytId}`, {
        // A full desktop UA and an explicit language: without them YouTube is
        // free to answer with a stripped page in a language picked from the
        // caller's IP, which is how an Urdu site blurb ended up on a TED talk.
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 4500,
      });
      const html = String(pageRes.data || '');
      /**
       * The real description, not the SEO blurb.
       *
       * The watch page carries two of them. `<meta name="description">` is
       * built for search results and is cut to about 160 characters, so a
       * TED talk arrived as "Visit http://TED.com to get our entire library
       * of TED Talks..." and then stopped mid-sentence - which is what made
       * the seeded library look fabricated. `shortDescription`, inside the
       * player JSON the page ships to its own client, is the description the
       * uploader actually wrote: 1686 characters for the same talk.
       *
       * The meta tag stays as the fallback for the pages that arrive without
       * the player JSON.
       */
      const shortDesc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
      if (shortDesc && shortDesc[1]) {
        try {
          description = JSON.parse(`"${shortDesc[1]}"`).trim().slice(0, 2000);
        } catch (_) { /* fall through to the meta tag */ }
      }
      const lenSec = html.match(/["']lengthSeconds["']:\s*["']?(\d+)["']?/i);
      const approx = html.match(/["']approxDurationMs["']:\s*["']?(\d+)["']?/i);
      const iso = html.match(/itemprop=["']duration["']\s+content=["']([^"']+)["']/i);

      if (lenSec && lenSec[1]) {
        durationMins = Math.max(1, Math.round(Number(lenSec[1]) / 60));
      } else if (approx && approx[1]) {
        durationMins = Math.max(1, Math.round(Number(approx[1]) / 60000));
      } else if (iso && iso[1]) {
        durationMins = parseIsoDuration(iso[1]);
      }

      /**
       * The meta tag is a fallback, and only for a page that proved it is a
       * real watch page by carrying a duration.
       *
       * Asked for a video it will not serve us, YouTube answers with a
       * stripped page whose description is its own site-wide blurb - "Enjoy
       * the videos and music you love, upload original content..." - in
       * whatever language it decides the caller speaks. Stored unchecked that
       * is not a thin description, it is a fabricated one, identical on every
       * talk it happens to. An empty description an admin can fill in beats a
       * confident wrong one.
       */
      if (!description && durationMins) {
        const metaDesc = html.match(/meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
        if (metaDesc && metaDesc[1]) {
          description = decodeEntities(metaDesc[1]).trim().slice(0, 2000);
        }
      }
    } catch (_) {}
  } else if (/vimeo\.com/i.test(url)) {
    try {
      const vimeoRes = await axios.get(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
        { timeout: 3500 }
      );
      if (vimeoRes.data) {
        title = vimeoRes.data.title || null;
        speaker = vimeoRes.data.author_name || null;
        thumbnailUrl = vimeoRes.data.thumbnail_url || null;
        description = vimeoRes.data.description ? String(vimeoRes.data.description).slice(0, 1000) : null;
        if (vimeoRes.data.duration) {
          durationMins = Math.max(1, Math.round(Number(vimeoRes.data.duration) / 60));
        }
      }
    } catch (_) {}
  }

  return { title, speaker, thumbnailUrl, description, durationMins };
}

module.exports = { extractYoutubeId, getYoutubeThumbnail, parseIsoDuration, fetchVideoMetadata };
