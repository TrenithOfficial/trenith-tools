// Pure helpers for the public-source audio scanner (no framework imports so
// they can be unit-tested in Node). The route in app/api/extract wires them to
// the request/response cycle.

export function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus", "mpeg", "weba"];
export const AUDIO_PATTERN = new RegExp(`\\.(${AUDIO_EXTENSIONS.join("|")})(?:[?#][^\\s\"'<>]*)?$`, "i");
export const MAX_HTML_BYTES = 3_000_000;

// Streaming platforms never expose a downloadable audio file: playback is
// chunked, encrypted or served through a player API, and their terms forbid
// downloading. Saying so up front beats a generic "nothing found" (the first
// real feedback this tool received was exactly that confusion).
export const PLATFORMS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|music\.youtube\.com)$/i, name: "YouTube" },
  { pattern: /(^|\.)spotify\.com$/i, name: "Spotify" },
  { pattern: /(^|\.)soundcloud\.com$/i, name: "SoundCloud" },
  { pattern: /(^|\.)(music\.apple\.com|podcasts\.apple\.com)$/i, name: "Apple Music / Apple Podcasts" },
  { pattern: /(^|\.)(music\.amazon\.[a-z.]+|amazon\.[a-z.]+)$/i, name: "Amazon Music" },
  { pattern: /(^|\.)(instagram\.com|facebook\.com|fb\.watch|threads\.net)$/i, name: "Instagram / Facebook" },
  { pattern: /(^|\.)tiktok\.com$/i, name: "TikTok" },
  { pattern: /(^|\.)(twitter\.com|x\.com)$/i, name: "X" },
  { pattern: /(^|\.)(netflix\.com|primevideo\.com|hotstar\.com|disneyplus\.com|hulu\.com)$/i, name: "a video streaming service" },
  { pattern: /(^|\.)(jiosaavn\.com|gaana\.com|wynk\.in|hungama\.com|deezer\.com|tidal\.com|pandora\.com|audible\.com|audible\.[a-z]+)$/i, name: "a music streaming service" },
];

export function platformOf(hostname: string) {
  return PLATFORMS.find((platform) => platform.pattern.test(hostname))?.name || null;
}

export const PLATFORM_MESSAGE = (name: string) => `${name} does not publish direct audio files: playback is streamed through its own player and downloading is against its terms, so there is nothing here to discover. This tool finds audio that a page openly links to — direct MP3/M4A/OGG/FLAC links, HTML5 <audio> players, podcast RSS feeds and open directories.`;

export function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
  if (host.startsWith("::ffff:") || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^169\.254\./.test(host) || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return false;
}

export function validatePublicUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (isPrivateHost(url.hostname)) throw new Error("Private and local network addresses cannot be scanned.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports are supported.");
  return url;
}

