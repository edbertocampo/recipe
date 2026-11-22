// Fetches what we can learn about a TikTok video: caption, author, thumbnail
// and (when TikTok provides them) the auto-generated subtitles, which often
// contain the spoken recipe. Everything here is best-effort: TikTok changes its
// page format often, so each source is optional and failures are swallowed.

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

const TIKTOK_URL_RE = /https?:\/\/(?:[\w-]+\.)*tiktok\.com\/[^\s"'<>]+/i;

// Only these hosts are ever fetched, so the server can't be used as an open proxy.
const ALLOWED_HOST_SUFFIXES = [
  "tiktok.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokv.com",
  "tiktokv.us",
  "byteoversea.com",
];

export function findTikTokUrl(text) {
  if (!text) return null;
  const match = String(text).match(TIKTOK_URL_RE);
  if (!match) return null;
  // Trim trailing punctuation that often sticks to shared links.
  return match[0].replace(/[).,!?]+$/, "");
}

export function isAllowedHost(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return ALLOWED_HOST_SUFFIXES.some(
      (s) => hostname === s || hostname.endsWith("." + s)
    );
  } catch {
    return false;
  }
}

async function safeFetch(url, { timeoutMs = 8000, ...init } = {}) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isAllowedHost(current)) throw new Error(`Blocked host: ${current}`);
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9", ...(init.headers || {}) },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

export function cleanVideoUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/@([^/]+)\/(?:video|photo)\/(\d+)/);
    if (m) return `https://www.tiktok.com/@${m[1]}/video/${m[2]}`;
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function parseRehydrationData(html) {
  const m = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    const item =
      data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    return item || null;
  } catch {
    return null;
  }
}

export function vttToText(vtt) {
  const lines = String(vtt)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        l !== "WEBVTT" &&
        !/^\d+$/.test(l) &&
        !/-->/.test(l) &&
        !/^(NOTE|STYLE|Kind:|Language:)/.test(l)
    )
    .map((l) => l.replace(/<[^>]+>/g, ""));
  // Auto captions repeat lines; drop consecutive duplicates.
  const out = [];
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l);
  return out.join(" ");
}

async function fetchSubtitles(item) {
  const subs = item?.video?.subtitleInfos;
  if (!Array.isArray(subs) || subs.length === 0) return "";
  const pick =
    subs.find((s) => /^en/i.test(s.LanguageCodeName || "")) || subs[0];
  if (!pick?.Url || !isAllowedHost(pick.Url)) return "";
  try {
    const { res } = await safeFetch(pick.Url, { timeoutMs: 6000 });
    if (!res.ok) return "";
    return vttToText(await res.text()).slice(0, 20000);
  } catch {
    return "";
  }
}

async function fetchOEmbed(url) {
  try {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const { res } = await safeFetch(endpoint, { timeoutMs: 6000 });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {string} inputUrl a TikTok link (full or vm./vt. short link)
 * @returns {Promise<{url:string, caption:string, author:string, authorUrl:string, thumbnail:string, transcript:string, durationSec:number|null}>}
 */
export async function getTikTokInfo(inputUrl) {
  const info = {
    url: inputUrl,
    caption: "",
    author: "",
    authorUrl: "",
    thumbnail: "",
    transcript: "",
    durationSec: null,
  };

  // 1. Resolve short links and load the page (for description + subtitles).
  let item = null;
  try {
    const { res, finalUrl } = await safeFetch(inputUrl);
    info.url = cleanVideoUrl(finalUrl);
    if (res.ok) item = parseRehydrationData(await res.text());
  } catch {
    // ignore; oEmbed below may still work
  }

  if (item) {
    info.caption = item.desc || "";
    info.author = item.author?.uniqueId || "";
    info.thumbnail = item.video?.cover || item.video?.originCover || "";
    info.durationSec = item.video?.duration ?? null;
  }

  // 2. oEmbed is TikTok's official endpoint and the most stable source.
  const [oembed, transcript] = await Promise.all([
    fetchOEmbed(info.url),
    fetchSubtitles(item),
  ]);
  if (oembed) {
    if (!info.caption || (oembed.title && oembed.title.length > info.caption.length)) {
      info.caption = oembed.title || info.caption;
    }
    info.author = info.author || oembed.author_unique_id || oembed.author_name || "";
    info.authorUrl = oembed.author_url || "";
    info.thumbnail = info.thumbnail || oembed.thumbnail_url || "";
  }
  if (info.author && !info.authorUrl) info.authorUrl = `https://www.tiktok.com/@${info.author}`;
  info.transcript = transcript;
  return info;
}
