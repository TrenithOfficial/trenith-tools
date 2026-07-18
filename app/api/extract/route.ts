import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";

export const runtime = "edge";

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus", "mpeg", "weba"];
const AUDIO_PATTERN = new RegExp(`\\.(${AUDIO_EXTENSIONS.join("|")})(?:[?#][^\\s\"'<>]*)?$`, "i");
const MAX_HTML_BYTES = 3_000_000;

function isPrivateHost(hostname: string) {
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

function validatePublicUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (isPrivateHost(url.hostname)) throw new Error("Private and local network addresses cannot be scanned.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports are supported.");
  return url;
}

async function fetchPublicUrl(initial: URL, init: RequestInit) {
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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function safeFilename(url: URL, index: number) {
  let name = decodeURIComponent(url.pathname.split("/").pop() || "").replace(/[\\/:*?\"<>|]/g, "-");
  if (!name || !AUDIO_PATTERN.test(name)) {
    const extension = url.pathname.match(AUDIO_PATTERN)?.[1]?.toLowerCase() || "mp3";
    name = `audio-${String(index + 1).padStart(3, "0")}.${extension}`;
  }
  return name.slice(0, 180);
}

function formatOf(url: URL) {
  return (url.pathname.match(AUDIO_PATTERN)?.[1] || "audio").toUpperCase();
}

function addCandidate(results: Map<string, URL>, candidate: string, base: URL) {
  if (!candidate || candidate.startsWith("data:") || candidate.startsWith("blob:")) return;
  try {
    const decoded = decodeHtml(candidate.trim());
    const url = new URL(decoded, base);
    if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) return;
    if (AUDIO_PATTERN.test(url.pathname + url.search)) results.set(url.href, url);
  } catch {
    // Ignore malformed source attributes.
  }
}

function extractTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).slice(0, 160) : fallback;
}

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(`extract:${clientKey(request.headers)}`, 30, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many scans from this connection. Please wait a few minutes." }, { status: 429 });
    }
    const body = await request.json();
    const target = validatePublicUrl(String(body?.url || ""));
    const direct = AUDIO_PATTERN.test(target.pathname + target.search);
    if (direct) {
      return NextResponse.json({
        title: safeFilename(target, 0),
        files: [{ url: target.href, name: safeFilename(target, 0), format: formatOf(target) }],
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const response = await fetchPublicUrl(target, {
      signal: controller.signal,
      headers: { "User-Agent": "TrenithToolsAudioScanner/1.0 (+public-media-discovery; https://trenith.com)" },
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("audio/")) {
      const finalUrl = validatePublicUrl(response.url || target.href);
      return NextResponse.json({ title: safeFilename(finalUrl, 0), files: [{ url: finalUrl.href, name: safeFilename(finalUrl, 0), format: formatOf(finalUrl) }] });
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) throw new Error("This URL is not an HTML page or recognized audio file.");

    const announcedSize = Number(response.headers.get("content-length") || 0);
    if (announcedSize > MAX_HTML_BYTES) throw new Error("This webpage is too large to scan safely.");
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const base = validatePublicUrl(response.url || target.href);
    const candidates = new Map<string, URL>();

    const attributePattern = /(?:src|href|content|data-src|data-url)\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(html))) addCandidate(candidates, match[1], base);

    const plainUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
    while ((match = plainUrlPattern.exec(html))) addCandidate(candidates, match[0], base);

    const urls = [...candidates.values()].slice(0, 500);
    if (!urls.length) throw new Error("No public audio files were found on this page. The media may be loaded privately, protected, or generated by a platform-specific player.");

    return NextResponse.json({
      title: extractTitle(html, base.hostname),
      files: urls.map((url, index) => ({ url: url.href, name: safeFilename(url, index), format: formatOf(url) })),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The source took too long to respond."
      : error instanceof Error ? error.message : "The source could not be scanned.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