export async function fetchPublicUrl(initial: URL, init: RequestInit) {
  let current = initial;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(current.href, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("The source returned an invalid redirect.");
    current = validatePublicUrl(new URL(location, current).href);
  }
  throw new Error("The source returned too many redirects.");
}

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function safeFilename(url: URL, index: number) {
  let name = safeDecode(url.pathname.split("/").pop() || "").replace(/[\\/:*?\"<>|]/g, "-");
  if (!name || !AUDIO_PATTERN.test(name)) {
    const extension = url.pathname.match(AUDIO_PATTERN)?.[1]?.toLowerCase() || "mp3";
    name = `audio-${String(index + 1).padStart(3, "0")}.${extension}`;
  }
  return name.slice(0, 180);
}

export function formatOf(url: URL, mime?: string) {
  const byExtension = url.pathname.match(AUDIO_PATTERN)?.[1];
  if (byExtension) return byExtension.toUpperCase();
  const byMime = mime?.match(/^audio\/(?:x-)?([a-z0-9.+-]+)/i)?.[1];
  return (byMime ? byMime.replace(/^mpeg$/i, "mp3").replace(/^mp4$/i, "m4a") : "audio").toUpperCase();
}

export type Candidate = { url: URL; mime?: string; title?: string };

export function publicUrl(candidate: string, base: URL): URL | null {
  if (!candidate || candidate.startsWith("data:") || candidate.startsWith("blob:")) return null;
  try {
    const url = new URL(decodeHtml(candidate.trim()), base);
    if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null; // malformed source attribute
  }
}

export function addCandidate(results: Map<string, Candidate>, candidate: string, base: URL, extra: { mime?: string; title?: string; trusted?: boolean } = {}) {
  const url = publicUrl(candidate, base);
  if (!url) return;
  // Extensionless player sources (/stream?id=…) count when the page itself
  // declares them as audio; plain links still need a recognizable extension.
  if (!AUDIO_PATTERN.test(url.pathname + url.search) && !(extra.trusted || extra.mime?.startsWith("audio/"))) return;
  if (!results.has(url.href)) results.set(url.href, { url, mime: extra.mime, title: extra.title });
}

// <audio src>, <audio><source src type="audio/…">, <meta property="og:audio">
// and <link rel="enclosure"> are declared by the page as playable audio, so
// they qualify even without a file extension.
export function addDeclaredAudio(results: Map<string, Candidate>, html: string, base: URL) {
  const audioTags = html.match(/<audio\b[^>]*>[\s\S]*?<\/audio>|<audio\b[^>]*\/?>/gi) || [];
  for (const tag of audioTags) {
    const direct = tag.match(/<audio\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (direct) addCandidate(results, direct, base, { trusted: true });
    const sources = tag.match(/<source\b[^>]*>/gi) || [];
    for (const source of sources) {
      const src = source.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
      const mime = source.match(/\stype\s*=\s*["']([^"']+)["']/i)?.[1];
      if (src && (!mime || /^audio\//i.test(mime))) addCandidate(results, src, base, { mime, trusted: true });
    }
  }
  const metaPattern = /<meta\b[^>]*property\s*=\s*["']og:audio(?::url|:secure_url)?["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>|<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:audio(?::url|:secure_url)?["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaPattern.exec(html))) addCandidate(results, match[1] || match[2], base, { trusted: true });
  const enclosurePattern = /<link\b[^>]*rel\s*=\s*["']enclosure["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = enclosurePattern.exec(html))) addCandidate(results, match[1], base, { trusted: true });
}

// Podcast RSS and Atom feeds list every episode as an <enclosure> (or
// <media:content>) with a MIME type. They are the single most common public
// audio source on the web, so a feed URL is a first-class input here.
export function parseFeed(xml: string, base: URL): { title: string; files: Candidate[] } | null {
  if (!/<(rss|feed|channel)\b/i.test(xml.slice(0, 4000))) return null;
  const title = decodeHtml(xml.match(/<(?:channel|feed)\b[^>]*>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").trim().slice(0, 160);
  const items = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  const results = new Map<string, Candidate>();
  for (const item of items) {
    const itemTitle = decodeHtml(item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim().slice(0, 120);
    const enclosures = item.match(/<(?:enclosure|media:content|link)\b[^>]*>/gi) || [];
    for (const tag of enclosures) {
      const url = tag.match(/\s(?:url|href)\s*=\s*["']([^"']+)["']/i)?.[1];
      const mime = tag.match(/\stype\s*=\s*["']([^"']+)["']/i)?.[1];
      const isEnclosureLink = /<link\b/i.test(tag) ? /rel\s*=\s*["']enclosure["']/i.test(tag) : true;
      if (!url || !isEnclosureLink) continue;
      if (mime && !/^audio\//i.test(mime) && !AUDIO_PATTERN.test(url)) continue;
      if (!mime && !AUDIO_PATTERN.test(url)) continue;
      addCandidate(results, url, base, { mime, title: itemTitle, trusted: Boolean(mime) });
    }
  }
  if (!results.size) return null;
  return { title: title || base.hostname, files: [...results.values()] };
}

export function episodeFilename(candidate: Candidate, index: number) {
  const fallback = safeFilename(candidate.url, index);
  if (!candidate.title) return fallback;
  const extension = (candidate.url.pathname.match(AUDIO_PATTERN)?.[1] || formatOf(candidate.url, candidate.mime)).toLowerCase();
  const stem = candidate.title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  return stem ? `${stem}.${extension}` : fallback;
}

export function extractTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).slice(0, 160) : fallback;
}

