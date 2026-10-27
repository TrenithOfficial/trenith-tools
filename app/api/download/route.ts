import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";

// Node/Fluid runtime rather than Edge: this proxy can stream up to a 2 GB file,
// which outgrows Edge's streaming limits, and maxDuration gives a slow source
// room to complete.
export const runtime = "nodejs";
export const maxDuration = 300;

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
// Extensionless sources (podcast players, <audio src="/stream?id=…">, og:audio)
// are allowed through; the response's Content-Type decides whether it was
// audio at all, so this proxy still never relays arbitrary web pages.
function validateAudioUrl(input: string) {
  return validateNetworkTarget(input);
}

const AUDIO_MIME = /^audio\/|^application\/(ogg|x-mpegurl|octet-stream)$|^video\/(webm|mp4|ogg)$/i;

function isAudioResponse(response: Response, finalUrl: URL) {
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (/^audio\//.test(type)) return true;
  if (AUDIO_PATTERN.test(finalUrl.pathname + finalUrl.search)) return !type || AUDIO_MIME.test(type);
  return false;
}

// A caller-suggested filename is used only for the Content-Disposition header,
// after the same hardening as the URL-derived name, and only with an audio
// extension so a crafted name cannot turn the download into a script file.
function suggestedName(raw: string | null, fallback: string, type: string) {
  const cleaned = safeDecode(raw || "").replace(/[\\/:*?"<>|]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
  if (!cleaned) return fallback;
  if (AUDIO_PATTERN.test(cleaned)) return cleaned;
  const extension = type.match(/^audio\/(?:x-)?([a-z0-9]+)/i)?.[1]?.replace(/^mpeg$/i, "mp3").replace(/^mp4$/i, "m4a") || fallback.match(AUDIO_PATTERN)?.[1] || "mp3";
  return `${cleaned}.${extension}`;
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
    if (!isAudioResponse(response, finalUrl)) throw new Error("The source did not return an audio file.");
    const type = response.headers.get("content-type") || "application/octet-stream";
    // Strip control characters as well as separator characters so a crafted
    // path can never inject additional response-header content.
    const derived = safeDecode(finalUrl.pathname.split("/").pop() || "").replace(/[\\/:*?\"<>|]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "");
    const filename = suggestedName(request.nextUrl.searchParams.get("name"), AUDIO_PATTERN.test(derived) ? derived : suggestedName(derived || "audio", "audio.mp3", type), type);

    return new NextResponse(cappedStream(response.body, MAX_PROXY_BYTES), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${filename.slice(0, 180)}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Download failed." }, { status: 400 });
  }
}
