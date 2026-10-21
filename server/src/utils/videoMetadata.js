const axios = require('axios');

const YT_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

function extractYoutubeId(url) {
  if (!url) return null;
  const match = String(url).match(YT_REGEX);
  return match ? match[1] : null;
}

function getYoutubeThumbnail(id) {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

async function fetchVideoMetadata(rawUrl) {
  const url = String(rawUrl || '').trim();
  const ytId = extractYoutubeId(url);

  let title = null;
  let speaker = null;
  let thumbnailUrl = ytId ? getYoutubeThumbnail(ytId) : null;
  let description = null;

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
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 3500,
      });
      const html = String(pageRes.data || '');
      const metaDesc = html.match(/meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
      if (metaDesc && metaDesc[1]) {
        description = metaDesc[1].trim().slice(0, 1000);
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
      }
    } catch (_) {}
  }

  return { title, speaker, thumbnailUrl, description };
}

module.exports = { extractYoutubeId, getYoutubeThumbnail, fetchVideoMetadata };
