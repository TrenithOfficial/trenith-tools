import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";

export const runtime = "edge";

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

const MAX_PROXY_BYTES = 2 * 1024 * 1024 * 1024;

const AUDIO_PATTERN = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|mpeg|weba)(?:[?#].*)?$/i;

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::" || host === "::1" || host === "0.0.0.0" || host.startsWith("::ffff:") || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host) || /^127\.|^10\.|^192\.168\.|^169\.254\.|^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || (() => { const match = host.match(/^172\.(\d+)\./); return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31); })();
}

// SSRF/network safety only — no audio-extension gate. Applied to every URL we
// fetch, including redirect targets.
function validateNetworkTarget(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isPrivateHost(url.hostname) || (url.port && !["80", "443"].includes(url.port))) throw new Error("Unsupported audio URL.");
  return url;
}

// The user-supplied URL must still look like an audio file; redirect targets do
// not, because CDNs commonly 302 an .mp3 link to a presigned, extensionless URL
// (S3/CloudFront, podcast trackers). Re-imposing the extension gate on those
// hops made the scanner list files that this proxy then refused to download.
function validateAudioUrl(input: string) {
  const url = validateNetworkTarget(input);
  if (!AUDIO_PATTERN.test(url.pathname + url.search)) throw new Error("Unsupported audio URL.");
  return url;
}

// Enforce the size limit on the bytes actually streamed. A source can omit or
// understate Content-Length, so trusting the header alone leaves the proxy
// relaying an unbounded amount of data.
function cappedStream(source: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.close(); return; }
      sent += value.byteLength;
      if (sent > limit) {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error("The audio source exceeded the download proxy size limit."));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) { void reader.cancel(reason); },
  });
}

async function fetchPublicAudio(initial: URL) {
  let current = initial;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    // Bound the wait for response headers only. The timer is cleared as soon as
    // they arrive so a large but healthy transfer is never cut off mid-body.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(current.href, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "TrenithToolsAudioDownloader/1.0 (+https://trenith.com)" } });
    } finally {
      clearTimeout(timer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("The audio source returned an invalid redirect.");
    current = validateNetworkTarget(new URL(location, current).href);
  }
  throw new Error("The audio source returned too many redirects.");
}

export async function GET(request: NextRequest) {
  try {
    if (!allowRequest(`download:${clientKey(request.headers)}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many downloads from this connection. Please wait a few minutes." }, { status: 429 });
    }
    const input = request.nextUrl.searchParams.get("url");
    if (!input) throw new Error("Missing audio URL.");
    const url = validateAudioUrl(input);

    const response = await fetchPublicAudio(url);
    if (!response.ok || !response.body) throw new Error("The audio source is unavailable.");
    const announced = Number(response.headers.get("content-length") || 0);
    if (announced > MAX_PROXY_BYTES) throw new Error("The source file is larger than the download proxy allows.");
    const finalUrl = new URL(response.url || url.href);
    if (isPrivateHost(finalUrl.hostname)) throw new Error("The audio source redirected to a private address.");
    // Strip control characters as well as separator characters so a crafted
    // path can never inject additional response-header content.
    const filename = safeDecode(finalUrl.pathname.split("/").pop() || "audio.mp3").replace(/[\\/:*?\"<>|]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "");

    return new NextResponse(cappedStream(response.body, MAX_PROXY_BYTES), {
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.slice(0, 180)}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Download failed." }, { status: 400 });
  }
}
