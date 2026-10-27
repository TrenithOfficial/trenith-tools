import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";
import { AUDIO_PATTERN, MAX_HTML_BYTES, PLATFORM_MESSAGE, addCandidate, addDeclaredAudio, episodeFilename, extractTitle, fetchPublicUrl, formatOf, parseFeed, platformOf, publicUrl, safeFilename, validatePublicUrl, type Candidate } from "../../../lib/public-source";

// Node/Fluid runtime rather than Edge so the streamed, size-capped page scan has
// a configurable duration budget for slow sources.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(`extract:${clientKey(request.headers)}`, 30, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many scans from this connection. Please wait a few minutes." }, { status: 429 });
    }
    const body = await request.json();
    const target = validatePublicUrl(String(body?.url || ""));
    const platform = platformOf(target.hostname);
    if (platform) return NextResponse.json({ error: PLATFORM_MESSAGE(platform), platform }, { status: 422 });
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
    const isFeed = /xml|rss|atom/i.test(contentType) || /\.(rss|xml|atom)(\?|$)/i.test(target.pathname);
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml") && !isFeed) throw new Error("This URL is not an HTML page, podcast feed or recognized audio file.");

    const announcedSize = Number(response.headers.get("content-length") || 0);
    if (announcedSize > MAX_HTML_BYTES) throw new Error("This webpage is too large to scan safely.");
    // Stream the body and stop once the cap is reached, rather than buffering the
    // whole (possibly unbounded, Content-Length-less) response into memory first.
    let html = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (received >= MAX_HTML_BYTES) { await reader.cancel().catch(() => undefined); break; }
      }
      html += decoder.decode();
      html = html.slice(0, MAX_HTML_BYTES);
    } else {
      html = (await response.text()).slice(0, MAX_HTML_BYTES);
    }
    const base = validatePublicUrl(response.url || target.href);
    const feed = parseFeed(html, base);
    if (feed) {
      return NextResponse.json({
        title: feed.title,
        kind: "feed",
        files: feed.files.slice(0, 500).map((candidate, index) => ({ url: candidate.url.href, name: episodeFilename(candidate, index), format: formatOf(candidate.url, candidate.mime), title: candidate.title })),
      });
    }
    const candidates = new Map<string, Candidate>();
    addDeclaredAudio(candidates, html, base);

    const attributePattern = /(?:src|href|content|data-src|data-url)\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(html))) addCandidate(candidates, match[1], base);

    const plainUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
    while ((match = plainUrlPattern.exec(html))) addCandidate(candidates, match[0], base);

    const found = [...candidates.values()].slice(0, 500);
    if (!found.length) {
      const feedLink = html.match(/<link\b[^>]*type\s*=\s*["']application\/(?:rss|atom)\+xml["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1] || html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']application\/(?:rss|atom)\+xml["']/i)?.[1];
      const hint = feedLink && publicUrl(feedLink, base) ? ` This page advertises a feed at ${publicUrl(feedLink, base)!.href} — paste that URL to list its episodes.` : "";
      throw new Error(`No public audio files were found on this page. It may load media privately, through a platform-specific player or behind a login.${hint}`);
    }

    return NextResponse.json({
      title: extractTitle(html, base.hostname),
      kind: "page",
      files: found.map((candidate, index) => ({ url: candidate.url.href, name: safeFilename(candidate.url, index), format: formatOf(candidate.url, candidate.mime), title: candidate.title })),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The source took too long to respond."
      : error instanceof Error ? error.message : "The source could not be scanned.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
